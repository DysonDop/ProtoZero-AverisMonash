# Dataset facts — SDOC hackathon inbox

Empirical inspection of the shipped data, 18 Sep 2026. Every number below was
measured from `sdoc-hackathon-bundle/` (the participant bundle), not assumed.
Where a fact came from an organiser-only file instead, it is marked
**[organiser-source]** — see §0.

`sdoc-hackathon-bundle/` and `sdoc-hackathon-docker/data_v2/` are **byte-identical**
for `inbox/` and `attachments/`. Either is fine to develop against.

---

## 0. Read this first: we were given the answer key

`sdoc-hackathon-docker/` is the **organisers' package**, not the participant one.
Its own README says:

> ⚠️ This package includes the answer key. Do NOT hand it to participants — give
> them the participant bundle (`sdoc-hackathon-bundle.zip`) instead.

It contains `data_v2/ground_truth.json` (per-email labels), the full generator
source (`generate.py`, `pools.py`, `shipment.py`, `render.py`, `emails.py`,
`edgecases.py`), and the scorer (`scoring.py`, `score_cli.py`).

**Recommended policy — your call, but I'd hold this line:**

| File | Use? | Why |
| --- | --- | --- |
| `scoring.py` / `score_cli.py` | **Yes** | It is the rubric. Same code `/submit` runs. Knowing how you're scored is not cheating. |
| `ground_truth.json` via `score_cli.py` **aggregate scoreboard only** | **Yes** | Functionally identical to the sanctioned `/submit` self-eval. Used exactly once so far, for §11. |
| `ground_truth.json` read per-email, diffed, or committed | **No** | That is the answer key. It would make every eval number meaningless and it is the one thing that looks like cheating if anyone opens the repo. |
| `generate.py` & friends, for tuning rules | **No** | Reverse-engineering the generator is worthless in the final round (fresh seed, possibly the real APRIL inbox) and is exactly the kind of thing a judge asks about. |

Concrete asks:
1. `git init` with a `.gitignore` that excludes `sdoc-hackathon-docker/` entirely,
   so the key can never be pushed to the public repo.
2. Tell roshiiii/the organisers we received the organiser zip. Better they hear
   it from us on day 1 than find it in our repo on day 5.
3. All findings in §1–§10 below were derived from the participant bundle only.

---

## 1. Record structure

520 files, `inbox/email_001.json` … `email_520.json`. Exactly five keys, present
in all 520, no nulls, no extra fields:

```json
{
  "email_id": "email_004",
  "from": "docs@vitalsolutions.sg",
  "subject": "REQUEST BL DRAFT _ PO 26067_ COATED IVORY BOARD__138MT",
  "body": "Hi Mitchelle,\n\nAttached are the SI and draft BL for OC 5ALT-01226 ...",
  "attachments": ["attachments/email_004_SI.txt", "attachments/email_004_BL.txt"]
}
```

- `attachments` is a list of repo-relative paths. Every referenced file exists;
  every file on disk is referenced (250/250 both ways). No orphans.
- Attachment counts: **394 emails with 0**, **124 with 2**, **2 with 1**.
- Filenames are always `email_NNN_SI.<ext>` or `email_NNN_BL.<ext>`.
  **Do not trust the `_SI` / `_BL` in the filename for document type** — the
  `wrong_doc_type` edge cases ship a Commercial Invoice as `..._BL.txt` (§8).
  Use it for *pairing*, detect the type from content.
- `body` is 108–1226 chars, median 543. Contains signature blocks, forwarded
  threads, and an "external sender" warning banner (see §2 trap).

**Contradiction with the handoff:** attachments are given as *paths*, not
inline blobs; and the loader's `read_bytes()` is the only binary-safe accessor.
`read_text()` will mangle xlsx/docx/pdf — use `read_bytes()` for anything not `.txt`.

## 2. Counts and category distribution

No answer key, so this is my read of subject + sender. A ~40-line regex ruleset
partitions all 520 with no leftovers and no contradictions I can find:

| Category | My count | Discriminator |
| --- | --- | --- |
| `BL_COMPARISON` | 220 | subject starts `TO CONFIRM DOCS`, `REQUEST BL DRAFT`, `Draft BL … amend`, or the coded `AIE/AFEMY/AFRT/AFPTME - <POD> - <CARRIER>(<BL#>) - …` |
| `SI_REQUEST` | 125 | subject starts `SI - <bl#> - DIRECT(<carrier>) - …`, `CUST SI`, `REQUEST SI`, `SI NEEDED` |
| `INVOICE_QUERY` | 75 | `… RAK BILLING … MISSING GR`, `REQUEST TO CANCEL INVOICE`, `LOCAL CHARGES FOB`, `Mill D & D charges`, `Total Freight - …` |
| `GENERAL` | 60 | `UPDATE SUMMARY`, `daily Berthing Report`, `Pending BL Release`, `_Reminder_Paper`, `_RPA_ …`, HR/holiday |
| `SPAM` | 40 | sender domain only |
| **Total** | **520** | |

- **SPAM is 100% separable by sender domain.** All 40 come from
  `webmail-verify.co` (11), `secure-mailbox.org` (9), `parcel-track.co` (7),
  `logistics-deals.biz` (6), `prize-claims.info` (5), `crypto-invest.net` (2).
  Everything else is `aprilasia.com`, `april.com.my`, `fujitogrp.com`,
  `psabdp.com`, `ifpla.com`, `algurg.ae`, `safqa.co.ke`, `roxcel.at`,
  `vitalsolutions.sg`. Don't classify spam on content; classify on domain.
- **All 126 attachment-bearing emails fall in `BL_COMPARISON`.** No other
  category carries an attachment. Attachment presence is a strong feature but
  **not sufficient** — 94 of the 220 comparison emails have no attachment.

### Misleading subjects (the actual traps)

| Trap | Example | Right answer |
| --- | --- | --- |
| "SI" in a comparison subject | `REQUEST BL DRAFT _ PO 26067_ …` vs `REQUEST SI …` | the verb matters, not the noun |
| `SI -` coded prefix vs `AIE -` coded prefix | `SI - SIN832764835 - DIRECT(ONE) - …` | same shape, opposite category |
| "SI" in an HR/bot notice | `_Reminder_Paper - Submit SI & AED_26-01-2026` from `hr@` / `rpa.bot@` | GENERAL |
| "BL" in a bot notice | `Pending BL Release 12_01_2026`, `List of Outstanding BL (BDP SG)` | GENERAL |
| `_RPA_ India HSS SD Billing Process Completed` | has "Billing" | GENERAL, not INVOICE_QUERY — it's a bot notice. This one cost me 9 emails on the first pass. |
| **External-sender banner** | `WARNING: This email originated outside of our organisation…` appears in 27 bodies | contains the word "attach"; a naive "body mentions attachment" rule fires on all 27. Strip the banner before any body heuristic. |

**Implication for the plan:** stage-1 is 30% of the final score and is
essentially a solved rules problem on this data. Spend the LLM budget elsewhere.
The scorer even reads an optional `decided_by: "rule" | "llm"` field per email
and reports `rule_pct` — the organisers expect a hybrid. Keep the Flash-Lite
classifier as the fallback for anything the rules don't match, and report the split.

## 3. Label variants — first-draft synonym map

Measured across all 192 `.txt` attachments plus the pdf/docx/xlsx renderers.
SI and BL draw from the **same** label pool — there is no "SI labels" vs
"BL labels" split, so one map serves both.

```yaml
shipper:
  - Shipper
  - SHIPPER
  - Shipper (Principal or Seller)        # docx: "Shipper (Principal or Seller) (发货人)"
  - Shipper/Exporter
  - Exporter                             # certificate-of-origin decoy only
consignee:
  - Consignee
  - CONSIGNEE
  - Consignee (Non-Negotiable)
  - To the Order of                      # NOT a "TO ORDER" bearer BL — it is just a label
notify_party:
  - Notify
  - Notify Party
  - NOTIFY PARTY
  - Notify Party/Intermediate Consignee
port_of_loading:
  - Port of Loading
  - PORT OF LOADING
  - Port of Loading (POL)
  - POL
  - Load Port
port_of_discharge:
  - Port of Discharge
  - PORT OF DISCHARGE
  - Port of Discharge (POD)
  - POD
  - Discharge Port
container_count:
  - Total Containers
  - No. of Containers
  - No. of Containers or Packages
  - Container Count
gross_weight_kg:
  - Gross Wt (kgs)
  - Gross Weight (KG)
  - GROSS WEIGHT
  - "Gross Weight毛重(KGS)"
  # PDF totals row — MUST take precedence over the table column header:
  - TOTAL Gross Wt (kgs)
  - TOTAL Gross Weight (KG)
  - TOTAL GROSS WEIGHT
  - "TOTAL Gross Weight毛重(KGS)"          # renders as "TOTAL Gross WeightII(KGS)" via PyMuPDF
# never map:
#   NET WEIGHT / Net Wt (kg)  -> decoy, see §4
```

Normalisation that makes the map small: lowercase, strip any parenthetical,
strip CJK characters, collapse whitespace, drop the trailing colon. That
collapses `Gross Weight毛重(KGS)`, `Gross Wt (kgs)` and `GROSS WEIGHT` to one key,
and the docx bilingual labels (`PORT OF LOADING (装货港)`) come along for free.

## 4. Weight formats

| Renderer | Example | Notes |
| --- | --- | --- |
| `.txt` | `131,058 KG` | thousands comma, explicit unit |
| `.docx` | `243,588` | thousands comma, **no unit** |
| `.xlsx` | `341715` | **bare integer, no separator, no unit** |
| `.pdf` | `TOTAL GROSS WEIGHT: 118,270 KG` plus a per-container column of `23,654` | see trap below |

**Not present anywhere in the corpus** (searched all 250 files, all four formats):
MT / tonnes / LBS as a *gross weight* unit, decimal kilograms, European
`22.000,00` separators, VGM, TARE, TEU. **Cut the unit-converter from scope.**
A `parse_int(strip_commas)` plus exact compare is sufficient today; leave the
converter as a one-function hook for the final round, not a built module.

Two real traps:

1. **`NET WEIGHT` decoy.** Appears 7×: in the 5 `missing_value` edge-case SIs as
   `NET WEIGHT: _______ MTS` / `??? MTS` (the only `MTS` in the corpus), and on
   2 Packing List decoys as a `Net Wt (kg)` column. A label matcher keying on
   `WEIGHT` alone will pick it up. Match on `GROSS`, never bare `WEIGHT`, and
   explicitly blacklist `NET`.
2. **PDF line items vs total.** Every real PDF has a container table whose
   *column header* is literally `GROSS WEIGHT (KG)`, followed by N rows of
   per-container weights, then the totals line. A block-style "label, then next
   line" parser grabs the first **container number** (e.g. `PURJ4736471`) as the
   gross weight. This bit my throwaway parser on 10/10 PDF pairs. Rule: on PDFs,
   anchor gross weight to the line beginning `TOTAL`; the bare header is a table
   column, not a field. Row weights × row count do equal the total where I checked,
   so summing rows is a valid cross-check for the confidence score — not the primary read.

## 5. Container formats

**One format, everywhere:** `<int> x <size>`, e.g. `6 x 40'HC`, `12 x 20'FCL`,
`15 x 20'GP`. 32 distinct values across the corpus. Sizes seen: `20'GP`,
`20'FCL`, `40'HC`. Counts 1–16.

Not present anywhere: word numbers (`THREE (3)`), zero-padding (`01 X`), mixed
lines (`2 x 20' + 1 x 40'`), `said to contain N cartons`, TEU. **Cut the
container grammar parser from scope** — `int(value.split("x")[0])` covers 100%
of it today. Keep it in one function so the final round can grow it.

PDFs also carry a per-container row table; the row count matches the stated
count in every PDF where both are present (6/6, 2/2, 5/5, 12/12, 15/15). Good
free cross-check signal for confidence, not a second source of truth.

The word `CARTON` appears exactly twice, both on Packing List decoys (§8) —
so the "cartons ≠ containers" trap exists only as a wrong-document decoy,
not as a value to be misread.

## 6. "TO ORDER" / "SAME AS CONSIGNEE"

**Zero occurrences of either, in any format.** The label `To the Order of` is
used 37× — but it is a *label* for the consignee field, always followed by a
named company. No bearer BLs, no self-referential notify party. **Cut the
special-value resolver from scope.**

## 7. Ports — and the single biggest trap in the dataset

Two shapes:
- `.txt`: `CITY, COUNTRY (LOCODE)` — 364 of 374 values carry a 5-letter code.
  Variants: `SINGAPORE (SGSIN)` (no country), `PORT KLANG (WESTPORT), MALAYSIA (MYPKG)`
  (parenthetical inside the city), `RUGAO/NANTONG/SHANGHAI, CHINA (CNSHA)` (slashed multi-city).
- `.pdf` / `.docx` / `.xlsx`: **city + country only, no LOCODE.** Same for the
  10 codeless `.txt` values (all in the `missing_value` edge cases).

### 🔴 The LOCODE in the parentheses is stale and wrong on every injected defect

When the generator injects a port mismatch it rewrites the **city name only and
leaves the original code in place**. 12 of 33 distinct cities map to more than
one code:

```
MOMBASA, KENYA (KEMBA)   [SI]  ->  TUTICORIN, INDIA (KEMBA)   [BL]   # email_013
FREMANTLE, AUSTRALIA (AUFRE) -> BUSAN, SOUTH KOREA (AUFRE)          # email_025
PORT KLANG (WESTPORT), MALAYSIA (MYPKG) -> SINGAPORE, SINGAPORE (MYPKG)  # email_119
```

**Consequence: the handoff's plan — "map names to UN/LOCODE, then compare
codes" — scores 0 on port mismatches.** Every single one would compare equal.
Ports are the largest defect class in the text pairs (26 of 66 field-level diffs).

**Do this instead:** compare the **city/country string**, exact after
whitespace+case normalisation, and *strip the trailing `(XXXXX)` before
comparing*. The UN/LOCODE table is still worth having — as a validity check
(unknown port → review) and to reconcile `SINGAPORE` (binary formats) against
`SINGAPORE (SGSIN)` (txt) — but it must never be the comparison key.

Bonus signal, free: a city whose stated code doesn't match the code that city
carries elsewhere in the corpus is itself evidence of an edited field. Worth a
confidence bump; too generator-specific to be the primary rule.

## 8. Messy cases → `NEEDS_REVIEW`

20 edge cases, `email_501`–`email_520`, appended after the main 500 so the base
distribution is untouched. All are `BL_COMPARISON`; all should end
`NEEDS_REVIEW`. The organisers' `review_reason` enum is **four values**, not the
eight in the handoff:

`wrong_doc_type` · `missing_attachment` · `unreadable` · `missing_value`

| Reason | Emails | What it looks like | Detection |
| --- | --- | --- | --- |
| `wrong_doc_type` | 501–505 | the `_BL` file is a `COMMERCIAL INVOICE` (1), `PACKING LIST` (2) or `CERTIFICATE OF ORIGIN` (2) | first line of the doc; also a literal `*** … NOT AN SI OR BL ***` footer (**don't rely on the footer** — it won't survive a regenerate) |
| `missing_attachment` | 506–510 | 3 with **zero** attachments, 2 with **SI only** | `len(attachments) != 2`, or no doc classifies as a BL |
| `unreadable` | 511–515 | 2 truncated PDFs (~770 B — PyMuPDF raises `FileDataError`), 3 image-only scanned PDFs (~21 KB, `get_text()` returns `""`, `get_images()` returns 1) | deterministic: open fails, or 0 text + ≥1 image |
| `missing_value` | 516–520 | SI has blank/`N/A`/`???`/`_______` in one or more of the 7 fields, BL is complete | empty value, or value in `{N/A, ???, TBA, _______}` |

Blank forms seen: `SHIPPER: ` (empty), `No. of Containers: ` (empty),
`Gross Weight毛重(KGS): N/A`, `CONSIGNEE: ` (empty), plus the `NET WEIGHT:
_______ MTS` decoy that is present on **all five** and is *not* one of the 7 fields.

### 🔴 The ambiguity you can't resolve from the email alone

A `BL_COMPARISON` email with **zero attachments** is gold `status: OK` in the
main 500 (91 of them — "please send me the draft BL", nothing to compare yet)
but gold `NEEDS_REVIEW / missing_attachment` in the edge set (3 of them).
Same category, same zero attachments, opposite label.

The only discriminator in the data is the body:

- edge: `"Please compare the SI and draft BL for <ref> and confirm (attachments appear to have been dropped)."`
- main: `"Please assist to send the draft BL for <ref> for checking asap."`

i.e. **"asks you to compare" vs "asks you to send"**. That's a genuine semantic
distinction — good LLM-classifier job, and a good demo talking point. A
1-attachment email is always an edge case (main set is only ever 0 or 2).

**Scoring note that changes the strategy here:** over-escalating is nearly free.
`NEEDS_REVIEW` on a gold-`OK` email still yields `has_defect=false` and
`defect_fields=[]`, which is exactly what stage 3 and end-to-end want. The only
escalation that costs score is escalating an email that gold says is a
`MISMATCH` — that turns a caught defect into a miss, at 0.5/46 ≈ 1.1 points
each. So: **escalate freely when documents are missing/unreadable/blank;
escalate reluctantly once both docs parsed cleanly.**

## 9. Advanced-format sample data

Attachment files: **192 `.txt`, 28 `.pdf`, 22 `.xlsx`, 8 `.docx`** (250 total).
By pair:

| SI ext | BL ext | Pairs | Notes |
| --- | --- | --- | --- |
| txt | txt | 94 | 89 real + 5 wrong-doc decoys |
| pdf | pdf | 13 | 10 real, 3 image-only (edge `unreadable`) |
| xlsx | docx | 8 | bilingual Word BL |
| xlsx | xlsx | 7 | |
| txt | pdf | 2 | both edge `unreadable` (truncated PDF) |

**109 comparable SI+BL pairs.** All four readers are already installed and work:
PyMuPDF (`fitz`), `python-docx`, `openpyxl`, plus `pypdf` and `pdftotext`.
`rapidfuzz` and `google-genai` are **not** installed yet.

Per-format extraction shape (this is the real work, and it is not one parser):

- **`.txt`** — `Label: value` per line; party addresses on following
  **indented** lines. Compare the label line only (see §10 quirk).
- **`.pdf`** — block layout: label on its own line, value on the *next* line(s);
  parties span 3–5 lines (name first). Some labels are **glued to the value on
  one line**: `Consignee (Non-Negotiable) BALL & DOGGETT AUSTRALIA PTY LTD`,
  `Export Carrier (vessel, voyage)SOLID 16 V.044NW2`. Then the container table,
  then `Total Containers:` / `TOTAL GROSS WEIGHT:`.
  PDF SIs are headed **`BILL OF LADING INSTRUCTION`**, not "SHIPPING INSTRUCTION".
- **`.docx`** — a single 2-column table; label cell is bilingual
  (`Consignee (收货人)`); value cell holds **name + address separated by
  newlines** — take line 0.
- **`.xlsx`** — 2–3 columns: `label | name | address`. Sheet named `S.I.` or `BL`;
  row 2 reads `BL INSTRUCTION` (SI) or `BILL OF LADING` (BL). Weight is a bare int.

**Document-type detection** (needed for `wrong_doc_type`, and because the
filename lies):

| Type | Markers |
| --- | --- |
| SI | `SHIPPING INSTRUCTION` (txt), `BILL OF LADING INSTRUCTION` (pdf), `BL INSTRUCTION` + sheet `S.I.` (xlsx) |
| BL | `BILL OF LADING (DRAFT)` (txt/pdf/docx), `BILL OF LADING` + sheet `BL` (xlsx) |
| decoy | `COMMERCIAL INVOICE`, `PACKING LIST`, `CERTIFICATE OF ORIGIN` |

A robust secondary test: a decoy is missing most of the 7 fields (a Packing List
has no ports and no vessel at all). Use "≥N of 7 fields found" as the fallback so
this survives a regenerate.

## 10. How much normalisation is actually needed

I ran a throwaway label-aligned **exact string** comparison over all 94 text
pairs. Result: **0 formatting-only differences**. 38 pairs differed, 56 were
byte-identical on all 7 fields, and no label was ever missing. On text, exact
compare after synonym alignment is 100% precise.

The binary formats are where normalisation earns its keep — and only for three
things:

1. **Weight**: `243588` (xlsx) vs `243,588` (docx) vs `131,058 KG` (txt) →
   strip non-digits, compare ints.
2. **Party name vs name+address**: xlsx splits name/address into separate cells,
   docx puts them in one cell, txt/pdf put the address on following lines →
   **compare the name only**, first line/first cell.
3. **Ports**: strip the trailing `(LOCODE)`, since the binary formats don't have one.

### 🔴 Don't build the aggressive company-name normaliser

The handoff plans suffix-stripping (`Sdn Bhd`, `Pte Ltd`, `FZE`, …) plus
`rapidfuzz token_sort_ratio ≥ 95 = match`. The **injected shipper defects are
exactly APRIL-entity swaps**:

```
SI: APRIL FINE PAPER TRADING                  ->  BL: APRIL FINE PAPER TRADING (MIDDLE EAST) FZE
SI: APRIL FINE PAPER TRADING                  ->  BL: APRIL FAR EAST (M) SDN BHD
SI: APRIL FINE PAPER TRADING (MIDDLE EAST) FZE->  BL: APRIL FAR EAST (M) SDN BHD
```

Strip `FZE` / `SDN BHD` / `(M)` and these start collapsing toward each other.
Every false merge is a missed defect at ~1.1 points. Recommendation: **exact
compare after case/whitespace/punctuation normalisation only**, and route a
fuzzy near-match (say ratio 85–99) to **review** rather than declaring a match.
Zero cases in the data need a fuzzy *match* today.

### Generator quirks worth knowing (don't depend on them, do exploit them for confidence)

- When a party is swapped, the **address underneath is left unchanged**
  (`EAST BRIGHT FZ-LLC` → `UAB NOVAKOPA`, both at `RAKEZ AMENITY CENTER`).
  So a name/address mismatch is itself a defect signal — and another reason to
  compare names, not name+address blobs.
- Same for ports and their LOCODEs (§7).
- Consignee and notify party are usually the *same company*; when one is
  swapped the other often isn't. Don't infer one from the other.

## 11. Submission shape and baseline

`sample_submission.json` — one object keyed by `email_id`, all 520 present:

```json
"email_001": {
  "category":      "GENERAL",          // BL_COMPARISON|SI_REQUEST|INVOICE_QUERY|GENERAL|SPAM
  "status":        "OK",               // OK|MISMATCH|NEEDS_REVIEW
  "review_reason": null,               // null|wrong_doc_type|missing_attachment|unreadable|missing_value
  "defect_fields": [],                 // subset of the 7 field names
  "has_defect":    false
}
```

Optional extra key the scorer reads: `decided_by: "rule" | "llm"` → reported as
`rule_pct`. Not scored, but it is free evidence for the deck.

**Baseline, unchanged `sample_submission.json`: `final_score = 0.0124`.**
(Measured with the organisers' own `score_cli.py` — aggregate scoreboard only,
same computation `/submit` runs. Docker isn't installed on this machine; once
it is, re-run through `/submit` so the workflow matches the sanctioned path.)

```
stage 1  accuracy 0.115   macro-F1 0.041     (everything guessed GENERAL)
stage 3  defect P/R/F1 0.000   exact-match 0.770
review   0/20 escalated, 0/5 in each of the four reasons
e2e      0/46 defect emails caught       FINAL 0.0124
```

### What the scorer actually rewards

```
final = 0.30 · stage1_macro_F1  +  0.20 · stage3_defect_F1  +  0.50 · end_to_end_rate
```

- **Escalation contributes 0 to the final score.** It is reported as a separate
  diagnostic "reliability" axis. It still matters for the human-judged rubric
  (Practical Value, Problem Understanding) — build it, demo it, but don't
  trade end-to-end points for it.
- **End-to-end requires the `defect_fields` set to match *exactly*.** A correct
  detection with one extra field scores zero on 50% of the weight. **A false
  positive field is as expensive as a miss.** This is the argument for
  conservative normalisation (§10) and against any fuzzy matcher that invents
  differences.
- **`macro`-F1, not accuracy**, on stage 1 — the 40 SPAM emails carry the same
  weight as the 220 comparisons. Getting SPAM right is 6% of the final score for
  a domain allowlist.
- Stage 3 excludes gold `NEEDS_REVIEW` emails entirely.
- **46 gold defect emails** ⇒ each one is worth `0.5/46 ≈ 0.0109` of the final
  score. 200 comparable `BL_COMPARISON` emails in stage 3.

Rough ceiling check: perfect classification alone = 0.30. Perfect classification
+ perfect comparison = 1.00. The 46 defect emails are the whole game.

---

## Summary of contradictions with the handoff

| Handoff says | Data says | Action |
| --- | --- | --- |
| Compare ports by UN/LOCODE | The LOCODE is stale on every injected port defect; code-compare misses 100% of them | Compare city strings. LOCODE = validity check only. **Highest-impact fix.** |
| Strip legal suffixes, fuzzy-match names ≥95 | Defects *are* suffix-level entity swaps; normalisation merges them | Exact compare; route near-matches to review, never to "match" |
| Handle MT/tonnes/LBS, decimals, EU separators | None exist in any of 250 files | Cut. One `parse_int` + a hook |
| Parse `THREE (3)`, `01 X 40'HC`, mixed lines, cartons | None exist; format is uniformly `N x SIZE` | Cut. `int(v.split("x")[0])` |
| Handle `TO ORDER` / `SAME AS CONSIGNEE` | Zero occurrences | Cut |
| 8-value escalation enum | Organisers accept exactly 4 | Keep the 8 internally for the UI, map down at submission |
| Formats: PDF, DOCX, scans | **XLSX too** (22 files, 15 of the 109 pairs) — and it's the *only* format where weight is a bare int | Add `openpyxl` to the parser set on day 1 |
| Gemini Flash reads PDFs natively | The 3 scanned PDFs are the only ones needing it; the other 25 binary pairs parse deterministically | Deterministic parsers first; vision only for the image-only PDFs |
| Classification needs an LLM | Rules partition all 520 cleanly; 30% of score, near-free | Rules first, LLM as fallback, report `decided_by` |
| Dataset has no answer key | The organiser package we were given **does** | §0 |

## Suggested build order (revised from §8 of the handoff)

The scoring maths says the order should be: **comparison first, classification
second, escalation third** — not classification first.

1. **Deterministic per-format extractors** (txt/pdf/docx/xlsx) + synonym map +
   the three normalisers from §10. This alone should get most of the 46.
2. **Rule-based classifier** (§2). 30% of the score, ~40 lines.
3. **Escalation** on the four deterministic signals (§8). Zero score, high
   rubric value, cheap.
4. **LLM extraction** as the fallback for anything the parsers can't read, plus
   the "compare vs send" body distinction — this is where Gemini earns its place,
   and the honest framing for the deck is *AI where the deterministic path runs
   out*, not AI-for-its-own-sake.
5. **Vision/OCR** for the 3 image-only PDFs.
