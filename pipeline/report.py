"""Stage 7 — decide, and emit the submission record.

Every invariant in docs/contracts.md §4 is asserted here, before the record
leaves the pipeline. A shape error at this boundary is a silent scoring loss
downstream, so it fails loudly instead.
"""

from __future__ import annotations

from pipeline.schemas import (
    Case,
    EscalationReason,
    FieldComparison,
    WireReviewReason,
)

# Document-level problems outrank field-level ones.
_WIRE_PRECEDENCE: list[WireReviewReason] = [
    "missing_attachment",
    "wrong_doc_type",
    "unreadable",
    "missing_value",
]

_INTERNAL_TO_WIRE: dict[str, WireReviewReason] = {
    "MISSING_ATTACHMENT": "missing_attachment",
    "WRONG_DOC_TYPE": "wrong_doc_type",
    "UNREADABLE_DOCUMENT": "unreadable",
    "PROCESSING_ERROR": "unreadable",
    "FIELD_NOT_FOUND": "missing_value",
    "GROUNDING_FAILED": "missing_value",
    "LOW_CONFIDENCE": "missing_value",
    "BORDERLINE_MATCH": "missing_value",
}


def to_wire_reason(reasons: list[EscalationReason]) -> WireReviewReason | None:
    if not reasons:
        return None
    mapped = {_INTERNAL_TO_WIRE[r] for r in reasons if r in _INTERNAL_TO_WIRE}
    for candidate in _WIRE_PRECEDENCE:
        if candidate in mapped:
            return candidate
    return None


def decide(
    comparisons: list[FieldComparison],
    document_escalations: list[EscalationReason],
) -> tuple[str, list[str], list[EscalationReason]]:
    """Return (status, defect_fields, escalation_reasons)."""
    reasons: list[EscalationReason] = list(document_escalations)

    if document_escalations:
        return "NEEDS_REVIEW", [], reasons

    confident_mismatches = [
        c.field for c in comparisons
        if c.verdict == "MISMATCH" and c.confidence.hard_fail is None
    ]

    for c in comparisons:
        if c.verdict == "ABSENT":
            reasons.append("FIELD_NOT_FOUND")
        elif c.verdict == "REVIEW":
            reasons.append("BORDERLINE_MATCH")
        elif c.confidence.hard_fail is not None:
            reasons.append(c.confidence.hard_fail)

    # Precedence: a confident mismatch beats an uncertain neighbour. Escalating
    # a real mismatch converts a caught defect into a miss, which is the one
    # escalation that costs score. The uncertain fields still raise review
    # items; they just don't change the case status.
    if confident_mismatches:
        return "MISMATCH", sorted(confident_mismatches), reasons

    if reasons:
        return "NEEDS_REVIEW", [], reasons

    return "OK", [], []


def assert_invariants(case: Case) -> None:
    assert case.has_defect == (case.status == "MISMATCH"), (
        f"{case.email_id}: has_defect must be True iff status == MISMATCH"
    )
    assert bool(case.defect_fields) == case.has_defect, (
        f"{case.email_id}: defect_fields non-empty iff has_defect"
    )
    if case.status == "NEEDS_REVIEW":
        assert not case.has_defect and not case.defect_fields, (
            f"{case.email_id}: NEEDS_REVIEW must carry no defect fields"
        )
        assert case.wire_review_reason is not None, (
            f"{case.email_id}: NEEDS_REVIEW must carry a wire review reason"
        )
    if case.category != "BL_COMPARISON":
        assert case.status == "OK" and not case.has_defect and not case.defect_fields, (
            f"{case.email_id}: non-comparison emails must be OK with no defects"
        )
    assert case.defect_fields == sorted(case.defect_fields), (
        f"{case.email_id}: defect_fields must be sorted"
    )
    expected = sorted(c.field for c in case.comparisons if c.verdict == "MISMATCH"
                      and c.confidence.hard_fail is None)
    if case.status == "MISMATCH":
        assert case.defect_fields == expected, (
            f"{case.email_id}: defect_fields must equal the confident mismatches"
        )


def to_submission_entry(case: Case) -> dict:
    assert_invariants(case)
    return {
        "category": case.category,
        "status": case.status,
        "review_reason": case.wire_review_reason,
        "defect_fields": list(case.defect_fields),
        "has_defect": case.has_defect,
        "decided_by": case.decided_by,
    }
