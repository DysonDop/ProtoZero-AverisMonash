# Spec — the verification pipeline

v1, 19 Sep 2026 · spec-anchored: this file stays alive through maintenance, it is
not a launch artefact. Implement against it; when behaviour must change, change
this first, then the code.

Scope: `pipeline/` and `parsers/`. Schemas are in `docs/contracts.md`; do not
restate them here. Reasoning is in `docs/architecture.md`; do not re-argue it here.

---

## Stage 1 — Classify

**Input** `EmailRecord{email_id, from, subject, body, attachments}`
**Output** `(Category, DecidedBy, confidence: float)`

### 1.1 Preprocess

- Strip the external-sender banner before any body analysis: drop any line
  matching `/^WARNING: This email originated outside/i` and the lines that follow
  it up to the first blank line. **Required** — the banner contains the word
  "attach" and fires naive attachment-mention heuristics on 27 emails.
- Strip reply/forward prefixes from the subject: repeatedly remove a leading
  `RE_`, `RE:`, `FW_`, `FWD_`, `FW:` (case-insensitive) until none remain.

### 1.2 Rule layer (runs first)

Evaluate in order; first match wins. Return `decided_by="rule"`.

1. **SPAM** — sender domain is not in the corporate allowlist. Maintain the
   allowlist in `data_refs/sender_domains.yaml`, not in code. Rationale: this
   settles all 40 spam emails on a signal that does not depend on content, and
   macro-F1 makes those 40 worth as much as the 220 comparisons.
2. **BL_COMPARISON** — normalised subject matches any of:
   - starts with `TO CONFIRM DOCS`
   - starts with `REQUEST BL DRAFT`
   - starts with `Draft BL ` (the `… amend BL NNN` thread)
   - the coded form `^(AIE|AFEMY|AFRT|AFPTME|AF[A-Z]+)\s*-\s*<POD> - <CARRIER>(<BL#>) - …`
3. **SI_REQUEST** —
   - the coded form `^SI\s*-\s*<bl#> - DIRECT(<carrier>) - …`
   - starts with `CUST SI`, `REQUEST SI`, or `SI NEEDED`
4. **GENERAL, bot/HR notices** — checked **before** INVOICE_QUERY because
   `_RPA_ India HSS SD Billing Process Completed` contains "Billing" and is a bot
   notice, not an invoice query. Patterns: `_RPA_`, `_Reminder_Paper`,
   `_Approval Required_`, `UPDATE SUMMARY`, `daily Berthing Report`,
   `Pending BL Release`, `List of Outstanding BL`, `Miss Connection`,
   `Delivery planning`.
5. **INVOICE_QUERY** — `RAK BILLING`, `MISSING GR`, `REQUEST TO CANCEL INVOICE`,
   `LOCAL CHARGES`, `D & D charges`, `Total Freight`.
6. **No match** → fall through to 1.3.

Match on **grammar, not literal strings** wherever possible: the distinguishing
signal between `BL_COMPARISON` and `SI_REQUEST` is the *verb* — "check/compare
these documents" versus "send me a document". A rule that keys on the verb
survives a new subject template; one that keys on `TO CONFIRM DOCS` does not.

### 1.3 LLM fallback

`gemini-3.1-flash-lite`, `temperature=0`, structured output, returns
`{category, confidence, reason}`. Prompt gets: cleaned subject, cleaned body
(first 800 chars), sender domain, and **the number of attachments** — not their
contents. Return `decided_by="llm"`.

### 1.4 Route

`category != "BL_COMPARISON"` → write a `Case` with `status="OK"`,
`has_defect=False`, `defect_fields=[]`, and stop. Everything below is
`BL_COMPARISON` only.

---

## Stage 2 — Gate

Decide whether a comparison is *possible* before attempting one. Every check
here is deterministic. Per ADR-005, escalation is free at this stage — take it.

1. **Pair.** Group `attachments` by the `_SI` / `_BL` suffix into `role`.
   - `len(attachments) == 0` → `NEEDS_REVIEW`, `MISSING_ATTACHMENT`.
     - Exception worth encoding: a comparison email with no attachments whose
       body **asks you to send** a draft BL ("please assist to send the draft BL
       … for checking") is a legitimate not-yet-comparable request, not a
       dropped attachment. It is still `MISSING_ATTACHMENT` internally, but the
       case summary must say "no documents yet" rather than "attachments
       missing", and the demo should show the distinction. The discriminating
       phrase in this corpus is "attachments appear to have been dropped" vs
       "please assist to send". Prefer an LLM intent read ("asks to compare" vs
       "asks to send") over the literal phrase — the literal phrase will not
       survive a regenerate.
   - exactly one attachment → `NEEDS_REVIEW`, `MISSING_ATTACHMENT`.
2. **Open.** For each document, run the format reader (Stage 3.1). If it raises,
   or yields zero extractable text with ≥1 embedded image → `NEEDS_REVIEW`,
   `UNREADABLE_DOCUMENT`.
   - PyMuPDF raising `FileDataError` ⇒ truncated/garbled PDF ⇒ unreadable.
   - `page.get_text()` empty and `page.get_images()` non-empty ⇒ image-only scan
     ⇒ **not** immediately unreadable: route to Stage 3.3 (OCR). Only escalate as
     `UNREADABLE_DOCUMENT` if OCR also yields nothing usable.
3. **Sniff type.** Determine `detected_kind` from **content**, never the filename:

   | Kind | Markers |
   | --- | --- |
   | `SI` | `SHIPPING INSTRUCTION` · `BILL OF LADING INSTRUCTION` (pdf) · `BL INSTRUCTION` or sheet named `S.I.` (xlsx) |
   | `BL` | `BILL OF LADING (DRAFT)` · `BILL OF LADING` or sheet named `BL` (xlsx) |
   | decoys | `COMMERCIAL INVOICE` · `PACKING LIST` · `CERTIFICATE OF ORIGIN` |

   Fallback when no header matches: count how many of the 7 fields the parser
   located. `< 4` ⇒ `UNKNOWN`. Use this, not the `*** NOT AN SI OR BL ***`
   footer the decoys carry — that footer is a generator artefact and will not
   survive a regenerate.

   Anything other than exactly one `SI` and one `BL` → `NEEDS_REVIEW`,
   `WRONG_DOC_TYPE`.

---

## Stage 3 — Extract

**Output** a `ShipmentFields` per document, every field carrying value, evidence,
`label_seen` and a `Locator`.

### 3.0 Label resolution (shared by all parsers)

Normalise a candidate label before lookup: lowercase → strip any parenthetical
`(...)` / `（…）` → strip CJK characters → collapse whitespace → strip trailing
colon. This collapses `Gross Weight毛重(KGS)`, `Gross Wt (kgs)`, `GROSS WEIGHT`
and the docx bilingual `PORT OF LOADING (装货港)` onto single keys.

Then look up in `data_refs/synonyms.yaml` (first draft in
`docs/dataset_facts.md` §3). **Hard rules:**

- Never match a gross-weight label on bare `WEIGHT`. `NET WEIGHT` is a planted
  decoy; blacklist any label containing `NET`.
- A label starting `TOTAL` **outranks** the same label without it (PDF totals
  row beats the table column header).
- First occurrence of a field wins; later occurrences are ignored.

### 3.1 Per-format readers (`parsers/`)

| Format | Shape | Gotchas |
| --- | --- | --- |
| `txt` | `Label: value` per line; party address on following **indented** lines | Take the label line only as the value. Address lines go into `evidence`, never into the compared value. |
| `pdf` | Block layout: label on its own line, value on the **next** line(s); parties span 3–5 lines, name first | (a) Some labels are glued to their value on one line — `Consignee (Non-Negotiable) BALL & DOGGETT…`, `Export Carrier (vessel, voyage)SOLID 16 V.044NW2`: strip the longest matching known label as a prefix. (b) **`GROSS WEIGHT (KG)` is a container-table column header, not a field** — anchor gross weight to the line beginning `TOTAL`. (c) SIs are headed `BILL OF LADING INSTRUCTION`, not "SHIPPING INSTRUCTION". |
| `docx` | One 2-column table; label cell bilingual; value cell holds name **and** address separated by newlines | Take line 0 of the value cell as the value. |
| `xlsx` | 2–3 columns: `label │ name │ address`; sheet named `S.I.` or `BL` | Value is column 2. Weight is a **bare int** with no separator and no unit. |
| `scan_pdf` | image-only | → 3.3 |

Each reader returns `(fields, full_text, locators)`. `full_text` is cached by
sha256 so re-runs don't re-parse.

### 3.2 LLM fallback

Trigger when the parser located `< 7` fields, or the document is `scan_pdf`.
`gemini-3.5-flash`, `temperature=0`, structured output against `ShipmentFields`.
Send the document natively (Gemini reads PDFs) plus the parser's partial result
as context. **The prompt asks only for values + evidence snippets — never for a
comparison, never for a judgement about correctness.** Set
`extracted_by="llm"`.

### 3.3 Scans

`Cloud Vision` OCR → word-level text with bounding boxes and confidence → feed
OCR text **and** the page image to Gemini. Set `extracted_by="ocr_llm"`,
`doc_quality=0.5`. Bounding boxes populate `Locator.bbox` so highlighting still
works on a scan.

### 3.4 Grounding check

For every LLM-extracted field, assert the `evidence` snippet appears in the
document's `full_text` (exact, or `rapidfuzz.partial_ratio ≥ 90`). On failure:
**one** retry with the failure stated in the prompt, then
`GROUNDING_FAILED` → review. Parser-extracted fields are grounded by
construction; set `grounded=1.0` without a check.

---

## Stage 4 — Normalize

Exactly three rules (ADR-002). Each one is a pure function with unit tests
including its trap case. Nothing else is normalised.

```python
def norm_weight(raw: str | int | None) -> int | None:
    """'131,058 KG' | '243,588' | 341715 -> 131058 | 243588 | 341715
    Strip every non-digit, parse int. Returns None for blank/placeholder."""

def norm_party(raw: str | None) -> str | None:
    """Name only: first line / first cell. Then casefold, collapse whitespace,
    strip punctuation. DOES NOT strip legal suffixes (Sdn Bhd, Pte Ltd, FZE, …) —
    the injected defects are suffix-level entity swaps."""

def norm_port(raw: str | None) -> str | None:
    """Strip a trailing '(XXXXX)' UN/LOCODE, then casefold + collapse whitespace.
    The CODE IS NEVER THE COMPARISON KEY — injected port defects rewrite the city
    and keep the original code (ADR-003)."""

def norm_containers(raw: str | None) -> int | None:
    """'6 x 40\\'HC' -> 6. int(value.split('x')[0]). One format exists today;
    keep this as the single hook if the final round adds grammar."""
```

**Blank detection**, applied before all of the above. A value is *blank* if it is
empty, whitespace-only, or matches `N/A`, `TBA`, `???`, or a run of underscores.
A blank in any of the 7 fields → `FIELD_NOT_FOUND` → `NEEDS_REVIEW`. A blank is
**uncertainty, not a discrepancy** — it must never produce a `MISMATCH`.

---

## Stage 5 — Compare

SI is the reference. For each of the 7 fields:

```
si_blank or bl_blank        → verdict ABSENT,   escalate FIELD_NOT_FOUND
norm(si) == norm(bl)        → verdict MATCH
otherwise:
    ratio = rapidfuzz.token_sort_ratio(norm_si, norm_bl)
    85 <= ratio < 100       → verdict REVIEW,   escalate BORDERLINE_MATCH
    ratio < 85              → verdict MISMATCH
```

`rapidfuzz` exists **only** to route a near-miss to a human. It can never
produce `MATCH`. Two values that are not byte-equal after normalisation are
never declared equal.

Cross-check signals (feed confidence, never the verdict):
- PDF: per-container row weights sum to the stated total.
- PDF: container-row count equals the stated container count.
- A city whose stated UN/LOCODE disagrees with that city's code elsewhere in the
  corpus (evidence of an edited field).
- Port not resolvable in `data_refs/unlocode_seaports.csv` → confidence penalty +
  review, never a mismatch.

---

## Stage 6 — Confidence

Per field, all components in 0..1, weighted sum into `score`:

| Component | Weight | Source |
| --- | --- | --- |
| `grounded` | hard gate | evidence located in source. 0 ⇒ `hard_fail=GROUNDING_FAILED` |
| `parse_valid` | hard gate | number parsed / port resolved / name non-empty. 0 ⇒ `hard_fail=FIELD_NOT_FOUND` |
| `cross_check` | 0.35 | the signals above; 0.5 when not applicable |
| `doc_quality` | 0.30 | txt 1.0 · digital pdf/docx/xlsx 0.9 · scan 0.5 |
| `model_selfrating` | 0.10 | LLM 0..1; **0.5 when extracted by parser** (neutral, not 1.0) |
| `label_directness` | 0.25 | exact synonym hit 1.0 · fuzzy label hit 0.6 · inferred 0.3 |

Any `hard_fail` sends the field to review regardless of `score`.
`score < REVIEW_THRESHOLD` (config, start 0.55) sends it to review as
`LOW_CONFIDENCE`.

The research basis for the weighting: LLM self-reported confidence is a weak
routing signal (~0.70 AUC), so it carries the least weight; grounding and
cross-checks carry the most. Tune `REVIEW_THRESHOLD` from eval results, never by
feel, and log the change.

---

## Stage 7 — Decide

```
any document-level escalation (Stage 2)     → NEEDS_REVIEW, reason by precedence
any field ABSENT / REVIEW / hard_fail       → NEEDS_REVIEW
any field MISMATCH                          → MISMATCH, defect_fields = those fields
otherwise                                   → OK
```

**Precedence note.** A case with both a genuine `MISMATCH` field and a separate
low-confidence field is a judgement call. Per ADR-005 the asymmetry favours
reporting the mismatch: escalating a real mismatch converts a caught defect into
a miss. **Rule: if ≥1 field is a confident `MISMATCH`, the case is `MISMATCH`;
the uncertain fields still generate review items, but the case status and
`defect_fields` reflect the confident mismatches only.** This keeps the
end-to-end metric intact while still surfacing the uncertainty to a human.

Then: write the `Case`, write a `ReviewItem` per escalating field or document
problem, and emit the submission record via
`pipeline/report.py::to_submission_entry`, which enforces every invariant in
`docs/contracts.md` §4 before returning.

---

## Observability

One structured Cloud Logging record per LLM call:
`{email_id, stage, prompt_version, model, temperature, input_hash, tokens_in,
tokens_out, latency_ms, parsed_ok, retry_of}`. Never log the API key. Never log a
full document body — log the input hash.

## Caching

Key every LLM response by `(prompt_version, model, sha256(input))` into
`.cache/gemini/`. Re-runs must be free; the eval loop depends on it.

## Definition of done

- [ ] 520/520 emails produce a schema-valid submission entry
- [ ] Every invariant in `docs/contracts.md` §4 asserted, with tests
- [ ] Every normalisation rule has a unit test including its trap case
- [ ] Zero LLM calls required for `.txt`-only cases (deterministic path proven)
- [ ] `eval/results.csv` has a row for this build
