"""In-memory case store.

Deliberately behind an interface: the Cosmos DB implementation swaps in here
without touching the API layer. Everything is keyed by email_id, which is also
the Cosmos partition key, so a case is always a single-partition read.
"""

from __future__ import annotations

from collections import Counter

from pipeline.schemas import AuditEvent, Case, CaseDecision, Correction, ReviewItem


class MemoryStore:
    def __init__(self) -> None:
        self.cases: dict[str, Case] = {}
        self.reviews: dict[str, ReviewItem] = {}
        self.corrections: dict[str, Correction] = {}
        self.events: dict[str, list[AuditEvent]] = {}
        self.decisions: dict[str, CaseDecision] = {}
        self._revision = 0

    @property
    def revision(self) -> int:
        """Monotonic data version used to invalidate derived report caches."""
        return self._revision

    def _touch(self) -> None:
        self._revision += 1

    # -- cases ------------------------------------------------------------
    def put_case(self, case: Case) -> None:
        self.cases[case.email_id] = case
        self._touch()

    def get_case(self, email_id: str) -> Case | None:
        return self.cases.get(email_id)

    def list_cases(
        self,
        *,
        category: str | None = None,
        status: str | None = None,
        lifecycle: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Case], int]:
        items = [
            c
            for c in self.cases.values()
            if (category is None or c.category == category)
            and (status is None or c.status == status)
            and (lifecycle is None or c.lifecycle == lifecycle)
        ]
        items.sort(key=lambda c: c.email_id)
        return items[offset : offset + limit], len(items)

    # -- review queue ------------------------------------------------------
    def put_reviews(self, items: list[ReviewItem]) -> None:
        for item in items:
            self.reviews[item.id] = item
        if items:
            self._touch()

    def replace_reviews(self, email_id: str, items: list[ReviewItem]) -> None:
        self.reviews = {
            review_id: item
            for review_id, item in self.reviews.items()
            if item.email_id != email_id
        }
        self.put_reviews(items)
        if not items:
            self._touch()

    def list_reviews(self, state: str | None = "open", limit: int = 50) -> list[ReviewItem]:
        items = [r for r in self.reviews.values() if state is None or r.state == state]
        items.sort(key=lambda r: r.id)
        return items[:limit]

    def get_review(self, review_id: str) -> ReviewItem | None:
        return self.reviews.get(review_id)

    def put_review(self, item: ReviewItem) -> None:
        self.reviews[item.id] = item
        self._touch()

    def delete_review(self, review_id: str) -> None:
        if self.reviews.pop(review_id, None) is not None:
            self._touch()

    def put_correction(self, correction: Correction) -> None:
        self.corrections[correction.id] = correction
        self._touch()

    def add_event(self, event: AuditEvent) -> None:
        self.events.setdefault(event.email_id, []).append(event)
        self._touch()

    def list_events(self, email_id: str) -> list[AuditEvent]:
        return sorted(self.events.get(email_id, []), key=lambda event: event.seq)

    def next_event_seq(self, email_id: str) -> int:
        items = self.events.get(email_id, [])
        return (max((event.seq for event in items), default=0) // 10 + 1) * 10

    def get_decision(self, email_id: str) -> CaseDecision | None:
        return self.decisions.get(email_id)

    def put_decision(self, decision: CaseDecision) -> None:
        self.decisions[decision.email_id] = decision
        self._touch()

    def delete_decision(self, email_id: str) -> None:
        if self.decisions.pop(email_id, None) is not None:
            self._touch()

    def open_count(self) -> int:
        return sum(1 for r in self.reviews.values() if r.state == "open")

    # -- metrics -----------------------------------------------------------
    def metrics(self) -> dict:
        cases = list(self.cases.values())
        total = len(cases)
        comparisons = [c for c in cases if c.category == "BL_COMPARISON"]
        defects = [c for c in cases if c.has_defect]
        auto_cleared = [c for c in comparisons if c.status == "OK"]
        issue_counts = Counter()
        for case in cases:
            reasons = set(case.escalation_reasons)
            if "MISSING_ATTACHMENT" in reasons:
                issue_counts["Missing attachment"] += 1
            if "WRONG_DOC_TYPE" in reasons:
                issue_counts["Wrong document type"] += 1
            if "UNREADABLE_DOCUMENT" in reasons:
                issue_counts["Unreadable document"] += 1
            if reasons.intersection({"FIELD_NOT_FOUND", "GROUNDING_FAILED", "LOW_CONFIDENCE"}):
                issue_counts["Missing or uncertain field"] += 1
            if set(case.defect_fields).intersection({"shipper", "consignee", "notify_party"}):
                issue_counts["Party mismatch"] += 1

        documents = [document for case in cases for document in case.documents]
        parsed_documents = [document for document in documents if document.fields is not None]
        processing_times = [
            case.timings_ms.get("total") for case in cases
            if case.timings_ms.get("total") is not None
        ]
        return {
            "total_emails": total,
            "by_category": dict(Counter(c.category for c in cases)),
            "by_status": dict(Counter(c.status for c in cases)),
            "mismatch_rate": round(len(defects) / len(comparisons), 4) if comparisons else 0.0,
            "review_queue_open": self.open_count(),
            "automatically_cleared": len(auto_cleared),
            "human_reviews": sum(1 for c in comparisons if c.status == "NEEDS_REVIEW"),
            "rejected": sum(1 for decision in self.decisions.values() if decision.action == "reject"),
            "avg_processing_ms": round(sum(processing_times) / len(processing_times), 1)
            if processing_times else None,
            "top_flagged_issues": [
                {"label": label, "count": count}
                for label, count in issue_counts.most_common(5)
            ],
            "avg_fields_flagged": round(
                sum(len(c.defect_fields) for c in defects) / len(defects), 2
            )
            if defects
            else 0.0,
            "rule_pct": round(
                sum(1 for c in cases if c.decided_by == "rule") / total, 4
            )
            if total
            else 0.0,
            "parser_pct": round(
                sum(
                    1
                    for d in parsed_documents
                )
                / max(1, len(documents)),
                4,
            ),
            "llm_calls": sum(1 for c in cases if c.decided_by == "llm"),
            # 4 minutes is the manual side-by-side check these cases replace.
            "est_minutes_saved": round(len(auto_cleared) * 4, 1),
        }


STORE = MemoryStore()
