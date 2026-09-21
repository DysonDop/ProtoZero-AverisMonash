# Improvement plan — phased

Each phase is self-contained. Run one per session. Every phase states what it
changes, how it is verified, and what it must not break.

Baseline at time of writing: **final score 0.9908** (stage1 0.975 / stage3 1.000
/ end-to-end 1.000), 28 tests passing, HEAD `a838e6b`.

Reproduce the baseline before and after every phase:

```bash
.venv/bin/python -m eval.run_eval --source sdoc-hackathon-bundle --no-llm --out /tmp/sub.json
cd sdoc-hackathon-docker/server && \
  ../../.venv/bin/python score_cli.py /tmp/sub.json --ground-truth ../data_v2/ground_truth.json
```

## Phase 0 — findings that override the brief

Established by direct inspection. Do not re-derive; do not plan against the
superseded claims.

| Assumption | Reality | Evidence |
| --- | --- | --- |
| Azure is "unconfigured" | `pipeline/azure_llm.py` and `pipeline/azure_docintel.py` have **0 commits in all history**. Tiers 2 and 3 were never written | `git log --all -- <path>` empty; 0 Azure SDK imports in project Python |
| `react-pdf` is in the stack | **Not installed.** `web/package.json` is react, react-dom, vite, @vitejs/plugin-react | the claim is one aspirational cell, `CLAUDE.md:73`, "react-pdf *when the scan path lands*" |
| `results.csv` schema needs designing | **Already specified**, 24 columns | `docs/eval_plan.md:89-96` |
| xlsx text can be re-gridded | **No.** Empty cells are dropped before joining on `" \| "`, so column positions are lost | `parsers/xlsx.py:28` |
| a deserialization pattern exists | **No.** `model_validate` appears nowhere in the repo. Dump side is established, load side is greenfield | grep across `api pipeline tests eval web` |
| `page_urls` carries page images | Hardcoded `[]`, never read by any frontend file | `api/main.py:396` vs `docs/contracts.md:224` |

Also dead on arrival, remove or use: `LLM_FALLBACK_CONFIDENCE_FLOOR`
(`config.py:55`, never read), `CircuitBreaker.reset()` (never called), the
response cache described at `docs/eval_plan.md:108` (does not exist).

`CLAUDE.md`'s Layout section is substantially wrong — `pipeline/prompts/`,
`eval/golden/`, `data_refs/unlocode_seaports.csv` and
`data_refs/company_suffixes.txt` do not exist, and the documented command
`--source data` fails because `data/` does not exist. Correct it in Phase 8.

### P0-URGENT — ground truth is public

`sdoc-hackathon-docker/` is **tracked and pushed** (790 files, including
`data_v2/ground_truth.json`) to a **public** repo, added by `caedca7`.
`.gitignore` has no `sdoc` entry, so `CLAUDE.md:39` was never enforced.

Blocked on a human decision — history rewriting affects three other clones and
is outward-facing. Not to be actioned by an agent unprompted.

---

## Phase 1 — B1, the word-boundary defect

**Change.** `pipeline/classify.py:98`, drop the trailing `\b`:

```python
_SI_REQUEST_SUBJECT = re.compile(r"^(CUST SI|REQUEST SI|SI NEEDED|NEW SI)", re.I)
```

`\b` cannot match between `D` and `_`, and `_` is this corpus's field
separator, so `SI NEEDED_ 5APH-26773 _ …` falls through to the GENERAL default.
Apply the same fix to `DRAFT BL\b` in `_COMPARISON_SUBJECT` (`classify.py:88`)
— it costs nothing today but is the identical latent bug.

**Add a regression test** in `tests/test_classify.py`. There is currently no
test for the `SI NEEDED_` template; only the coded `SI - … - DIRECT(…)` path is
covered (`tests/test_classify.py:26-34`).

```python
def test_underscore_separator_does_not_defeat_the_si_rule():
    cat, by, _ = classify(
        "RE_ SI NEEDED_ 5APH-26773 _ UAB NOVAKOPA _ PO_25_2186 _ MERSIN",
        "", "docs@aprilasia.com", 0)
    assert cat == "SI_REQUEST" and by == "rule"
```

**Verify.** 80 subjects match the rule, up from 67. Stage 1 accuracy 0.975 →
1.000, final 0.9908 → ~0.998. `pytest -q` at 29 passed.

**Must not break.** No other category's counts may move. Check the full
category histogram before and after: `BL_COMPARISON=220 GENERAL=73
INVOICE_QUERY=75 SI_REQUEST=112 SPAM=40` becomes `GENERAL=60 SI_REQUEST=125`.

**Anti-pattern guard.** Justify from subject grammar alone. Do not open
`ground_truth.json` to pick the rule — `CLAUDE.md:39` forbids deriving rules
from per-email labels, and a rule fitted to this draw is a number that lies.

---

## Phase 2 — B6, the results log

**Change.** `eval/run_eval.py`. Add `--results-csv` (default
`eval/results.csv`) and `--notes`. After the submission is written
(`run_eval.py:94-99`, between the write and `_print_summary` at `:101`), append
one row.

Use the 24-column schema at `docs/eval_plan.md:92-96` verbatim. Do not invent
columns; do not reorder.

Scoring is a subprocess to `sdoc-hackathon-docker/server/score_cli.py --json`,
which prints only `json.dumps(score_all(...))` (`score_cli.py:44-47`). It does
`import scoring` unqualified, so run it with `cwd` at
`sdoc-hackathon-docker/server/`. Map:

```
final_score            <- final_score
stage1_macro_f1        <- stage1.macro_f1
stage1_accuracy        <- stage1.accuracy
stage3_defect_f1       <- stage3.defect_f1
stage3_defect_precision<- stage3.defect_precision
stage3_defect_recall   <- stage3.defect_recall
stage3_field_f1        <- stage3.field_f1
end_to_end_rate        <- end_to_end.rate
escalation_recall      <- reliability.escalation_recall
escalation_precision   <- reliability.escalation_precision
rule_pct               <- stage1.rule_pct
```

Score columns stay empty when ground truth is absent — the runner must not
require it. `git_sha` from `PIPELINE_VERSION` (`config.py:17`), `dirty` from
`git status --porcelain`. `parser_pct` and `llm_calls` are computable from
`cases`; the formulas already exist at `api/store.py:148-161` — reuse them
rather than re-deriving. `wall_clock_s` is `elapsed` (`run_eval.py:93`).

**Verify.** Two runs append two rows. Header written once. `final_score`
column reads `0.9908` (or `~0.998` after Phase 1).

**Must not break.** `--no-llm` must still complete with zero cloud calls, and
the runner must still exit 0 with no ground truth present. `_print_summary`
output unchanged.

**Anti-pattern guard.** Never hand-edit `results.csv` (`CLAUDE.md:36`,
`docs/eval_plan.md:99`). The file is evidence.

---

## Phase 3 — B2, measure the grammar layer

**Change.** No production change. Add `--no-subject-rules` to the eval runner,
or a small script, that disables the five literal subject-template branches in
`classify_rules` (`classify.py:134-151`) and leaves SPAM, the grammar fallback
and the default.

Today 465 of 520 (89.4%) are decided by literal templates and the grammar
fallback fires **0 times**, despite `classify.py:6-11` arguing for grammar over
literals precisely because the final round is a fresh draw.

**Verify.** Record the resulting stage-1 macro-F1 as a row in `results.csv`
with `notes=grammar-only`. That number is the fresh-draw robustness figure.

**Must not break.** The flag is measurement-only and must default off. No
threshold moves in this phase.

**Deliverable.** A short section in `docs/eval_plan.md` stating the measured
grammar-only score. If it is poor, that is the finding — do not tune the
grammar rules to improve it in this phase, or the number stops meaning anything.

---

## Phase 4 — F1, offline banner (frontend, small)

**Change.** `offlineMode` is exported at `web/src/api.js:5` and consumed in
exactly one file, `Review.jsx`, only to hide buttons. Add one persistent banner
when it is true: "Showing sample data — the case service is not connected."

`.modebanner` already exists in `web/src/index.css:71` with a mark, and is the
intended component. Reuse it; do not add a new colour.

**Verify.** Run with and without `web/.env.development`. Banner present only in
mock mode. `npx vite build` clean.

**Must not break.** `web/src/index.css` is the only place colour and type live
(`CLAUDE.md`). Do not touch `--brand`; the white-on-orange 2.64:1 exception is
deliberate (`docs/design_system.md` §2.2).

---

## Phase 5 — F4, review queue correctness (frontend, small)

**Change.** `web/src/Review.jsx:47` sends `field: item.fields[0] ?? null`,
silently dropping every other field. `item.fields` is used in exactly two
places, `:47` and `:226`. Either resolve per-field, or post the whole list and
widen the endpoint — decide with Christabel, who owns this file.

Then fill in `ACTIONS` (`Review.jsx:19-24`): it has 4 keys against 9 in `TITLE`
(`:7-17`). The five without entries fall back to generic Confirm/Correct, so
"We could not find the evidence" and "Too close to call" offer identical
buttons. Note the labels are only rendered in `offlineMode` (`:219-223`) —
confirm that is intended before investing.

**Verify.** Construct a review item with two fields and confirm both are
carried. 0 such items exist in this draw, so this needs a fixture.

**Must not break.** The optimistic-update-and-rollback pattern at
`Review.jsx:38-59`, and the workflow round trip at `:77-95`.

---

## Phase 6 — F2, consolidated correction message

**Change.** The highest-value item in the list. An operator's real output is
one reply to the carrier listing every correction; today they retype it.

The data already exists and is unused: `AuditEvent.previous_value` and
`AuditEvent.new_value` (`pipeline/schemas.py:245-257`) are **never rendered
anywhere in the frontend**. They arrive via `getAuditEvents`
(`web/src/api.js:61`). `CaseReport.jsx:8` already filters
`action === 'HUMAN_CORRECTION'`.

Copy the clipboard pattern from `AuditTrail.jsx:51-65` (including the 1800 ms
"Copied" reset and the `copied` state at `:26`) — not the Blob download at
`:67-77`, and not `api.js:downloadUrl`, which is for server-generated files.

Wrong-then-right already has an established idiom: `Sheet.jsx:70-73`
(`.strike` then `.fix`) and `CaseView.jsx:250-271` (a `<dl>` fact list). Match
one; do not invent a third.

**Verify.** On a MISMATCH case, the clipboard holds one line per differing
field with the SI value, the draft value and the correction. Check against
`email_004`.

**Must not break.** "Say each thing once" (`CLAUDE.md`). If the correction is
already on screen, the button copies it — it does not restate it.

---

## Phase 7 — B5, persistence

**Change.** `api/store.py` is `MemoryStore` over plain dicts; everything dies
on restart. Minimum viable: persist `decisions`, `corrections` and `events` to
a JSON file. Cases are re-derived from the bundle on boot and need not persist.

Write points are a small, closed set (grep-verified, all in `api/main.py`):
`put_decision` ×1 (`:514`), `delete_decision` ×1 (`:565`), `put_correction` ×1
(`:691`), and **all** audit writes funnel through one helper, `_add_event`
(`:804-830`). Hook those four.

Load on boot in `ensure_loaded()` (`api/main.py:104-121`), before the
`ingest()` fallback.

Serialization: copy `eval/run_eval.py:94-99` — `model_dump(mode="json")` +
`json.dumps(indent=2)` + `write_text(encoding="utf-8")`. Deserialization has
**no precedent in the repo**; write `Model.model_validate(d)` and be explicit
about it.

**Watch:** `replace_reviews` (`store.py:55-59`) rebinds `self.reviews` to a new
dict — wrap the method, never hold a reference to the attribute. All datetimes
are written tz-aware via `datetime.now(timezone.utc)`; a naive one entering the
round trip will raise on comparison.

**Verify.** Record a decision, restart uvicorn, confirm it is still there and
the audit trail is intact.

**Must not break.** Boot must still succeed with no state file. `/api/health`
must still report `cases: 520`.

**Ask first.** Cosmos DB is the documented answer but is a paid service —
`CLAUDE.md` requires asking Dylan before adding one.

---

## Phase 8 — B4, confidence

**Change.** Confidence is effectively constant: 5 distinct values across 798
field comparisons, 97.5% are 0.739 or 0.713. Measured input behaviour:

| Input | Weight | Actual |
| --- | --- | --- |
| `cross_check` | 0.35 | 0.5 on 97.6% — `pdf_cross_checks` only returns values for container count and gross weight, only for PDFs with row tables |
| `service_confidence` | 0.20 | 0.5 always (no Azure) |
| `model_selfrating` | 0.05 | 0.5 always (no Azure) |
| `doc_quality` | 0.30 | only 1.0 or 0.9; the 0.5 scan tier never reaches comparison |
| `label_directness` | 0.25 | 1.0 on 99.2% |

60% of the weighted sum is pinned at exactly 0.5. The lowest score in the
corpus is 0.626, so `REVIEW_THRESHOLD = 0.55` is unreachable and the
`LOW_CONFIDENCE` path is dead. The 0.2 "rows contradict the total" signal never
fires once.

Pick one, do not do both: **(a)** give it signal — widen cross-checks beyond
PDF row tables so the measure varies; or **(b)** stop presenting it — remove
the confidence percentage from the case report and keep the hard gates
(`grounded`, `parse_valid`), which are what actually route today.

(b) is the honest default while tiers 2 and 3 do not exist. (a) only becomes
meaningful after Phase 9.

**Also in this phase:** correct `CLAUDE.md`'s Layout section and the broken
command (see Phase 0).

**Verify.** If (a): the distinct-value count rises and some field lands below
0.55. If (b): no confidence figure appears in the UI or the PDF, and
`REVIEW_THRESHOLD` is either used or removed.

**Must not break.** The hard gates must keep routing. Do not let a heuristic
reach the verdict — comparison stays exact (`CLAUDE.md` principle 1).

---

## Phase 9 — B3, the missing tiers (largest, decide before starting)

**This is not configuration. It is two modules that have never existed.**

The sockets are all defined and waiting:

| Contract | Where | Shape |
| --- | --- | --- |
| classifier | `pipeline/classify.py:180-190` | positional 4-arg `(subject, body[:800], domain, n_attachments)` → `(Category, float)` |
| extractor | `pipeline/run.py:113-131` | positional 3-arg `(attachments, documents, read_bytes)` → `dict[str, ParsedDocument] \| None`; falsy is ignored |
| `ParsedDocument` | `parsers/read.py:21-32`, helper `:47-59` | the only correct way to build one |
| breaker wrapping | `pipeline/run.py:205-226` | already done — adapters are plain functions |
| prompt spec | `docs/spec/pipeline.md:55-63`, `:149-186` | the only prompt definition that exists |
| reserved literals | `pipeline/schemas.py:35` | `"doc_intelligence"` and `"llm"` already valid |

`eval/run_eval.py:55` hardcodes `extract_fallback = None` and never reassigns
it, and never constructs a breaker — fix that asymmetry with `api/main.py:57-65`.

**Decide first.** Either build it and show it earning its place on the 15
emails that currently reach no rule and default to GENERAL at 0.30 confidence —
or cut the three-tier claim from the deck and the docs. Shipping a deck that
promises three tiers over a one-tier system is the worse outcome.

**Requires:** an Azure OpenAI deployment and credentials. Ask Dylan.

**Must not break.** `--no-llm` must remain a complete, schema-valid path with
zero cloud calls (`eval/run_eval.py:6-8`). The LLM must never reach comparison.

---

## Phase 10 — F3, evidence rendering (largest frontend, needs a dependency)

**Change.** `Evidence.jsx:86-92` renders every format as one `<pre>` of text.
22 xlsx show a flattened cell dump; 28 pdf show stripped text; scans show
nothing at all (`text` is `""` for `scan_pdf`).

**Blockers, both real:**

1. **An xlsx grid cannot be rebuilt from the API response.**
   `parsers/xlsx.py:28` drops empty cells before joining on `" | "`, so
   `["A","","C"]` becomes `"A | C"` and column alignment is gone. Options: add
   a structured field to the document endpoint (`api/main.py:391-397`), or
   fetch `/raw` bytes and parse client-side — but `/raw` sets
   `Content-Disposition: attachment` for xlsx (`api/main.py:421`), which would
   need changing.
2. **`react-pdf` is not installed** and neither is any PDF or grid library.
   Adding one is a new dependency plus a pdf.js worker configuration under
   Vite. `CLAUDE.md` requires asking Dylan.

`page_urls` is hardcoded `[]` (`api/main.py:396`), so a page-image approach
starts from zero on both ends.

**Cheapest honest increment**, if the dependency is refused: render the xlsx
locator (`sheet`, `line`, both already carried — `xlsx.py:42`, 1-indexed) as a
small table built from splitting `text` on `" | "`, and label it as an
approximation. Do not claim fidelity the data cannot support.

**Must not break.** `docs/design_system.md:432-440` already specifies the
per-format render plan and warns that one component does not cover all three.
Follow it. seunniee owns this file.

---

## Final phase — verification

1. `pytest -q` — 29+ passing.
2. Baseline command above — score at or above `0.998`.
3. `eval/results.csv` — one row per run, never hand-edited.
4. `npx vite build` — clean.
5. Layout: `node audit.mjs` — 45 combinations, 0px overflow, 0 misaligned.
6. Grep for the anti-patterns this plan exists to prevent:
   - `grep -rn '\\b' pipeline/classify.py` — no word boundary before a `_` separator
   - `grep -rn 'react-pdf' web/package.json` — present only if Phase 10 was approved
   - `grep -c 'model_validate' api/store.py` — non-zero only if Phase 7 ran
7. `/api/health` — `cases: 520`, and `mode` honestly reflects what exists.
