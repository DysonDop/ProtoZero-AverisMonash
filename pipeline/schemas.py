"""Pydantic v2 schemas — the wire contract.

Authoritative source: docs/contracts.md. Field names here ARE the wire names.
Nothing in this file changes without a changelog entry in that doc.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# 1. Enums
# --------------------------------------------------------------------------

Category = Literal["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]
CaseStatus = Literal["OK", "MISMATCH", "NEEDS_REVIEW"]
DocKind = Literal[
    "SI", "BL", "COMMERCIAL_INVOICE", "PACKING_LIST", "CERTIFICATE_OF_ORIGIN", "UNKNOWN"
]
DocFormat = Literal["txt", "pdf", "docx", "xlsx", "scan_pdf"]
FieldName = Literal[
    "shipper",
    "consignee",
    "notify_party",
    "port_of_loading",
    "port_of_discharge",
    "container_count",
    "gross_weight_kg",
]
MatchVerdict = Literal["MATCH", "MISMATCH", "REVIEW", "ABSENT"]
DecidedBy = Literal["rule", "llm"]
ExtractedBy = Literal["parser", "doc_intelligence", "llm", "human"]

EscalationReason = Literal[
    "MISSING_ATTACHMENT",
    "UNREADABLE_DOCUMENT",
    "WRONG_DOC_TYPE",
    "FIELD_NOT_FOUND",
    "GROUNDING_FAILED",
    "LOW_CONFIDENCE",
    "BORDERLINE_MATCH",
    "PROCESSING_ERROR",
    "MANUAL_REVIEW_REQUESTED",
]
AuditAction = Literal[
    "EMAIL_RECEIVED",
    "DOCUMENT_CLASSIFIED",
    "EXTRACTION_COMPLETED",
    "AI_EXTRACTION_COMPLETED",
    "VALIDATION_FAILED",
    "HUMAN_REVIEW_CREATED",
    "HUMAN_CORRECTION",
    "COMPARISON_RERUN",
    "FINAL_DECISION",
    "CIRCUIT_BREAKER_OPENED",
    "CIRCUIT_BREAKER_CLOSED",
]
WireReviewReason = Literal[
    "wrong_doc_type", "missing_attachment", "unreadable", "missing_value"
]

# The seven compared fields, in canonical (sorted) order.
FIELD_NAMES: tuple[str, ...] = (
    "consignee",
    "container_count",
    "gross_weight_kg",
    "notify_party",
    "port_of_discharge",
    "port_of_loading",
    "shipper",
)

# Presentation order (matches how a human reads a BL).
FIELD_ORDER: tuple[str, ...] = (
    "shipper",
    "consignee",
    "notify_party",
    "port_of_loading",
    "port_of_discharge",
    "container_count",
    "gross_weight_kg",
)


# --------------------------------------------------------------------------
# 2. Extraction
# --------------------------------------------------------------------------


class Locator(BaseModel):
    """Where in the source document the value was found. Drives highlighting."""

    page: int | None = None
    sheet: str | None = None
    line: int | None = None
    char_start: int | None = None
    char_end: int | None = None
    bbox: list[float] | None = None


class ExtractedField(BaseModel):
    value: str | None = None
    evidence: str | None = None
    label_seen: str | None = None
    locator: Locator | None = None
    extracted_by: ExtractedBy = "parser"
    service_confidence: float | None = None
    model_confidence: float | None = None

    @property
    def found(self) -> bool:
        return self.value is not None and self.value.strip() != ""


class ShipmentFields(BaseModel):
    shipper: ExtractedField = Field(default_factory=ExtractedField)
    consignee: ExtractedField = Field(default_factory=ExtractedField)
    notify_party: ExtractedField = Field(default_factory=ExtractedField)
    port_of_loading: ExtractedField = Field(default_factory=ExtractedField)
    port_of_discharge: ExtractedField = Field(default_factory=ExtractedField)
    container_count: ExtractedField = Field(default_factory=ExtractedField)
    gross_weight_kg: ExtractedField = Field(default_factory=ExtractedField)

    def get(self, name: str) -> ExtractedField:
        return getattr(self, name)

    def found_count(self) -> int:
        return sum(1 for n in FIELD_NAMES if self.get(n).found)


class SourceDocument(BaseModel):
    attachment_path: str
    role: Literal["SI", "BL"]
    detected_kind: DocKind = "UNKNOWN"
    fmt: DocFormat = "txt"
    readable: bool = True
    text_sha256: str | None = None
    page_count: int | None = None
    fields: ShipmentFields | None = None
    parse_error: str | None = None


# --------------------------------------------------------------------------
# 3. Comparison + confidence
# --------------------------------------------------------------------------


class ConfidenceBreakdown(BaseModel):
    grounded: float = 1.0
    parse_valid: float = 1.0
    cross_check: float = 0.5
    doc_quality: float = 1.0
    service_confidence: float = 0.5
    model_selfrating: float = 0.5
    label_directness: float = 1.0
    score: float = 1.0
    hard_fail: EscalationReason | None = None


class FieldComparison(BaseModel):
    field: FieldName
    si: ExtractedField
    bl: ExtractedField
    si_normalized: str | None = None
    bl_normalized: str | None = None
    verdict: MatchVerdict
    similarity: float | None = None
    confidence: ConfidenceBreakdown
    explanation: str
    human_reviewed: bool = False


# --------------------------------------------------------------------------
# 4. The Case
# --------------------------------------------------------------------------


class Case(BaseModel):
    email_id: str
    correlation_id: str
    received_at: datetime | None = None
    from_addr: str = ""
    subject: str = ""

    category: Category
    decided_by: DecidedBy = "rule"
    category_confidence: float = 1.0

    status: CaseStatus = "OK"
    has_defect: bool = False
    defect_fields: list[FieldName] = Field(default_factory=list)
    escalation_reasons: list[EscalationReason] = Field(default_factory=list)
    wire_review_reason: WireReviewReason | None = None

    documents: list[SourceDocument] = Field(default_factory=list)
    comparisons: list[FieldComparison] = Field(default_factory=list)

    summary: str = ""
    lifecycle: Literal["new", "in_review", "resolved", "archived"] = "new"
    pipeline_version: str = "dev"
    prompt_version: str = "v1"
    models: dict[str, str] = Field(default_factory=dict)
    timings_ms: dict[str, int] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ReviewItem(BaseModel):
    id: str
    email_id: str
    fields: list[FieldName] = Field(default_factory=list)
    reason: EscalationReason
    reason_detail: str = ""
    si_value: str | None = None
    bl_value: str | None = None
    si_evidence: str | None = None
    bl_evidence: str | None = None
    confidence: float | None = None
    state: Literal["open", "resolved"] = "open"
    created_at: datetime | None = None
    resolved_at: datetime | None = None
    resolved_by: str | None = None


class Correction(BaseModel):
    id: str
    email_id: str
    field: FieldName
    document_role: Literal["SI", "BL"]
    was_value: str | None = None
    correct_value: str | None = None
    label_seen: str | None = None
    action: Literal["confirm", "correct", "retry"]
    reviewer_id: str = "review-desk"
    created_at: datetime | None = None


class AuditEvent(BaseModel):
    id: str
    email_id: str
    correlation_id: str
    seq: int
    at: datetime
    actor: Literal["system", "reviewer"]
    reviewer_id: str | None = None
    action: AuditAction
    field: FieldName | None = None
    previous_value: str | None = None
    new_value: str | None = None
    reason: str


class CaseDecision(BaseModel):
    email_id: str
    action: Literal["approve", "reject", "review", "request"]
    label: str
    done: str
    reviewer_id: str = "review-desk"
    recorded_at: datetime


class EmailRecord(BaseModel):
    email_id: str
    from_: str = Field(default="", alias="from")
    subject: str = ""
    body: str = ""
    attachments: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
