# ProtoZero — SDOC (Shipping Document Verification)

Standing instructions for every coding session. Read this first; it is the
constitution. Fold hard-won lessons back in here as we go.

## The bet

Shipping ops teams check draft Bills of Lading against Shipping Instructions by
eye, one email at a time. We automate the read, and — the part that matters —
we automate knowing **when not to trust the read**. A wrong "all clear" on a
consignee is a mis-delivered container; a false alarm trains the operator to
ignore us. So the product is not "an LLM that reads documents." It is a
deterministic comparison engine with AI at the two edges where determinism runs
out: understanding intent in a messy inbox, and reading documents a parser
can't.

## Principles (hold these constant across sessions)

1. **The LLM never decides whether two fields match.** Extraction and
   classification may be probabilistic. Comparison is code, and it is exact.
2. **Deterministic first, AI on fallback.** If a parser can read it, parse it.
   Reach for Gemini when the parser fails, not before. Every LLM call must be
   able to justify why the deterministic path couldn't do it.
3. **Refuse rather than guess.** A case we cannot decide goes to a human with
   its evidence and a reason. `NEEDS_REVIEW` is a first-class outcome, not a
   failure path.
4. **Every verdict carries its evidence.** A field-level result without the
   source snippet it came from is not shippable. This drives the confidence
   score, the explanation, and the document highlighting.
5. **Normalise as little as possible.** The injected defects in this dataset
   *are* near-miss entity swaps. Every aggressive normalisation is a missed
   defect. Near-match → review; never near-match → match.
6. **Measure before tuning.** No threshold changes without an eval run logged
   to `eval/results.csv`. Never hand-edit that file.

## Ground rules

- **`sdoc-hackathon-docker/` is gitignored and stays that way.** It is the
  organisers' package, sent to us in error; it contains `ground_truth.json`.
  Using `scoring.py` is fine (it is the rubric). Using per-email labels or
  `generate.py` to derive rules is not — the final round is a fresh draw, so
  anything fitted to this one is a validation number that lies.
- **No new frameworks or paid services without asking Dylan.** Explicitly out:
  LangChain, LangGraph, vector DBs, Kubernetes, microservices.
- **Secrets never enter the repo.** Gemini key via Secret Manager; local dev via
  `.env` (gitignored).
- **Interface changes get written down before they get coded.** Anything in
  `docs/contracts.md` is load-bearing for Christabel, Gene and seunniee.

## Stack

| Layer | Choice |
| --- | --- |
| Language | Python 3.11, Pydantic v2 for every schema |
| Classification | Rules first; `gemini-3.1-flash-lite` fallback |
| Extraction | Deterministic parsers first; `gemini-3.5-flash` fallback |
| Parsers | PyMuPDF (`fitz`), `python-docx`, `openpyxl` |
| OCR / scans | Google Cloud Vision OCR → Gemini vision |
| Fuzzy | `rapidfuzz` — for *routing to review*, never for declaring a match |
| API | FastAPI, one Cloud Run service (serves API **and** the built SPA) |
| Storage | Firestore (cases, review queue, corrections), Cloud Storage (attachments) |
| Secrets / logs | Secret Manager, Cloud Logging (structured JSON) |
| CI/CD | Cloud Build, auto-deploy from GitHub `main` |
| Frontend | React + Vite + Tailwind, react-pdf, Recharts |

Model IDs and every threshold live in `pipeline/config.py`. One-line swap.
`temperature=0` everywhere, always.

## Layout

```
pipeline/     classify · extract · normalize · compare · confidence · escalate · report
              schemas.py · config.py · prompts/
parsers/      txt.py · pdf.py · docx.py · xlsx.py · doctype.py
data_refs/    unlocode_seaports.csv · synonyms.yaml · company_suffixes.txt
eval/         run_eval.py · results.csv · golden/
api/          FastAPI app
web/          React SPA
docs/         dataset_facts.md · prd.md · architecture.md · contracts.md · eval_plan.md · spec/
```

## Commands

```bash
python -m eval.run_eval --source data --out submission.json   # full pipeline + score
python -m eval.run_eval --limit 20 --no-llm                   # fast deterministic loop
pytest -q                                                     # unit tests
uvicorn api.main:app --reload                                 # local API
docker compose up --build                                     # dataset server + api + web
```

## Hard-won lessons (append as we learn)

- **Never compare ports by UN/LOCODE.** The dataset's injected port defects
  rewrite the city and leave the original code in place — code-comparison
  misses 100% of them. Compare the city string; strip the trailing `(XXXXX)`.
  (`docs/dataset_facts.md` §7)
- **On PDFs, `GROSS WEIGHT (KG)` is a table column header, not a field.** Anchor
  gross weight to the line starting `TOTAL`. Naive block parsing returns a
  container number as the weight. (§4)
- **Never match a label on bare `WEIGHT`** — `NET WEIGHT` is a planted decoy.
- **The `_SI` / `_BL` in a filename is not the document type.** Decoys ship a
  Commercial Invoice as `..._BL.txt`. Use the filename for *pairing* only.
- **Strip the external-sender warning banner before any body heuristic.** It
  contains the word "attach" and fires naive attachment-mention rules on 27 emails.
