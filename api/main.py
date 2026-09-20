"""FastAPI surface. Shapes are defined in docs/contracts.md §6."""

from __future__ import annotations

import json
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.store import STORE
from eval.run_eval import Inbox
from pipeline.config import DEFAULT_SOURCE, PIPELINE_VERSION
from pipeline.report import to_submission_entry
from pipeline.run import process_email

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


@app.get("/")
def root() -> dict:
    """Landing payload, so the bare URL is never a 404."""
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
        STORE.put_case(case)
        STORE.put_reviews(reviews)

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


@app.post("/api/cases/{email_id}/rerun")
def rerun(email_id: str) -> dict:
    try:
        email = next(e for e in _inbox.emails() if e["email_id"] == email_id)
    except StopIteration:
        raise HTTPException(404, {"code": "not_found", "message": email_id}) from None
    case, reviews = process_email(email, _inbox.read_bytes)
    STORE.put_case(case)
    STORE.put_reviews(reviews)
    return case.model_dump(mode="json")


@app.get("/api/review")
def review_queue(state: str = "open", limit: int = Query(50, le=500)) -> dict:
    ensure_loaded()
    items = STORE.list_reviews(state=state, limit=limit)
    return {
        "items": [r.model_dump(mode="json") for r in items],
        "open_count": STORE.open_count(),
    }


@app.get("/api/metrics")
def metrics() -> dict:
    ensure_loaded()
    return STORE.metrics()


@app.get("/api/submission")
def submission() -> dict:
    ensure_loaded()
    return {eid: to_submission_entry(c) for eid, c in sorted(STORE.cases.items())}
