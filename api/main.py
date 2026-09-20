"""FastAPI surface. Shapes are defined in docs/contracts.md §6."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from api.store import STORE
from eval.run_eval import Inbox
from pipeline.config import DEFAULT_SOURCE, PIPELINE_VERSION
from pipeline.report import to_submission_entry
from pipeline.run import process_email
from pipeline.schemas import AuditEvent, Case, CaseDecision, Correction, ReviewItem
from parsers.read import read as read_document

app = FastAPI(title="ProtoZero — Shipping Document Verification", version=PIPELINE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_inbox = Inbox(DEFAULT_SOURCE)


class IngestRequest(BaseModel):
    email_ids: list[str] | None = None


class ResolveReviewRequest(BaseModel):
    action: Literal["confirm", "correct"]
    field: str | None = None
    correct_value: str | None = None
    reviewer_id: str = "demo-reviewer"


class RetryReviewRequest(BaseModel):
    force_llm: bool = False


class CaseDecisionRequest(BaseModel):
    action: Literal["approve", "reject", "review", "request"]
    label: str
    done: str
    reviewer_id: str = "demo-reviewer"


# Set when the warm start fails. Surfaced in `/` and `/api/health` because
# log streaming is unavailable on Container Apps express environments — if
# something goes wrong at boot, the response body has to say so.
WARM_START_ERROR: str | None = None
_LOADED = False


def ensure_loaded() -> None:
    """Populate the store on first read if the warm start didn't manage it.

    Belt and braces: the whole inbox takes under half a second, so paying that
    once on a cold request is far better than a judge opening the URL and
    finding an empty case list.
    """
    global _LOADED, WARM_START_ERROR
    if _LOADED or STORE.cases:
        _LOADED = True
        return
    try:
        ingest(IngestRequest())
        WARM_START_ERROR = None
    except Exception as exc:  # noqa: BLE001
        WARM_START_ERROR = f"{type(exc).__name__}: {exc}"
    finally:
        _LOADED = True


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Process the bundled inbox once at boot.

    A judge opening the URL should land on a populated case list, not an empty
    one waiting for someone to POST to /ingest.
    """
    ensure_loaded()
    yield


app.router.lifespan_context = lifespan


@app.get("/api")
def root() -> dict:
    """Service metadata. The built web application is served at `/`."""
    ensure_loaded()
    return {
        "service": "ProtoZero \u2014 Shipping Document Verification",
        "version": PIPELINE_VERSION,
        "cases_loaded": len(STORE.cases),
        "warm_start_error": WARM_START_ERROR,
        "dataset": DEFAULT_SOURCE,
        "docs": "/docs",
        "endpoints": [
            "/api/health",
            "/api/cases",
            "/api/cases/{email_id}",
            "/api/cases/{email_id}/events",
            "/api/cases/{email_id}/document/{role}",
            "/api/review",
            "/api/metrics",
            "/api/submission",
        ],
    }


@app.get("/api/health")
def health() -> dict:
    ensure_loaded()
    return {
        "status": "ok",
        "cases": len(STORE.cases),
        "version": PIPELINE_VERSION,
        "warm_start_error": WARM_START_ERROR,
    }


@app.post("/api/ingest")
def ingest(req: IngestRequest) -> dict:
    import time

    started = time.perf_counter()
    emails = _inbox.emails()
    if req.email_ids:
        wanted = set(req.email_ids)
        emails = [e for e in emails if e["email_id"] in wanted]

    for email in emails:
        case, reviews = process_email(email, _inbox.read_bytes)
        first_run = not STORE.list_events(case.email_id)
        STORE.put_case(case)
        STORE.replace_reviews(case.email_id, reviews)
        if first_run:
            _record_initial_events(case, reviews)
        else:
            _add_event(case, "COMPARISON_RERUN", "The case was processed again.")

    return {
        "processed": len(emails),
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
    }


@app.get("/api/cases")
def list_cases(
    category: str | None = None,
    status: str | None = None,
    lifecycle: str | None = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
) -> dict:
    ensure_loaded()
    items, total = STORE.list_cases(
        category=category, status=status, lifecycle=lifecycle, limit=limit, offset=offset
    )
    return {
        "total": total,
        "items": [
            {
                "email_id": c.email_id,
                "subject": c.subject,
                "from_addr": c.from_addr,
                "category": c.category,
                "status": c.status,
                "has_defect": c.has_defect,
                "defect_fields": c.defect_fields,
                "summary": c.summary,
                "lifecycle": c.lifecycle,
            }
            for c in items
        ],
        "next_offset": offset + len(items) if offset + len(items) < total else None,
    }


@app.get("/api/cases/{email_id}")
def get_case(email_id: str) -> dict:
    case = STORE.get_case(email_id)
    if case is None:
        raise HTTPException(404, {"code": "not_found", "message": email_id})
    return case.model_dump(mode="json")


@app.get("/api/cases/{email_id}/document/{role}")
def get_document(email_id: str, role: Literal["SI", "BL"]) -> dict:
    ensure_loaded()
    case = _case_or_404(email_id)
    source = next((document for document in case.documents if document.role == role), None)
    if source is None:
        raise HTTPException(404, {"code": "not_found", "message": f"{email_id} has no {role}"})
    try:
        parsed = read_document(source.attachment_path, _inbox.read_bytes(source.attachment_path))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            422, {"code": "document_unreadable", "message": str(exc)}
        ) from exc
    return {"fmt": parsed.fmt, "text": parsed.full_text, "page_urls": []}


@app.get("/api/cases/{email_id}/events")
def case_events(email_id: str) -> dict:
    ensure_loaded()
    _case_or_404(email_id)
    return {"items": [event.model_dump(mode="json") for event in STORE.list_events(email_id)]}


@app.get("/api/cases/{email_id}/decision")
def get_case_decision(email_id: str) -> dict:
    ensure_loaded()
    _case_or_404(email_id)
    decision = STORE.get_decision(email_id)
    return {"decision": decision.model_dump(mode="json") if decision else None}


@app.post("/api/cases/{email_id}/decision")
def set_case_decision(email_id: str, req: CaseDecisionRequest) -> dict:
    ensure_loaded()
    case = _case_or_404(email_id)
    now = datetime.now(timezone.utc)
    decision = CaseDecision(email_id=email_id, recorded_at=now, **req.model_dump())
    STORE.put_decision(decision)
    case.lifecycle = "in_review" if req.action in {"review", "request"} else "resolved"
    case.updated_at = now
    STORE.put_case(case)
    manual_review_id = f"{email_id}:manual"
    if req.action in {"review", "request"}:
        field = case.defect_fields[0] if case.defect_fields else None
        comparison = next(
            (value for value in case.comparisons if value.field == field), None
        )
        STORE.put_review(
            ReviewItem(
                id=manual_review_id,
                email_id=email_id,
                fields=[field] if field else [],
                reason="MANUAL_REVIEW_REQUESTED",
                reason_detail=(
                    "A reviewer requested a second check of this case."
                    if req.action == "review"
                    else "A reviewer requested follow-up for a complete shipping instruction."
                ),
                si_value=comparison.si.value if comparison else None,
                bl_value=comparison.bl.value if comparison else None,
                si_evidence=comparison.si.evidence if comparison else None,
                bl_evidence=comparison.bl.evidence if comparison else None,
                confidence=comparison.confidence.score if comparison else None,
                created_at=now,
            )
        )
    else:
        STORE.delete_review(manual_review_id)
    _add_event(
        case,
        "FINAL_DECISION",
        req.done,
        actor="reviewer",
        reviewer_id=req.reviewer_id,
        new_value=req.action,
    )
    return {"decision": decision.model_dump(mode="json"), "case": case.model_dump(mode="json")}


@app.delete("/api/cases/{email_id}/decision")
def delete_case_decision(email_id: str, reviewer_id: str = "demo-reviewer") -> dict:
    ensure_loaded()
    case = _case_or_404(email_id)
    previous = STORE.get_decision(email_id)
    STORE.delete_decision(email_id)
    STORE.delete_review(f"{email_id}:manual")
    case.lifecycle = "in_review" if case.status == "NEEDS_REVIEW" else "new"
    case.updated_at = datetime.now(timezone.utc)
    STORE.put_case(case)
    if previous:
        _add_event(
            case,
            "FINAL_DECISION",
            "The reviewer undid the case decision.",
            actor="reviewer",
            reviewer_id=reviewer_id,
            previous_value=previous.action,
        )
    return {"ok": True, "case": case.model_dump(mode="json")}


@app.post("/api/cases/{email_id}/rerun")
def rerun(email_id: str) -> dict:
    try:
        email = next(e for e in _inbox.emails() if e["email_id"] == email_id)
    except StopIteration:
        raise HTTPException(404, {"code": "not_found", "message": email_id}) from None
    case, reviews = process_email(email, _inbox.read_bytes)
    STORE.put_case(case)
    STORE.replace_reviews(email_id, reviews)
    _add_event(case, "COMPARISON_RERUN", "The pipeline reran this case.")
    _record_result_events(case, reviews)
    return case.model_dump(mode="json")


@app.get("/api/review")
def review_queue(state: str = "open", limit: int = Query(50, le=500)) -> dict:
    ensure_loaded()
    items = STORE.list_reviews(state=state, limit=limit)
    return {
        "items": [r.model_dump(mode="json") for r in items],
        "open_count": STORE.open_count(),
    }


@app.post("/api/review/{review_id}/resolve")
def resolve_review(review_id: str, req: ResolveReviewRequest) -> dict:
    ensure_loaded()
    item = STORE.get_review(review_id)
    if item is None:
        raise HTTPException(404, {"code": "not_found", "message": review_id})
    if item.state == "resolved":
        raise HTTPException(409, {"code": "already_resolved", "message": review_id})

    case = _case_or_404(item.email_id)
    field = req.field or (item.fields[0] if item.fields else None)
    comparison = next((value for value in case.comparisons if value.field == field), None)
    previous_value = comparison.bl.value if comparison else item.bl_value
    if req.action == "correct" and field and not req.correct_value:
        raise HTTPException(
            422, {"code": "correct_value_required", "message": "A corrected field needs a value."}
        )

    now = datetime.now(timezone.utc)
    item.state = "resolved"
    item.resolved_at = now
    item.resolved_by = req.reviewer_id
    STORE.put_review(item)

    if comparison:
        comparison.human_reviewed = True
    if field:
        correction = Correction(
            id=f"{review_id}:{STORE.next_event_seq(item.email_id)}",
            email_id=item.email_id,
            field=field,
            document_role="BL",
            was_value=previous_value,
            correct_value=req.correct_value if req.action == "correct" else previous_value,
            label_seen=comparison.bl.label_seen if comparison else None,
            action=req.action,
            reviewer_id=req.reviewer_id,
            created_at=now,
        )
        STORE.put_correction(correction)

    remaining = [
        review for review in STORE.list_reviews(state="open", limit=500)
        if review.email_id == item.email_id
    ]
    case.lifecycle = "in_review" if remaining else "resolved"
    case.updated_at = now
    STORE.put_case(case)
    _add_event(
        case,
        "HUMAN_CORRECTION",
        "A reviewer confirmed the result." if req.action == "confirm" else "A reviewer supplied a correction.",
        actor="reviewer",
        reviewer_id=req.reviewer_id,
        field=field,
        previous_value=previous_value,
        new_value=req.correct_value if req.action == "correct" else previous_value,
    )
    if not remaining:
        _add_event(
            case,
            "FINAL_DECISION",
            "All review items for this case are resolved.",
            actor="reviewer",
            reviewer_id=req.reviewer_id,
        )
    return {"review_item": item.model_dump(mode="json"), "case": case.model_dump(mode="json")}


@app.post("/api/review/{review_id}/retry")
def retry_review(review_id: str, req: RetryReviewRequest) -> dict:
    ensure_loaded()
    item = STORE.get_review(review_id)
    if item is None:
        raise HTTPException(404, {"code": "not_found", "message": review_id})
    email = _email_or_404(item.email_id)
    case, reviews = process_email(email, _inbox.read_bytes)
    STORE.put_case(case)
    STORE.replace_reviews(item.email_id, reviews)
    _add_event(
        case,
        "COMPARISON_RERUN",
        "A reviewer retried the failed stage" + (" with AI fallback requested." if req.force_llm else "."),
        actor="reviewer",
        reviewer_id=item.resolved_by or "demo-reviewer",
    )
    _record_result_events(case, reviews)
    current = STORE.get_review(review_id) or item
    return {"review_item": current.model_dump(mode="json"), "case": case.model_dump(mode="json")}


@app.get("/api/metrics")
def metrics() -> dict:
    ensure_loaded()
    return STORE.metrics()


@app.get("/api/submission")
def submission() -> dict:
    ensure_loaded()
    return {eid: to_submission_entry(c) for eid, c in sorted(STORE.cases.items())}


def _case_or_404(email_id: str) -> Case:
    case = STORE.get_case(email_id)
    if case is None:
        raise HTTPException(404, {"code": "not_found", "message": email_id})
    return case


def _email_or_404(email_id: str) -> dict:
    try:
        return next(email for email in _inbox.emails() if email["email_id"] == email_id)
    except StopIteration:
        raise HTTPException(404, {"code": "not_found", "message": email_id}) from None


def _add_event(
    case: Case,
    action: str,
    reason: str,
    *,
    actor: str = "system",
    reviewer_id: str | None = None,
    field: str | None = None,
    previous_value: str | None = None,
    new_value: str | None = None,
) -> None:
    seq = STORE.next_event_seq(case.email_id)
    event = AuditEvent(
        id=f"{case.email_id}:{seq}",
        email_id=case.email_id,
        correlation_id=f"protozero:{case.email_id}",
        seq=seq,
        at=datetime.now(timezone.utc),
        actor=actor,
        reviewer_id=reviewer_id,
        action=action,
        field=field,
        previous_value=previous_value,
        new_value=new_value,
        reason=reason,
    )
    STORE.add_event(event)


def _record_initial_events(case: Case, reviews: list) -> None:
    _add_event(case, "EMAIL_RECEIVED", "The email entered the verification pipeline.")
    _add_event(
        case,
        "DOCUMENT_CLASSIFIED",
        f"The email was classified as {case.category.lower().replace('_', ' ')}.",
    )
    _record_result_events(case, reviews)


def _record_result_events(case: Case, reviews: list) -> None:
    if case.documents:
        _add_event(
            case,
            "EXTRACTION_COMPLETED",
            f"The pipeline read {len(case.documents)} attached document(s).",
        )
    if case.escalation_reasons:
        _add_event(
            case,
            "VALIDATION_FAILED",
            "; ".join(reason.lower().replace("_", " ") for reason in case.escalation_reasons),
        )
    if reviews:
        _add_event(
            case,
            "HUMAN_REVIEW_CREATED",
            f"{len(reviews)} review item(s) were opened.",
        )
    _add_event(case, "FINAL_DECISION", case.summary)


# Keep this mount last so every explicit API and documentation route wins.
# The Docker image always contains web/dist; local API-only development still
# works when the frontend has not been built yet.
WEB_DIST = Path(__file__).resolve().parents[1] / "web" / "dist"
if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
