# Data model & API contracts

v1, 19 Sep 2026 · **This file is load-bearing.** Christabel, Gene and seunniee
build against it. Nothing here changes without a note in the changelog and a
message in the team channel — if a shape changes silently, three people's code
breaks at once.

Everything is Pydantic v2. Field names here are the wire names; the API emits
and accepts exactly these.

## 1. Enums

```python
Category      = Literal["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]
CaseStatus    = Literal["OK", "MISMATCH", "NEEDS_REVIEW"]
DocKind       = Literal["SI", "BL", "COMMERCIAL_INVOICE", "PACKING_LIST",
                        "CERTIFICATE_OF_ORIGIN", "UNKNOWN"]
DocFormat     = Literal["txt", "pdf", "docx", "xlsx", "scan_pdf"]
FieldName     = Literal["shipper", "consignee", "notify_party", "port_of_loading",
                        "port_of_discharge", "container_count", "gross_weight_kg"]
MatchVerdict  = Literal["MATCH", "MISMATCH", "REVIEW", "ABSENT"]
DecidedBy     = Literal["rule", "llm"]
ExtractedBy   = Literal["parser", "doc_intelligence", "llm", "human"]

# internal, richer than the wire enum — see ADR-006
EscalationReason = Literal[
    "MISSING_ATTACHMENT", "UNREADABLE_DOCUMENT", "WRONG_DOC_TYPE", "FIELD_NOT_FOUND",
    "GROUNDING_FAILED", "LOW_CONFIDENCE", "BORDERLINE_MATCH", "PROCESSING_ERROR",
]
# what the organisers' submission accepts
WireReviewReason = Literal["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"]
```

**Mapping, internal → wire** (`pipeline/report.py::to_wire_reason`, unit-tested):

| Internal | Wire |
| --- | --- |
| `MISSING_ATTACHMENT` | `missing_attachment` |
| `UNREADABLE_DOCUMENT`, `PROCESSING_ERROR` | `unreadable` |
| `WRONG_DOC_TYPE` | `wrong_doc_type` |
| `FIELD_NOT_FOUND`, `GROUNDING_FAILED`, `LOW_CONFIDENCE`, `BORDERLINE_MATCH` | `missing_value` |

When a case escalates for several reasons, the wire reason is the **first** in
this precedence: `missing_attachment` → `wrong_doc_type` → `unreadable` →
`missing_value`. (Document-level problems outrank field-level ones.)

## 2. Extraction schemas

```python
class Locator(BaseModel):
    """Where in the source document the value was found. Drives highlighting."""
    page: int | None = None          # 1-indexed; None for txt/xlsx
    sheet: str | None = None         # xlsx only
    line: int | None = None          # txt/docx: 0-indexed line or table row
    char_start: int | None = None    # offset into the document's extracted text
    char_end: int | None = None
    bbox: list[float] | None = None  # [x0, y0, x1, y1] in PDF points; scans + pdf only

class ExtractedField(BaseModel):
    value: str | None                # raw, exactly as written in the document
    evidence: str | None             # exact snippet copied from the source text
    label_seen: str | None           # e.g. "Load Port" — what the document called it
    locator: Locator | None = None
    extracted_by: ExtractedBy = "parser"
    service_confidence: float | None = None # Document Intelligence per-field confidence, 0..1. Real signal.
    model_confidence: float | None = None   # LLM self-rating, 0..1. Low weight. None for parser.

class ShipmentFields(BaseModel):
    shipper: ExtractedField
    consignee: ExtractedField
    notify_party: ExtractedField
    port_of_loading: ExtractedField
    port_of_discharge: ExtractedField
    container_count: ExtractedField
    gross_weight_kg: ExtractedField

class SourceDocument(BaseModel):
    attachment_path: str             # "attachments/email_004_SI.txt"
    role: Literal["SI", "BL"]        # from the FILENAME — pairing only, never trusted as type
    detected_kind: DocKind           # from CONTENT — this is the real type
    fmt: DocFormat
    readable: bool
    text_sha256: str | None = None   # cache key for extracted text
    page_count: int | None = None
    fields: ShipmentFields | None = None
    parse_error: str | None = None
```

> **`role` vs `detected_kind`.** `role` comes from the `_SI` / `_BL` suffix in
> the filename and is only used to decide which document is the reference.
> `detected_kind` comes from reading the document. When they disagree, that is a
> `WRONG_DOC_TYPE` escalation — the dataset ships a Commercial Invoice named
> `..._BL.txt`.

## 3. Comparison + confidence

```python
class ConfidenceBreakdown(BaseModel):
    """Per-field. Every component is in 0..1. `score` is the weighted sum; any
    hard_fail forces the field to REVIEW regardless of score."""
    grounded: float          # evidence snippet located in the source text
    parse_valid: float       # number parsed / port resolved / name non-empty
    cross_check: float       # e.g. PDF container rows sum to the stated total
    doc_quality: float       # txt 1.0 · digital pdf/docx/xlsx 0.9 · scan 0.5
    model_selfrating: float  # 0.5 when extracted by parser (neutral)
    score: float
    hard_fail: EscalationReason | None = None

class FieldComparison(BaseModel):
    field: FieldName
    si: ExtractedField
    bl: ExtractedField
    si_normalized: str | None
    bl_normalized: str | None
    verdict: MatchVerdict
    similarity: float | None = None   # rapidfuzz ratio, when computed. Never decides MATCH.
    confidence: ConfidenceBreakdown
    explanation: str                  # "container_count — SI: 3 / BL: 4"
```

## 4. The Case — the central document

Cosmos DB container **`cases`**, partition key `/email_id`, document id = `email_id`.

```python
class Case(BaseModel):
    email_id: str
    received_at: datetime
    from_addr: str
    subject: str

    category: Category
    decided_by: DecidedBy
    category_confidence: float

    status: CaseStatus
    has_defect: bool
    defect_fields: list[FieldName] = []
    escalation_reasons: list[EscalationReason] = []
    wire_review_reason: WireReviewReason | None = None

    documents: list[SourceDocument] = []
    comparisons: list[FieldComparison] = []

    summary: str                      # human sentence for the case list
    lifecycle: Literal["new", "in_review", "resolved", "archived"] = "new"
    pipeline_version: str             # git sha
    prompt_version: str
    models: dict[str, str]            # {"classify": "...", "extract": "..."}
    timings_ms: dict[str, int]
    created_at: datetime
    updated_at: datetime
```

**Invariants** (asserted in code, covered by tests):

- `has_defect` is `True` **iff** `status == "MISMATCH"`.
- `defect_fields` is non-empty **iff** `has_defect`.
- `status == "NEEDS_REVIEW"` ⇒ `has_defect is False` **and** `defect_fields == []`
  **and** `wire_review_reason is not None`.
- `category != "BL_COMPARISON"` ⇒ `status == "OK"`, `has_defect is False`,
  `defect_fields == []`.
- `defect_fields` is sorted, and equals `[c.field for c in comparisons if c.verdict == "MISMATCH"]`.

## 5. Review queue and corrections

Cosmos DB **`review_queue`**, partition key `/email_id`, id auto:

```python
class ReviewItem(BaseModel):
    id: str
    email_id: str
    fields: list[FieldName]           # [] when the whole document escalated
    reason: EscalationReason
    reason_detail: str                # human sentence, shown in the queue
    si_value: str | None
    bl_value: str | None
    si_evidence: str | None
    bl_evidence: str | None
    confidence: float | None
    state: Literal["open", "resolved"] = "open"
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: str | None = None
```

Cosmos DB **`corrections`** — the learning-from-corrections store:

```python
class Correction(BaseModel):
    id: str
    email_id: str
    field: FieldName
    document_role: Literal["SI", "BL"]
    was_value: str | None             # what we extracted
    correct_value: str | None         # what the human says it is
    label_seen: str | None            # feeds the synonym map
    action: Literal["confirm", "correct", "retry"]
    reviewer_id: str = "demo-reviewer"
    created_at: datetime
```

A `correct` action with a new `label_seen` appends to `data_refs/synonyms.yaml`
on the next run. **Corrections are never used as few-shot examples for emails in
the evaluated set** — that would inflate the self-eval (see `docs/eval_plan.md`).

## 6. HTTP API

Base `/api`. All responses JSON. Errors are
`{"error": {"code": str, "message": str}}` with a conventional status code.

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{"status":"ok","cases":int,"version":str}` |
| `GET` | `/cases` | `?category=&status=&lifecycle=&limit=50&cursor=` | `{"items":[CaseSummary],"next_cursor":str\|null}` |
| `GET` | `/cases/{email_id}` | — | `Case` (full, with `comparisons`) |
| `POST` | `/cases/{email_id}/rerun` | `{"force_llm": bool}` | `Case` |
| `GET` | `/cases/{email_id}/document/{role}` | `role=SI\|BL` | `{"fmt":DocFormat,"text":str,"page_urls":[str]}` — SAS URLs for rendered pages |
| `GET` | `/review` | `?state=open&limit=50` | `{"items":[ReviewItem],"open_count":int}` |
| `POST` | `/review/{id}/resolve` | `{"action":"confirm"\|"correct","field":FieldName\|null,"correct_value":str\|null,"reviewer_id":str}` | `{"review_item":ReviewItem,"case":Case}` |
| `POST` | `/review/{id}/retry` | `{"force_llm": bool}` | `{"review_item":ReviewItem,"case":Case}` |
| `GET` | `/metrics` | `?since=` | `Metrics` |
| `POST` | `/ingest` | `{"email_ids":[str]\|null}` — null = whole inbox | `{"processed":int,"elapsed_ms":int}` |
| `GET` | `/submission` | — | the organisers' submission dict, all 520 keys |

```python
class CaseSummary(BaseModel):     # the list view — deliberately small
    email_id: str
    subject: str
    from_addr: str
    category: Category
    status: CaseStatus
    has_defect: bool
    defect_fields: list[FieldName]
    lifecycle: str
    updated_at: datetime

class Metrics(BaseModel):
    total_emails: int
    by_category: dict[Category, int]
    by_status: dict[CaseStatus, int]
    mismatch_rate: float
    review_queue_open: int
    avg_fields_flagged: float
    rule_pct: float                   # share classified without an LLM call
    parser_pct: float                 # share extracted without touching a cloud service
    llm_calls: int
    est_minutes_saved: float          # cases auto-cleared × 4 min manual check
```

## 7. Submission format (organisers')

`GET /api/submission` emits exactly this — one entry per email, all 520 present:

```json
{
  "email_001": {
    "category": "GENERAL",
    "status": "OK",
    "review_reason": null,
    "defect_fields": [],
    "has_defect": false,
    "decided_by": "rule"
  }
}
```

`decided_by` is optional and unscored; the organisers' scorer reports it as
`rule_pct`. We send it — free evidence for the deck.

## 8. Cosmos DB layout

```
cases/{email_id}                      Case
review_queue/{auto_id}                ReviewItem
corrections/{auto_id}                 Correction
runs/{run_id}                         eval run metadata (mirrors eval/results.csv)
```

Cosmos indexes everything by default — exclude the big nested paths
(`/documents/*`, `/comparisons/*`) from the indexing policy so writes stay cheap,
and add composite indexes for `(category, status)` and `(lifecycle, updated_at desc)`.
Partitioning by `email_id` keeps every case a single-partition read.

## 9. Blob Storage layout

```
<account>/sdoc/attachments/{email_id}/{filename}       uploaded or copied source docs
<account>/sdoc/renders/{email_id}/{role}/page-{n}.png  rendered pages for highlighting
```

Read access via user-delegation SAS URLs, 1-hour expiry. The bundled dataset is served from
inside the container, not from Blob Storage; this container is for demo uploads and
render caching.

## Changelog

- **v1, 19 Sep 2026** — initial. `role` / `detected_kind` split and the
  internal→wire reason mapping both come from measured dataset behaviour
  (`docs/dataset_facts.md` §8, §9).
