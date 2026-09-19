# PRD — SDOC Verification (prelim round)

Owner: Dylan (AI quality) · Team Protozero · v1, 19 Sep 2026
Status: agreed baseline. Changes here need a line in the changelog at the bottom.

## 1. Problem

A shipping-line documentation desk receives a mixed inbox. Buried in it are
requests to check a **draft Bill of Lading** against the **Shipping
Instruction** the shipper sent. Someone opens two documents, reads seven fields
off each, and eyeballs them side by side. It is slow, it is done under time
pressure before a vessel cut-off, and the two documents deliberately use
different labels for the same field — `Port of Loading` on one, `Load Port` on
the other — so the checker is doing a translation task as well as a comparison.

The failure modes are asymmetric:

- **A missed discrepancy** (wrong consignee, wrong discharge port, wrong
  container count) means a container is released to the wrong party, or a BL has
  to be amended after issue — real money, and in the consignee case, real cargo loss.
- **A false alarm** is cheaper per incident but compounds: an operator who has
  been wrong-flagged five times stops reading the sixth flag.

So the target is not "high accuracy." It is **high recall on real discrepancies
with near-zero false alarms, and an honest "I don't know" everywhere else.**

## 2. Users

| User | What they need |
| --- | --- |
| **Documentation executive** (primary) | The comparison result for one email, in seconds, with the exact spot in each document the answer came from. |
| **Reviewer / senior exec** (primary) | A queue of only the cases the system refused to decide, each with its evidence and its reason, and a way to confirm or correct in one click. |
| **Ops lead** (secondary) | Volume, mismatch rate, queue depth, and how much checking time was displaced. |

## 3. Scope — what we are building

### 3.1 Core flow (must work end-to-end at prelim)

1. **Classify** every email into `BL_COMPARISON` · `SI_REQUEST` ·
   `INVOICE_QUERY` · `GENERAL` · `SPAM`. Only comparison requests continue.
2. **Resolve and read** the attached SI and draft BL across `.txt`, `.pdf`,
   `.docx`, `.xlsx`, and image-only scanned PDFs.
3. **Extract** seven fields from each document, each with the evidence snippet
   it came from: `shipper`, `consignee`, `notify_party`, `port_of_loading`,
   `port_of_discharge`, `container_count`, `gross_weight_kg`.
4. **Compare** deterministically, SI as reference, and report each differing
   field side by side (`container_count — SI: 3 / BL: 4`), or "No mismatch detected."
5. **Escalate** anything it cannot decide — missing or unreadable attachment,
   wrong document type, blank required value, borderline match — to a human
   review queue with the evidence and the reason.
6. **Human review** confirms or corrects; the report updates; the correction is
   stored and reused.

### 3.2 Prelim must-haves (beyond the core flow)

- Per-field **confidence score** with a visible breakdown of what drove it.
- **Review queue** with confirm / correct / retry, and the case status updating.
- **Explainable discrepancies** — every flagged field shows both values and both
  source snippets.
- **Document highlighting** — click a field, see it located in the source document.
- **Smart normalisation** — label synonyms, number formats, name/address shapes.

### 3.3 Prelim "wow" (build if core is green by Sat night)

- **Learning from corrections** — a reviewer's correction becomes a synonym-map
  entry or a few-shot example for later cases.
- **Ops dashboard** — volume, mismatch rate, queue depth, estimated time saved.

## 4. Non-goals

An agent treats ambiguity as permission, so these are explicit. **We are NOT building:**

| Not building | Why |
| --- | --- |
| **Unit conversion** (MT / tonnes / LBS → kg) | Zero occurrences across all 250 attachments. One `parse_int` covers 100%. Leave a one-function hook, not a module. |
| **A container-count grammar** (`THREE (3)`, `01 X 40'HC`, `2 x 20' + 1 x 40'`, cartons, TEU) | Zero occurrences. Format is uniformly `N x SIZE`. |
| **`TO ORDER` / `SAME AS CONSIGNEE` resolution** | Zero occurrences. `To the Order of` appears only as a *label* for a named consignee. |
| **UN/LOCODE-keyed port comparison** | Actively harmful — the dataset's injected port defects leave the original code in place, so code-comparison misses every one. LOCODE is a validity check only. |
| **Aggressive company-name normalisation** (legal-suffix stripping + fuzzy ≥95 → match) | The injected shipper defects *are* suffix-level entity swaps. Merging them is a missed defect. Near-match routes to review. |
| **LLM-adjudicated field matching** | Non-determinism in the one place we need reproducibility. |
| **LangChain / LangGraph / vector DB / Kubernetes / microservices** | Debugging cost, no rubric points. |
| **Real mailbox (IMAP/Graph) integration** | The dataset *is* the inbox. A connector is a final-round line item. |
| **Multi-tenant auth, RBAC, user management** | Single-desk demo. A `reviewer_id` field, no login. |
| **Deleting anything** | Cases carry a `status` lifecycle from day one; retention/auto-archive is deferred to the final round. |

## 5. Success criteria

### 5.1 Machine (organisers' self-eval, `POST /submit`)

`final = 0.30·stage1_macro_F1 + 0.20·stage3_defect_F1 + 0.50·end_to_end_rate`

Baseline (unmodified `sample_submission.json`) is **0.0124**.

| Gate | Target | Rationale |
| --- | --- | --- |
| **Must ship** | ≥ 0.70 | Classification near-perfect (0.30) plus roughly two-thirds of defects end-to-end. |
| **Target** | ≥ 0.85 | |
| **Stretch** | ≥ 0.95 | |
| Stage-1 macro-F1 | ≥ 0.98 | Rule-separable on inspection; macro weighting means the 40 SPAM emails matter as much as the 220 comparisons. |
| Defect **precision** | ≥ 0.95 | False alarms are the product risk, and end-to-end demands an *exact* `defect_fields` set — one spurious field scores zero on 50% of the weight. |
| Escalation recall (gold `NEEDS_REVIEW`) | ≥ 0.90 | Scores nothing directly; it is the reliability story. |

There are **46 gold defect emails**, so each is worth ≈ 0.011 of the final score.
That is the whole game; everything else is rounding.

### 5.2 Human (prelim rubric, /100)

| Criterion | Pts | What we point at |
| --- | --- | --- |
| Working Core Prototype | 25 | Live link, judge pastes/opens an email, sees the full flow |
| System Design & Architecture | 15 | `docs/architecture.md` + the diagram |
| Technology Integration | 15 | Container Apps + Cosmos DB + Blob + Document Intelligence + Azure OpenAI + Key Vault + GitHub Actions, each doing real work |
| Technical Feasibility & Validation | 15 | `eval/results.csv` score-over-time chart + documented limitations |
| Problem Statement Understanding | 10 | The asymmetric-cost framing in §1 |
| Innovation & Solution Approach | 10 | Deterministic-comparison-with-AI-at-the-edges; learning from corrections |
| Practical Value & Potential | 10 | Time-saved metric, final-round roadmap |

### 5.3 Deliverables (mandatory, per rules)

Public GitHub repo with setup README · live public link (no localhost, dataset
bundled) · demo video ≤ 5:00 · slide deck covering technical architecture,
implementation details, challenges faced, future roadmap · project description.

## 6. Key user stories

- As a doc exec, I open a comparison case and see the seven fields side by side,
  differences highlighted, so I can confirm or reject in under 30 seconds.
- As a doc exec, I click a flagged field and the source document scrolls to and
  highlights the exact text the value came from, so I can verify without opening
  the attachment myself.
- As a reviewer, I see only the cases the system refused, each stating *why*, so
  I spend my attention where the machine genuinely could not decide.
- As a reviewer, I correct a wrong extraction and the case re-runs and updates,
  and the same mistake is less likely next time.
- As an ops lead, I see mismatch rate and queue depth over time, so I can tell
  whether the desk is getting faster.

## 7. Constraints

- All work inside 18–22 Sep 2026. Feature freeze **Sun 20 Sep night**; fixes
  only after. Submit **Mon 21 Sep night**; form closes Tue 22 Sep 12:00 MYT.
- AI must be a key component; cloud infrastructure must be used *meaningfully* —
  weak cloud use is explicitly penalised.
- The final round must be an **extension** of this entry, so every deferred item
  in §4 gets a seam left for it, not a rewrite.

## 8. Open questions

- Azure region `southeastasia`, and **confirm Azure OpenAI is enabled on the subscription** — some need an approval step, and it is the one thing that can block the build outright.
- Does the live demo let judges upload **their own** SI/BL pair, or only browse
  the bundled inbox? (Upload is a stronger demo and a bigger attack surface.)
  → leaning: bundled inbox by default, upload behind a clearly-labelled tab.

## Changelog

- **v1, 19 Sep 2026** — initial. Non-goals §4 written against measured dataset
  facts (`docs/dataset_facts.md`), which cut four planned modules.
