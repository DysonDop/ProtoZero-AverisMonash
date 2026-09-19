# Technical design — SDOC Verification

v1, 19 Sep 2026 · Dylan · reviewers: Christabel (AI↔backend), Gene (backend/cloud), seunniee (frontend/diagram)

Covers the architecture, the reasoning, the alternatives rejected, and the
risks. The dated decision records at the bottom are the "why" — read those
before changing anything they cover.

## 1. Shape of the thing

One Azure Container App, behind Cloudflare. FastAPI serves the JSON API and the
built React SPA from the same origin, so judges get one URL and we get no CORS,
no second deploy, no second cold start. Region `southeastasia`. Cloudflare adds
the custom domain, TLS and static caching without changing any of that.

```
                 GitHub main ──push──▶ GitHub Actions ──▶ Container Registry ──▶ Container Apps
                                                                                      │
  Browser (judge)                                                                     │
      │                                                                                  │
      ▼                                                                                  │
  Cloudflare — custom domain · TLS · caches the SPA bundle · never caches /api/*          │
      │                                                                                  │
      │  GET /                    ┌────────────────── Container App ──────────────────┴──┐
      ├─────────────────────────▶ │  React SPA (static, built into the image)            │
      │  GET/POST /api/*          │                                                      │
      └─────────────────────────▶ │  FastAPI                                             │
                                  │    ├── /api/cases          case list + detail        │
                                  │    ├── /api/review         queue, resolve, retry     │
                                  │    ├── /api/metrics        dashboard                 │
                                  │    └── /api/ingest         run the pipeline          │
                                  │              │                                       │
                                  │              ▼                                       │
                                  │   ┌───────── pipeline ──────────┐                    │
                                  │   │ classify → gate → extract   │                    │
                                  │   │ → normalize → compare       │                    │
                                  │   │ → confidence → escalate     │                    │
                                  │   └──────┬───────────┬──────────┘                    │
                                  │          │           │                               │
                                  │  bundled dataset     │                               │
                                  │  (in image, read-only)                               │
                                  └──────────┼───────────┼───────────────────────────────┘
                                             │           │
              ┌──────────────┬───────────────┼───────────┴────────┬──────────────────┐
              ▼              ▼               ▼                    ▼                  ▼
          Cosmos DB     Blob Storage   Document Intelligence  Azure OpenAI       Key Vault
      cases · queue ·   attachments +  fields · tables ·      classify + extract  keys, or
      corrections       render cache   boxes · confidence     fallback            managed identity
                                             │
                                             └──▶ Application Insights (one record per service call)
```

**The dataset is baked into the image.** Judges cannot reach localhost and the
organisers' server is not public, so `data/` (520 emails + 250 attachments,
~3 MB) ships inside the container, read-only. Blob Storage holds anything
uploaded at demo time plus cached page renders for the highlighting view.

## 2. The pipeline

Deterministic spine, AI at two edges. Full step-by-step contract in
`docs/spec/pipeline.md`; this is the shape and the reasoning.

```
email record
  │
  ├─▶ [1] CLASSIFY ─── rules (sender domain + subject grammar) ──┐
  │                    └─ no rule matched ─▶ Azure OpenAI ───────┤
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
  │                  └─ short or image-only ─▶ Document Intelligence
  │                        (fields, tables, boxes, per-field confidence)
  │                        └─ labels still unmapped ─▶ Azure OpenAI
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
does not. So parsers run first.

What takes over when they fail is **Document Intelligence**, not a language
model — and that ordering is the point. It returns key-value pairs, tables,
bounding polygons and a per-field confidence, which is structured output we can
check, not prose we have to trust. It also reads the PDF container table
natively, which is the exact case that defeats a naive block parser. The
language model is the third resort, and its only extraction job is mapping an
unfamiliar label onto one of our seven fields when the synonym map misses.

That is a defensible answer to "where is the AI?" — each layer hands on only
what it genuinely cannot do, and we can show the per-stage counts to prove it.

Comparison is never AI. See ADR-001.

## 3. Data flow, one case

1. `POST /api/ingest` (or startup batch) reads an email record from the bundled
   dataset.
2. Pipeline runs; every service call is logged to Application Insights with
   prompt version, deployment name, token or page counts, latency, and the
   parsed response.
3. A `Case` document is written to Cosmos DB, with the seven
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
| **Skip the parsers, send everything to Document Intelligence** | It bills per page and adds latency for documents a 40-line parser reads exactly. Parsers also give exact character offsets; the service gives polygons. Keep it for what parsers can't do. |
| **Google Cloud (Cloud Run, Firestore, Vision, Gemini)** | Viable, and where this design started. Switched for team access and expertise (ADR-008), and because Document Intelligence is a better fit than raw OCR. |
| **Two services (API + web) or Static Web Apps for the SPA** | Two deploys, two cold starts, CORS config, two URLs to keep alive for judges. One image is smaller in every dimension that matters here. |
| **Azure SQL / Postgres instead of Cosmos DB** | Schema migrations and a connection story for data that is a handful of JSON documents. Cosmos takes our Pydantic models as-is. |
| **Table Storage instead of Cosmos DB** | Cheaper, but no rich querying and no change feed. We want `(category, status)` filters and, later, reacting to corrections. |
| **Service Bus + worker for pipeline runs** | 520 emails processed in a batch that finishes in minutes. Queueing infrastructure without a benefit. Seam left: `/api/ingest` is already one-email-at-a-time. |
| **Vector DB / RAG over past corrections** | Corrections are looked up by exact field + document pair, not by semantic similarity. A Cosmos query is the right tool. |
| **Fine-tuning an extraction model** | No time, no labelled training set we're willing to use (see held-out discipline in `docs/eval_plan.md`), and structured outputs already clear the bar. |

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| **Azure OpenAI is not enabled on the subscription, or the model isn't deployable in region.** | Medium | Critical | Verify in the portal *before* the build starts — it is the one blocker with no workaround inside the weekend. Fallback: keep the model layer on Gemini and everything else on Azure. |
| **We overfit to this data draw.** The final round is a fresh seed or the real APRIL inbox. | High | High | Rules keyed on *grammar* (sender domain, subject verb) not on literal strings; LLM fallback for anything unmatched; no tuning against per-email labels; document every threshold's provenance. |
| **A false-positive field kills end-to-end.** `defect_fields` must match exactly; a spurious field scores zero on 50% of the weight. | Medium | High | Exact comparison, minimal normalisation, near-match → review not mismatch. Precision gate ≥ 0.95 in the eval. |
| **Azure OpenAI quota or an outage during judging.** | Medium | High | The deterministic path covers ~95% of the corpus with no model call at all. Results are precomputed into Cosmos DB before submission, so the live link never depends on a live model call. Response cache keyed by (prompt version, deployment, input hash). |
| **Container Apps scales to zero and the first hit looks broken.** | Medium | Medium | Set min replicas to 1 for the judging window; precomputed results mean first paint is a Cosmos read. |
| **Scanned-PDF path (Document Intelligence) is the least-tested code.** Only 3 documents exercise it. | Medium | Low | It is 3 of 520 emails and all 3 are gold `NEEDS_REVIEW` anyway — so failing *safe* (escalate) already scores the same as succeeding. Build it for the demo, not for the score. |
| **DNS or certificate trouble on submission day.** | Medium | Critical | Set the domain up the night before, not on the day. The raw `*.azurecontainerapps.io` URL stays in the README as a documented fallback, so a broken custom domain degrades the link, never loses it. |
| **Cloudflare caches an API response.** | Medium | Medium | Cache rule bypassing `/api/*` from the start. Symptom is stale review-queue data, which reads as a product bug rather than a config one. |
| **Secret leakage.** | Low | High | Key Vault in prod (managed identity where the service supports it), gitignored `.env` locally, no key in any log line. |
| **Answer key in the public repo.** | Low | Critical | `sdoc-hackathon-docker/` gitignored; verified with `git check-ignore`. |

## 6. Deployment runbook — the custom domain

Do this **the night before submission, not on the day**. Certificate issuance and
DNS propagation are the two things that cannot be hurried, and the live link is a
hard gate.

1. **Azure** — add the custom domain to the Container App. Azure returns a TXT
   record (`asuid.<subdomain>`) and a CNAME target.
2. **Cloudflare DNS** — add the TXT record, and the CNAME pointing at
   `<app>.<region>.azurecontainerapps.io`, with the **proxy OFF (grey cloud)**.
3. **Azure** — validate the domain, then add the free managed certificate and
   wait for issuance.
4. **Cloudflare SSL/TLS** — set the mode to **Full (strict)**.
5. **Cloudflare DNS** — now turn the **proxy ON (orange cloud)**.
6. **Cache rule** — cache static assets; **bypass cache for `/api/*`**. A cached
   API response makes the review queue show stale data to the next viewer, which
   looks exactly like a bug in the product.
7. Verify in a private window **and** on a phone on mobile data.
8. Put **both** URLs in the README: the custom domain first, the raw
   `*.azurecontainerapps.io` URL underneath as the fallback.

> **The order in steps 2–5 is the whole trick.** With the proxy on during
> validation, the CNAME resolves to Cloudflare rather than the app and Azure
> cannot issue the certificate. And leaving SSL/TLS on *Flexible* once the proxy
> is on gives an infinite redirect loop — the page just never loads.

## 7. Open questions

- **Confirm Azure OpenAI is enabled on the subscription and the chosen models
  deploy in `southeastasia`.** Blocking; check first.
- Which Azure OpenAI deployments for classify and extract — a small one and a
  capable one. Portal decision, recorded in `pipeline/config.py`.
- Does GitHub Actions deploy on every push to `main`, or on tag? (Leaning: every
  push, with the judging build pinned to a revision on Sunday night.)
- Managed identity or Key Vault keys for Cosmos and Document Intelligence?
  Managed identity is cleaner; keys are faster to get working.
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
low specificity — goes to Azure OpenAI with the body included. Each result
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

### ADR-007 — One Container App serving both API and SPA
**19 Sep 2026 · Accepted**

**Context.** Judges need one public URL that works, unattended, during a judging
window we won't be present for.

**Decision.** FastAPI mounts the Vite build as static files at `/` and the API at
`/api/*`. One Dockerfile, one GitHub Actions workflow, one revision. Dataset
baked into the image. Minimum replicas set to 1 during judging.

**Consequences.** No CORS, no split deploy, no second thing to keep warm, and the
link is trivially shareable. Costs us independent scaling of frontend and API —
irrelevant at this size. Seam left for the final round: the SPA mount is one line
to remove if we later split it behind Front Door.

### ADR-008 — Microsoft Azure, and Document Intelligence over raw OCR
**19 Sep 2026 · Accepted · supersedes the Google Cloud choice in ADR-007 v1**

**Context.** The design was first drafted against Google Cloud. Two facts changed
it: the team has Azure credits and a member who has deployed there before, and
**no pipeline code existed yet** — the cost of switching was seven documents,
not a rewrite. A cloud migration after tonight's build would have been a
different conversation.

**Decision.** Everything on Azure: Container Apps, Cosmos DB, Blob Storage,
Key Vault, Application Insights, GitHub Actions, Azure OpenAI. Crucially, the
scan/hard-layout reader is **AI Document Intelligence**, not raw OCR.

**Consequences.** Document Intelligence is a genuine upgrade rather than
parity: it returns key-value pairs, tables, bounding polygons and per-field
confidence, where Cloud Vision returns OCR text we would have had to
re-structure ourselves. That maps almost one-to-one onto `ExtractedField`
(`value`, `evidence`, `locator`, `service_confidence`), it reads the PDF
container table natively — the case that defeats a naive block parser — and it
gives the confidence score a real signal instead of a model's self-rating.

It also *demotes* the language model: extraction is now parser → structured
service → model, so the model does strictly less than it did under the previous
design. That strengthens principle 2 rather than bending it.

Two costs, both accepted. Azure OpenAI is addressed by **deployment name**, not
model id, so the model behind a call is a portal decision and `config.py` holds
names — recorded so nobody hunts for a model string that isn't in the code. And
Azure OpenAI can require an approval step on a subscription; that check is the
first item on the build, because it is the only blocker with no same-weekend
workaround (fallback: keep the model layer on Gemini, everything else on Azure).

That the architecture ported between clouds in an afternoon, untouched — the
same five stages, the same contracts, comparison still plain code — is itself
evidence the design is sound, and it is worth saying on the architecture slide.

### ADR-009 — Cloudflare at the edge, Azure underneath
**19 Sep 2026 · Accepted**

**Context.** The live public link is a hard gate and 25 marks. The default
`*.azurecontainerapps.io` hostname is long and forgettable, and we own a domain.
The options were: use the Azure hostname as-is; put Cloudflare in front for DNS,
TLS and caching; split the SPA onto Cloudflare Pages; or move hosting to
Cloudflare entirely.

**Decision.** Cloudflare handles DNS, the custom domain, TLS and static caching.
Azure Container Apps keeps serving the whole application. Nothing about the
architecture, the deploy, or the request path inside the app changes.

**Consequences.** A short memorable URL for judges, TLS, and the SPA bundle
served from an edge cache, for roughly twenty minutes of DNS work and no code.
ADR-007 survives intact — still one origin, one deploy, no CORS.

Rejected with it: **Cloudflare Pages for the SPA**, which would reverse ADR-007
for no scored benefit — two deploys, two things to keep warm, CORS config, two
URLs; and **Workers or Cloudflare Containers as the host**, because the parsers
depend on PyMuPDF, python-docx and openpyxl, which are native dependencies
Workers cannot run, and adopting a new platform a day before freeze is the kind
of risk this project has otherwise avoided.

Worth being honest in the deck: this is polish, not integration. Cloudflare is
not doing core work here, and claiming it under Technology Integration alongside
services that genuinely carry the pipeline would weaken the argument rather than
strengthen it. It earns a clause, not a card.
