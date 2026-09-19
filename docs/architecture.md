# Technical design — SDOC Verification

v1, 19 Sep 2026 · Dylan · reviewers: Christabel (AI↔backend), Gene (backend/cloud), seunniee (frontend/diagram)

Covers the architecture, the reasoning, the alternatives rejected, and the
risks. The dated decision records at the bottom are the "why" — read those
before changing anything they cover.

## 1. Shape of the thing

One Cloud Run service. FastAPI serves the JSON API and the built React SPA from
the same origin, so judges get one URL and we get no CORS, no second deploy, no
second cold start.

```
                    GitHub main ──push──▶ Cloud Build ──▶ Artifact Registry ──▶ Cloud Run
                                                                                   │
  Browser (judge)                                                                  │
      │  GET /                    ┌────────────────── Cloud Run service ───────────┴──┐
      ├─────────────────────────▶ │  React SPA (static, built into the image)         │
      │  GET/POST /api/*          │                                                   │
      └─────────────────────────▶ │  FastAPI                                          │
                                  │    ├── /api/cases          case list + detail     │
                                  │    ├── /api/review         queue, resolve, retry  │
                                  │    ├── /api/metrics        dashboard              │
                                  │    └── /api/ingest         run the pipeline       │
                                  │              │                                    │
                                  │              ▼                                    │
                                  │   ┌───────── pipeline ──────────┐                 │
                                  │   │ classify → gate → extract   │                 │
                                  │   │ → normalize → compare       │                 │
                                  │   │ → confidence → escalate     │                 │
                                  │   └──────┬───────────┬──────────┘                 │
                                  │          │           │                            │
                                  │  bundled dataset     │                            │
                                  │  (in image, read-only)                            │
                                  └──────────┼───────────┼────────────────────────────┘
                                             │           │
              ┌──────────────┬───────────────┼───────────┴────────┬─────────────────┐
              ▼              ▼               ▼                    ▼                 ▼
         Firestore      Cloud Storage   Gemini API          Cloud Vision      Secret Manager
      cases · queue ·   attachments +   flash-lite / flash   OCR (scans)      GEMINI_API_KEY
      corrections       render cache    (structured output)
                                             │
                                             └──▶ Cloud Logging (structured JSON, one record per LLM call)
```

**The dataset is baked into the image.** Judges cannot reach localhost and the
organisers' server is not public, so `data/` (520 emails + 250 attachments,
~3 MB) ships inside the container, read-only. Cloud Storage holds anything
uploaded at demo time plus cached page renders for the highlighting view.

## 2. The pipeline

Deterministic spine, AI at two edges. Full step-by-step contract in
`docs/spec/pipeline.md`; this is the shape and the reasoning.

```
email record
  │
  ├─▶ [1] CLASSIFY ─── rules (sender domain + subject grammar) ──┐
  │                    └─ no rule matched ─▶ Gemini Flash-Lite ──┤
  │                                                              ▼
  │                                             category + decided_by: rule|llm
  │
  ├─ not BL_COMPARISON ─▶ record category, done
  │
  ├─▶ [2] GATE ── pair attachments, sniff each document's *real* type,
  │               prove it opens ── fail ─▶ NEEDS_REVIEW(missing_attachment
  │                                                    | wrong_doc_type
  │                                                    | unreadable)
  │
  ├─▶ [3] EXTRACT ── per-format deterministic parser (txt/pdf/docx/xlsx)
  │                  └─ parser returns < 7 fields, or doc is image-only
  │                     ─▶ Gemini Flash (native PDF / Vision OCR + image)
  │                  every field carries: value · evidence · label_seen · locator
  │
  ├─▶ [4] NORMALIZE ── three rules, nothing more (see ADR-002)
  │
  ├─▶ [5] COMPARE ── exact, field by field, SI as reference. Code only.
  │
  ├─▶ [6] CONFIDENCE ── per field, from deterministic signals
  │
  └─▶ [7] DECIDE ── blank/unreadable value or low confidence ─▶ NEEDS_REVIEW
                    ≥1 field differs ─▶ MISMATCH + defect_fields
                    else ─▶ OK
```

### Why this order, and why AI sits where it does

Classification is stage 1 and worth 30% of the machine score, and on inspection
the inbox is cleanly rule-separable — sender domain alone settles all 40 SPAM,
and subject grammar settles the rest. So rules run first and the LLM is the
fallback for whatever the grammar doesn't recognise. That is not
AI-avoidance: it is what makes the system survive a subject line nobody wrote a
rule for, and the organisers' scorer reads an optional `decided_by` field and
reports the rule/LLM split, which tells us they expect exactly this hybrid.

Extraction is the reverse case. Four file formats with four different physical
shapes — key-value lines, PDF text blocks with a container table, a bilingual
Word table, a three-column spreadsheet — parse deterministically and cheaply,
and a parser gives us an exact character offset for highlighting that an LLM
does not. So parsers run first. Gemini takes the cases parsers genuinely cannot
do: image-only scanned PDFs, and any layout the parser comes back short on. That
is a defensible answer to "where is the AI?" — it is at the edge where the
deterministic path ends, which is the only place it earns its cost.

Comparison is never AI. See ADR-001.

## 3. Data flow, one case

1. `POST /api/ingest` (or startup batch) reads an email record from the bundled
   dataset.
2. Pipeline runs; every LLM call is logged to Cloud Logging with prompt version,
   model ID, token counts, latency, and the parsed response.
3. A `Case` document is written to Firestore, with the seven
   `FieldComparison` records embedded.
4. If any field escalates, a `ReviewItem` is written to the queue collection with
   the reason and both evidence snippets.
5. The SPA reads `/api/cases`; opening one fetches the case plus signed URLs for
   its rendered document pages.
6. A reviewer resolves an item → `Correction` written → case re-runs from step 4
   → corrections feed back as synonym entries and few-shot examples.

## 4. Alternatives rejected

| Considered | Rejected because |
| --- | --- |
| **LLM does extract *and* compare in one call** | No reproducibility, no per-field confidence, no evidence offsets for highlighting, and a model that decides equality will happily call two different consignees "the same company." |
| **Two Cloud Run services (API + web) or Firebase Hosting for the SPA** | Two deploys, two cold starts, CORS config, two URLs to keep alive for judges. One image is smaller in every dimension that matters here. |
| **Cloud SQL / Postgres instead of Firestore** | Needs a VPC connector or a public IP to reach from Cloud Run, plus schema migrations, for data that is a handful of documents. Firestore's real-time listeners also give the review queue live updates for free. |
| **Pub/Sub + worker for pipeline runs** | 520 emails processed in a batch. Queueing infrastructure for a workload that finishes in minutes is cost without a benefit. Seam left: `/api/ingest` is already one-email-at-a-time. |
| **Vector DB / RAG over past corrections** | Corrections are looked up by exact field + document pair, not by semantic similarity. A Firestore query is the right tool. |
| **Fine-tuning an extraction model** | No time, no labelled training set we're willing to use (see held-out discipline in `docs/eval_plan.md`), and structured output on Flash already clears the bar. |
| **Cloud Document AI instead of Vision + Gemini** | Heavier setup, processor provisioning, and it overlaps what Gemini already does natively on PDFs. Vision covers the one case Gemini needs help with (image-only scans). |

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| **We overfit to this data draw.** The final round is a fresh seed or the real APRIL inbox. | High | High | Rules keyed on *grammar* (sender domain, subject verb) not on literal strings; LLM fallback for anything unmatched; no tuning against per-email labels; document every threshold's provenance. |
| **A false-positive field kills end-to-end.** `defect_fields` must match exactly; a spurious field scores zero on 50% of the weight. | Medium | High | Exact comparison, minimal normalisation, near-match → review not mismatch. Precision gate ≥ 0.95 in the eval. |
| **Gemini rate limits or an outage during judging.** | Medium | High | Deterministic path covers ~95% of the corpus with no LLM at all. Results are precomputed into Firestore before submission, so the live link never depends on a live model call. Response cache keyed by (prompt version, model, input hash). |
| **Cloud Run cold start makes the demo look broken.** | Medium | Medium | `min-instances=1` for the judging window; precomputed results mean first paint is a Firestore read. |
| **Scanned-PDF path (Vision) is the least-tested code.** Only 3 documents exercise it. | Medium | Low | It is 3 of 520 emails and all 3 are gold `NEEDS_REVIEW` anyway — so failing *safe* (escalate) already scores the same as succeeding. Build it for the demo, not for the score. |
| **Secret leakage.** | Low | High | Secret Manager in prod, gitignored `.env` locally, no key in any log line. |
| **Answer key in the public repo.** | Low | Critical | `sdoc-hackathon-docker/` gitignored; verified with `git check-ignore`. |

## 6. Open questions

- Firestore region and mode — Gene to confirm `asia-southeast1`, Native mode.
- Does Cloud Build deploy on every push to `main`, or on tag? (Leaning: every
  push, with the judging build pinned by revision tag on Sunday night.)
- Judge-uploaded documents: in scope for prelim, or final round? (PRD §8.)

---

# Decision records

One decision per record. Dated. Context → choice → consequences. These exist so
a future session — human or agent — doesn't refactor around a constraint it
can't see.

### ADR-001 — Comparison is deterministic code, never the LLM
**19 Sep 2026 · Accepted**

**Context.** The seven-field comparison is the product. Options were: let the
extraction model also report equality; ask a second model to adjudicate; or
compare in code.

**Decision.** Comparison is pure Python. The LLM's only outputs are a category
and a set of extracted values with evidence. Equality is decided by
`normalize(a) == normalize(b)`.

**Consequences.** Reproducible — the same inputs give the same verdict forever,
which is what makes the eval loop meaningful. Per-field confidence becomes
computable from signals we control. Costs us the ability to handle a genuinely
novel equivalence ("the same company under a former name") without a code change
— accepted; that case routes to review, which is the correct behaviour anyway.

### ADR-002 — Normalise exactly three things, and never fuzzy-match to equality
**19 Sep 2026 · Accepted**

**Context.** The original plan was legal-suffix stripping plus
`rapidfuzz.token_sort_ratio ≥ 95 → match`. Measurement against the corpus
(`docs/dataset_facts.md` §10) showed that on 94 text pairs, exact comparison
after label alignment produced **zero** false differences — and that the injected
shipper defects *are* suffix-level entity swaps:
`APRIL FINE PAPER TRADING` → `APRIL FINE PAPER TRADING (MIDDLE EAST) FZE`.
Suffix stripping merges real defects into false passes.

**Decision.** Three normalisations only:
1. **Weight** → strip all non-digits, compare as `int` (`243588` in xlsx vs
   `243,588` in docx vs `131,058 KG` in txt).
2. **Party name** → take the name only, first line / first cell, then case +
   whitespace + punctuation normalisation. Never strip legal suffixes.
3. **Port** → strip the trailing `(LOCODE)` and compare the city/country string.

A fuzzy ratio in the 85–99 band routes the field to **review**. It never
declares a match.

**Consequences.** Preserves recall on the defect class that matters most.
Produces some review items that a human will resolve as "same thing" — accepted,
because the cost of a review item is a click and the cost of a false pass is a
container. Every normalisation rule gets a unit test including its trap case.

### ADR-003 — Compare ports by city string; UN/LOCODE is a validity check only
**19 Sep 2026 · Accepted**

**Context.** The plan was to resolve port names to UN/LOCODE and compare codes —
the textbook approach, and wrong here. When the dataset injects a port
discrepancy it rewrites the city name and **leaves the original code in place**:
`MOMBASA, KENYA (KEMBA)` → `TUTICORIN, INDIA (KEMBA)`. 12 of 33 distinct cities
carry more than one code. Ports are the largest single defect class.

**Decision.** The comparison key is the normalised city/country string with the
parenthetical code stripped. The UN/LOCODE table is retained for two other jobs:
flagging an unresolvable port to review, and reconciling `SINGAPORE` (binary
formats carry no code) against `SINGAPORE (SGSIN)` (text format does).

**Consequences.** Code-based comparison would have scored **zero** on every port
defect while looking sophisticated. A city whose stated code disagrees with that
city's code elsewhere is now available as a *confidence* signal rather than a
comparison key. Risk: if the final round's data does the opposite — same city
string, different code — we'd miss it; noted as a known limitation, and the
code-disagreement signal partially covers it.

### ADR-004 — Rules classify first, the LLM is the fallback, and we report the split
**19 Sep 2026 · Accepted**

**Context.** Stage 1 is 30% of the machine score and uses **macro**-F1, so the 40
SPAM emails weigh as much as the 220 comparison requests. Inspection showed
sender domain settles SPAM completely and subject grammar settles the other four
categories, partitioning all 520 emails with no leftovers.

**Decision.** A rule layer runs first: sender-domain allowlist for SPAM, then
subject-grammar patterns keyed on the *verb* ("compare/confirm these docs" vs
"send me a draft BL" vs "send me an SI"). Anything unmatched — or matched with
low specificity — goes to Gemini Flash-Lite with the body included. Each result
records `decided_by: "rule" | "llm"`, which the organisers' scorer surfaces as
`rule_pct`.

**Consequences.** Near-perfect stage 1 for about forty lines of regex, at zero
latency and zero token cost, on the 30% of the score that is cheapest to win.
The LLM path is what makes it robust to a subject line we've never seen, which is
the realistic failure mode in the final round. Risk: rules keyed too literally to
this draw — mitigated by keying on grammar rather than exact strings, and by
tracking `rule_pct` so we can see if rule coverage collapses on new data.

### ADR-005 — `NEEDS_REVIEW` is a first-class outcome, and we escalate asymmetrically
**19 Sep 2026 · Accepted**

**Context.** The scorer treats escalation as a *diagnostic* axis worth 0% of the
final score. Meanwhile, escalating an email the gold data calls `OK` costs
nothing (both produce `has_defect: false`, `defect_fields: []`), but escalating
one it calls `MISMATCH` converts a caught defect into a miss, at ≈ 0.011 each.

**Decision.** Escalate **freely** when documents are missing, unreadable, the
wrong type, or a required value is blank — the conditions are deterministic and
the score cost is zero. Escalate **reluctantly** once both documents have parsed
cleanly and all seven fields are present; there, only a genuine borderline
(fuzzy 85–99) or a failed grounding check escalates.

**Consequences.** Maximises the reliability story — which is what the human
rubric rewards under Practical Value and Problem Understanding — without
trading away end-to-end points. Keeps the product honest: the system's "I don't
know" is load-bearing, not decoration. Note that the scorer never checks *which*
`review_reason` we give, so the reason is for the human, not the grader —
which is the right reason to get it right.

### ADR-006 — Eight internal escalation reasons, four on the wire
**19 Sep 2026 · Accepted**

**Context.** Our review queue needs finer reasons than the organisers' submission
schema accepts (`wrong_doc_type` · `missing_attachment` · `unreadable` ·
`missing_value`).

**Decision.** Keep the richer internal enum — `MISSING_ATTACHMENT`,
`UNREADABLE_DOCUMENT`, `WRONG_DOC_TYPE`, `FIELD_NOT_FOUND`, `GROUNDING_FAILED`,
`LOW_CONFIDENCE`, `BORDERLINE_MATCH`, `PROCESSING_ERROR` — and map down at the
submission boundary only. Mapping table lives in `pipeline/report.py`.

**Consequences.** The UI shows a reviewer something actionable ("the SI and BL
consignee differ only by a legal suffix") while the submission stays schema-valid.
One mapping function to keep correct, covered by a unit test.

### ADR-007 — One Cloud Run service serving both API and SPA
**19 Sep 2026 · Accepted**

**Context.** Judges need one public URL that works, unattended, during a judging
window we won't be present for.

**Decision.** FastAPI mounts the Vite build as static files at `/` and the API at
`/api/*`. One Dockerfile, one Cloud Build trigger, one revision. Dataset baked
into the image. `min-instances=1` during judging.

**Consequences.** No CORS, no split deploy, no second thing to keep warm, and the
link is trivially shareable. Costs us independent scaling of frontend and API —
irrelevant at this size. Seam left for the final round: the SPA mount is one
line to remove if we later split it behind a load balancer.
