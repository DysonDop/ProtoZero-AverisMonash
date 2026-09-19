# Evals & test plan

v1, 19 Sep 2026 · Dylan owns this. Written **before** generation — this is the
definition of "correct" that the agent's work is checked against.

## 1. Held-out discipline (read first)

We were sent the organisers' package by mistake. It contains
`data_v2/ground_truth.json` and the generator source. The rules say nothing about
leaked materials, so this is our call, and the line we hold is:

| Artefact | Use | Why |
| --- | --- | --- |
| `scoring.py` / `score_cli.py` | **Yes** | It is the rubric. It is the same computation `POST /submit` runs, and the brief grants unlimited self-eval. |
| `ground_truth.json` → **aggregate scoreboard only** | **Yes** | Identical to what `/submit` returns. Saves a Docker round-trip and nothing else. |
| `ground_truth.json` → per-email labels, diffing, error analysis by label | **No** | This is the one that makes every number below meaningless. |
| `generate.py`, `pools.py`, `shipment.py`, `edgecases.py` | **No** | Anything fitted to this draw is worthless in the final round (fresh seed, possibly the real APRIL inbox) and produces a validation story that is a lie. *Technical Feasibility & Validation* is 15 points awarded for evidence, not for score. |

`sdoc-hackathon-docker/` is gitignored; verified with `git check-ignore`. It
never reaches the public repo.

**Error analysis is done by reading the source documents, not the key.** When our
result disagrees with the scoreboard's aggregate, we open the SI and the BL,
decide what the right answer is ourselves, and record the reasoning. The brief
asks for exactly this: *"if our result differs from the reference, check the
source docs first, and if our decision is reasonable, record the reason."*
Those go in `eval/disagreements.md`.

## 2. What we measure

### 2.1 The organisers' score (primary)

```
final = 0.30·stage1_macro_F1 + 0.20·stage3_defect_F1 + 0.50·end_to_end_rate
```

Baseline, unmodified `sample_submission.json`: **0.0124**.

Tracked separately every run, because the aggregate hides the thing that matters:

| Metric | Why we watch it |
| --- | --- |
| `stage1_macro_f1` | 30% of score. Macro — the 40 SPAM emails weigh as much as the 220 comparisons. |
| `stage3_defect_precision` | **The product metric.** False alarms are the failure mode that kills adoption. Gate: ≥ 0.95. |
| `stage3_defect_recall` | Missed discrepancies. |
| `stage3_field_f1` | Are we naming the *right* fields, not just detecting *a* problem. |
| `end_to_end_rate` | 50% of score. Requires the `defect_fields` set to match **exactly** — one spurious field scores zero for that email. |
| `escalation_recall` / `escalation_precision` | Scores 0, but it is the reliability story and the human rubric rewards it. |
| `rule_pct` | Share classified with no LLM call. Cost and robustness signal. |
| `llm_calls`, `tokens`, `wall_clock` | Budget. |

**Each of the 46 gold defect emails is worth ≈ 0.011 of the final score.** When
choosing what to fix next, that is the exchange rate.

### 2.2 Gates (from PRD §5.1)

| Gate | Target |
| --- | --- |
| Must ship | final ≥ 0.70 |
| Target | final ≥ 0.85 |
| Stretch | final ≥ 0.95 |
| Stage-1 macro-F1 | ≥ 0.98 |
| Defect precision | ≥ 0.95 |
| Escalation recall | ≥ 0.90 |

A build that raises `final` while dropping `defect_precision` below 0.95 is a
**regression**, not an improvement, and gets reverted.

## 3. The harness

`eval/run_eval.py`:

```bash
python -m eval.run_eval                        # full inbox, score, append a row
python -m eval.run_eval --limit 40 --no-llm    # fast deterministic loop
python -m eval.run_eval --only email_059,email_313
python -m eval.run_eval --source http://localhost:8080   # sanctioned /submit path
```

Behaviour:

1. Run the pipeline over every email.
2. Emit `submission.json` in the organisers' shape (all 520 keys, validated
   against every invariant in `docs/contracts.md` §4 before submitting).
3. Score — via `POST /submit` when a server URL is given, else `score_cli.py`
   offline (§1).
4. Append **one row** to `eval/results.csv`.

`eval/results.csv` columns:

```
timestamp, git_sha, dirty, prompt_version, model_classify, model_extract,
final_score, stage1_macro_f1, stage1_accuracy, stage3_defect_f1,
stage3_defect_precision, stage3_defect_recall, stage3_field_f1,
end_to_end_rate, escalation_recall, escalation_precision,
rule_pct, llm_calls, tokens_in, tokens_out, wall_clock_s, notes
```

**Never hand-edit this file.** It is the evidence for *Technical Feasibility &
Validation* (15 pts) and the score-over-time chart in the deck. A hand-edited row
makes the whole chart worthless.

Every run records the git sha and whether the tree was dirty. A dirty-tree run is
fine for iteration but cannot be cited in the deck.

## 4. Caching

Gemini responses cached by `(prompt_version, model, sha256(input))` in
`.cache/gemini/`. Changing a prompt changes `prompt_version`, which invalidates
exactly the affected entries and nothing else. Without this the eval loop is too
slow and too expensive to run often enough to be useful, and an eval loop you
don't run is not an eval loop.

## 5. Unit tests (`pytest -q`)

The scoreboard grades the whole pipeline. These grade the parts, and they are
where the dataset's traps get pinned down so we can never regress on them.

### 5.1 Normalisation — every rule, every trap

```python
# weight
norm_weight("131,058 KG") == 131058
norm_weight("243,588")    == 243588
norm_weight(341715)       == 341715      # xlsx bare int
norm_weight("_______ MTS") is None       # blank placeholder, NOT a number
norm_weight("N/A")        is None

# party — the trap: these must NOT be equal
norm_party("APRIL FINE PAPER TRADING") != norm_party("APRIL FINE PAPER TRADING (MIDDLE EAST) FZE")
norm_party("APRIL FINE PAPER TRADING") != norm_party("APRIL FAR EAST (M) SDN BHD")
# but formatting must collapse
norm_party("AL GURG STATIONERY LLC\nP.O. BOX 5069") == norm_party("AL GURG STATIONERY LLC")

# port — the trap: the code is stale, the city is the answer
norm_port("MOMBASA, KENYA (KEMBA)") != norm_port("TUTICORIN, INDIA (KEMBA)")   # same code, real defect
norm_port("SINGAPORE (SGSIN)")      == norm_port("SINGAPORE")                  # txt vs binary formats
norm_port("PORT KLANG (WESTPORT), MALAYSIA (MYPKG)") == norm_port("PORT KLANG (WESTPORT), MALAYSIA")

# containers
norm_containers("6 x 40'HC")   == 6
norm_containers("15 x 20'FCL") == 15
norm_containers("")            is None
```

### 5.2 Label resolution

```python
resolve("Gross Weight毛重(KGS)") == "gross_weight_kg"
resolve("Gross Wt (kgs)")        == "gross_weight_kg"
resolve("GROSS WEIGHT")          == "gross_weight_kg"
resolve("NET WEIGHT")            is None          # the decoy
resolve("Net Wt (kg)")           is None
resolve("PORT OF LOADING (装货港)") == "port_of_loading"
resolve("Load Port")             == "port_of_loading"
resolve("To the Order of")       == "consignee"
# TOTAL outranks the bare column header
precedence("TOTAL Gross Wt (kgs)") > precedence("GROSS WEIGHT (KG)")
```

### 5.3 Parsers — one golden file per format

For each of `txt`, `pdf`, `docx`, `xlsx`, assert all 7 fields extract with the
expected value, `label_seen`, and a `Locator` that actually points at the value.
Plus the format-specific traps:

- **pdf**: gross weight is the `TOTAL` line, **not** the first container number.
  (This is the regression test for the bug a naive block parser produces on
  10/10 PDF pairs.)
- **pdf**: glued label+value on one line splits correctly
  (`Consignee (Non-Negotiable) BALL & DOGGETT…`).
- **pdf**: SI header is `BILL OF LADING INSTRUCTION`, still detected as `SI`.
- **docx**: value cell's name is taken, address dropped.
- **xlsx**: value is column 2; weight parses from a bare int.
- **txt**: indented address lines do not enter the compared value.

### 5.4 Document-type detection

Each decoy (`COMMERCIAL INVOICE`, `PACKING LIST`, `CERTIFICATE OF ORIGIN`)
detects as its real kind **while named `..._BL.txt`**, and the case gates to
`WRONG_DOC_TYPE`. Detection must pass with the `*** NOT AN SI OR BL ***` footer
**stripped** — it is a generator artefact and must not be load-bearing.

### 5.5 Readability

- truncated PDF (PyMuPDF raises) → `UNREADABLE_DOCUMENT`
- image-only PDF (0 text, ≥1 image) → routes to OCR, not straight to unreadable
- empty file → `UNREADABLE_DOCUMENT`

### 5.6 Invariants and submission shape

Property test over every produced `Case`: all six invariants in
`docs/contracts.md` §4 hold. Plus:

- the submission has exactly 520 keys
- every `review_reason` is one of the four wire values, or null
- `to_wire_reason` covers all eight internal reasons (exhaustive test over the enum)
- multi-reason precedence resolves as documented

### 5.7 Classifier rules

The traps from `docs/dataset_facts.md` §2, as explicit cases:

```
"_Reminder_Paper - Submit SI & AED_26-01-2026" (hr@)   -> GENERAL, not SI_REQUEST
"_RPA_ India HSS SD Billing Process Completed"         -> GENERAL, not INVOICE_QUERY
"Pending BL Release 12_01_2026" (rpa.bot@)             -> GENERAL, not BL_COMPARISON
"REQUEST BL DRAFT _ PO 26067_ …"                       -> BL_COMPARISON
"SI - SIN832764835 - DIRECT(ONE) - …"                  -> SI_REQUEST
"AIE - CALLAO_PERU - EVER(EGLV577…) - …"               -> BL_COMPARISON
any sender on a non-corporate domain                    -> SPAM
```

Plus: the external-sender banner is stripped before body heuristics (assert a
body containing only the banner does not read as mentioning an attachment).

## 6. Golden escalation set (`eval/golden/`)

The scoreboard cannot grade escalation *quality* — it only checks whether
`status == NEEDS_REVIEW`. It never checks the reason, and it never checks whether
the evidence we showed a human was any good. So we hand-label 8–10 cases
ourselves, by reading the documents:

| # | Case | Expected reason | Expected evidence shown |
| --- | --- | --- | --- |
| 1 | BL is a Commercial Invoice | `WRONG_DOC_TYPE` | the detected header, both filenames |
| 2 | BL is a Packing List | `WRONG_DOC_TYPE` | ditto |
| 3 | zero attachments, body asks to *compare* | `MISSING_ATTACHMENT` | the sentence that asks for a comparison |
| 4 | zero attachments, body asks to *send* | `MISSING_ATTACHMENT`, summary says "no documents yet" | the request sentence |
| 5 | SI only, no BL | `MISSING_ATTACHMENT` | which role is absent |
| 6 | truncated PDF | `UNREADABLE_DOCUMENT` | the open error |
| 7 | image-only scan | OCR succeeds → normal result; OCR fails → `UNREADABLE_DOCUMENT` | the OCR confidence |
| 8 | SI shipper blank | `FIELD_NOT_FOUND` on `shipper` | the blank line, the BL's value |
| 9 | SI container count blank | `FIELD_NOT_FOUND` on `container_count` | ditto |
| 10 | near-miss party name (fuzzy 85–99) | `BORDERLINE_MATCH` | both values, both snippets, the ratio |

Each is a test asserting the reason **and** that the review item carries non-empty
`si_evidence` / `bl_evidence`. A review item with no evidence is a bug — it hands
a human the same problem we had.

## 7. The loop

Per feature, per `CLAUDE.md`:

1. Write or update the spec section (`docs/spec/pipeline.md`).
2. Write the unit tests for it, including the trap case.
3. Build in small steps until `pytest -q` is green.
4. `python -m eval.run_eval` → one row in `eval/results.csv`.
5. Compare against the gates in §2.2. Precision regression ⇒ revert.
6. Disagreements get read at the document level and written to
   `eval/disagreements.md`, never resolved by peeking at the key.
7. Fold anything hard-won into `CLAUDE.md`'s lessons section.

Order of attack when picking the next fix: **exchange rate first**. A change that
recovers 5 defect emails is worth 0.055; a change that lifts stage-1 macro-F1 by
0.02 is worth 0.006. The 46 defect emails are the game.

## 8. What we will publish

- `eval/results.csv` in the repo — the score-over-time chart in the deck comes
  straight from it.
- `eval/disagreements.md` — cases where we think the reference is arguable, with
  our reasoning. The brief explicitly invites this, and it reads as rigour.
- A **known limitations** section in the README: what the system does not handle
  and how we know. Judges score validation on evidence and understood limits, not
  on a clean number.
