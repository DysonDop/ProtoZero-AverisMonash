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
2. **Deterministic first, structured service second, model last.** If a parser
   can read it, parse it. If it can't, Document Intelligence reads it — it
   returns fields, tables and boxes, not prose. The model is the last resort and
   every call must justify why the two cheaper paths couldn't do it.
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
- **Secrets never enter the repo.** Azure keys via Key Vault; local dev via
  `.env` (gitignored). Prefer managed identity over keys where the service supports it.
- **Interface changes get written down before they get coded.** Anything in
  `docs/contracts.md` is load-bearing for Christabel, Gene and seunniee.
- **Ship code plain.** No banner comment blocks, no section dividers, no
  per-line rationale. A comment only where the code looks like a mistake and
  someone would otherwise "fix" it. Reasoning belongs in `docs/`, not in the
  source.

## Stack

Everything runs on **Microsoft Azure**. Region: `southeastasia` unless a service
isn't offered there — check before assuming.

| Layer | Choice |
| --- | --- |
| Language | Python 3.11, Pydantic v2 for every schema |
| Classification | Rules first; Azure OpenAI fallback (small deployment) |
| Extraction | Deterministic parsers first; **Azure AI Document Intelligence**; Azure OpenAI last |
| Parsers | PyMuPDF (`fitz`), `python-docx`, `openpyxl` |
| Scans / hard layouts | Azure AI Document Intelligence — key-value pairs, tables, bounding boxes, per-field confidence |
| Fuzzy | `rapidfuzz` — for *routing to review*, never for declaring a match |
| API | FastAPI, one **Azure Container App** (serves API **and** the built SPA) |
| Storage | **Cosmos DB** (cases, review queue, corrections), **Blob Storage** (attachments) |
| Secrets / logs | **Key Vault**, **Application Insights** (structured JSON) |
| CI/CD | **GitHub Actions**, auto-deploy from `main` |
| Edge / DNS | **Cloudflare** — custom domain, TLS, static caching in front of the Container App |
| Frontend | React + Vite, plain CSS (`web/src/index.css`), react-pdf when the scan path lands |

**Azure OpenAI is called by _deployment name_, not model id** — you create a
deployment of a model in your resource and call that name. So
`config.py` holds `AZURE_OPENAI_DEPLOYMENT_CLASSIFY` and
`..._EXTRACT`, and the underlying model is a portal decision, not a code one.
Confirm which models your resource can actually deploy before wiring anything.

Deployment names, endpoints and every threshold live in `pipeline/config.py`.
One-line swap. `temperature=0` everywhere, always.

**The raw `*.azurecontainerapps.io` URL stays documented in the README as the
fallback.** The custom domain is a convenience; the entry must survive a DNS or
certificate problem on submission day.

## Layout

```
pipeline/     classify · extract · normalize · compare · confidence · escalate · report
              schemas.py · config.py · prompts/
parsers/      txt.py · pdf.py · docx.py · xlsx.py · doctype.py
data_refs/    unlocode_seaports.csv · synonyms.yaml · company_suffixes.txt
eval/         run_eval.py · results.csv · golden/
api/          FastAPI app
web/          src/index.css (tokens + components) · mocks/ (API fixtures) · mockups/ (static screens)
docs/         dataset_facts.md · prd.md · architecture.md · contracts.md · eval_plan.md ·
              design_system.md · spec/
```

## Frontend

**seunniee owns the frontend and the architecture diagram.**
`docs/design_system.md` is the prose, `web/src/index.css` is the implementation.
If they disagree, one is a bug — say so rather than patching around it.

- **`web/src/index.css` is the only place colour and type are defined**, and the
  only place product layout lives. Reference the variables; never restate the
  values. Tailwind was considered and dropped on 20 Sep: the design is already a
  set of named components carrying rules (a status mark ships its shape and its
  colour together, the accepted AA failure is confined to one class), and
  utilities would make those rules something to remember rather than something
  the code enforces.
- **Both host brands, neither altered.** Averis orange `#D88C3D` is chrome: the
  mark and primary buttons, never a status, never small text on paper. Monash
  blue `#006DAE` is "needs a person" and active states; on the dark shell it
  lifts to `#5FB3E8` for *text* only.
- **Colour is never the only signal.** Every state also carries a shape and a
  word. Desaturated, the three status colours land on nearly the same grey.
- **Mono means "this is what the document said".** Anything we wrote is Archivo;
  source values and operational identifiers use Azeret Mono.
- **One 50px bar is the whole shell.** The worklist may use its contained,
  expandable filter panel for operational filtering, but it is not global
  navigation. It collapses by default and must never cover or narrow the list.
- **Say each thing once.** A rejected build announced every problem four times
  (pill, chip row, marked box, margin card). If a fact is already on screen,
  it does not get a second home.
- **Corrections read wrong-then-right**, the wrong value struck through with the
  correct one beneath it, in the document and in the margin note alike.
- **`web/mocks/` lets the frontend be built before the API exists.** Real values,
  real character offsets, every endpoint in `contracts.md` §6.

**One recorded exception:** primary buttons use white on the orange at 2.71:1,
which fails AA and cannot pass at any size. Chosen on appearance after the
numbers were raised twice. `docs/design_system.md` §2.2. Do not silently
"fix" it, and do not copy it to other orange surfaces.

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
