# Protozero — SDOC

**Shipping document verification.** Reads an inbox, checks each draft Bill of
Lading against the Shipping Instruction it belongs to, and says clearly when it
is not sure enough to answer.

Built by Team Protozero for the Averis x Monash Hackathon 2026.

## The problem

A shipping operations desk receives email all day. Some of it says *"here is the
draft paperwork, please confirm it matches what the customer asked for."*

Two documents are involved:

- **The Shipping Instruction (SI)** — what the customer asked for. The reference.
- **The draft Bill of Lading (BL)** — what the carrier typed up. The thing being checked.

A person opens both and compares seven details by eye: shipper, consignee,
notify party, port of loading, port of discharge, container count and gross
weight. It is slow, and the mistakes are expensive. A wrong consignee is a
container delivered to the wrong company.

## The idea

The obvious approach is to hand both documents to a language model and ask
whether they match. We deliberately do not do that, for two reasons: a model
gives different answers on different days, which cannot be audited, and a
confident wrong "all clear" is the single most costly output this system can
produce.

So the design is a **deterministic comparison engine with AI at the two edges
where determinism runs out**: understanding intent in a messy inbox, and reading
documents a parser cannot.

1. **Classify** every email. Rules first; a model only sees what the rules could
   not match. Only genuine comparison requests continue.
2. **Resolve and read** the two attachments across `.txt`, `.pdf`, `.docx`,
   `.xlsx` and image-only scans.
3. **Extract** the seven fields from each document, every value carrying the
   exact snippet it came from.
4. **Compare** — plain, exact code. The model never decides whether two values
   match.
5. **Score confidence** per field, from whether the evidence was located, whether
   the value parsed, and the quality of the document it came from.
6. **Decide**: all clear, a difference to report, or `NEEDS_REVIEW` with its
   reason and its evidence. Refusing is a first-class outcome, not a failure path.
7. **A person resolves** what was refused, and the correction is stored and reused.

## The interface

Three screens, one for each person who uses it.

| Screen | Question it answers |
| --- | --- |
| Worklist | What came in, and what did the system conclude? |
| Review queue | What did it refuse to decide, and can I settle it in one click? |
| Case | What did we read, did it match, and how far do we trust our own reading? |

Every compared field carries one word — `checked`, `unsure` or `not checked` —
so the interface never states a result without also stating how much to trust
it. Colour is never the only signal: each state carries a word and a shape, and
the screens are designed to survive being read in greyscale.

## Repository layout

| Path | What is in it |
| --- | --- |
| `web/src/` | The React app. `index.css` is the single source for colour, type and components |
| `web/mocks/` | API fixtures built from the real dataset, so the frontend runs before the API exists |
| `web/mockups/` | Static design screens, linking the real stylesheet |
| `docs/architecture.md` | System design, and ADR-001 to ADR-008 recording what was chosen and why |
| `docs/contracts.md` | Data model and HTTP API. Load-bearing; nothing changes without a changelog entry |
| `docs/spec/pipeline.md` | Stage-by-stage specification of the pipeline |
| `docs/prd.md` | Scope, users, and an explicit list of what we are *not* building |
| `docs/dataset_facts.md` | Measured facts about the dataset, and the traps in it |
| `docs/design_system.md` | Colour, type, status and confidence, with every contrast ratio measured |
| `docs/eval_plan.md` | How accuracy is measured |
| `sdoc-hackathon-bundle/` | The participant dataset |
| `sdoc-hackathon-docker/` | The organisers' scoring package |

## Running the prototype

Requires Node 18 or newer.

```bash
cd web
npm install
npm run dev
```

Then open <http://localhost:5175>. The app reads the fixtures in `web/mocks/`,
so it runs with no backend and no network.

To produce the static build:

```bash
npm run build
```

Output lands in `web/dist/`, fixtures included, ready to serve as static files.

To point the app at a live API instead of the fixtures, set `VITE_API_BASE`:

```bash
VITE_API_BASE=/api npm run build
```

For local end-to-end development, run the API from the repository root:

```bash
uv run --with-requirements requirements.txt uvicorn api.main:app --reload --port 8000
```

Then start the frontend from `web/` with the API base set. In PowerShell:

```powershell
$env:VITE_API_BASE="http://127.0.0.1:8000/api"
npm.cmd run dev
```

The live path enables document evidence, ordered audit activity, review retries
and case decisions. The in-memory backend keeps changes until the API process
restarts.

### What the case buttons do

Every action first opens a confirmation explaining its effect. Nothing sends an
email or edits an uploaded document automatically.

| Button | Result after confirmation |
| --- | --- |
| **Send to a person** | Adds the case to the **Needs a person** queue, marks its lifecycle `in_review`, and records the handoff in the audit log. |
| **Reject the draft** | Marks the case `resolved`, records that the draft was rejected, and adds the reviewer action to the audit log. |
| **Approve the draft** | Marks the case `resolved` as approved and records the action in the audit log. |
| **Ask for a complete instruction** | Adds a follow-up item to the review queue. It does not contact the sender automatically. |
| **Undo** | Removes the saved decision and any manual review item created by it, then records the undo in the audit log. |

## Status

**21 September 2026.** The frontend and FastAPI backend run end to end against
all 520 bundled cases. The worklist, review queue, case decisions, source
evidence, retries and ordered audit activity are connected to live API routes.

Fixture mode remains available for frontend-only development. The production
Dockerfile builds the frontend with `/api` as its data source and FastAPI serves
both the API and SPA from one public URL. Reviewer actions currently use the
process-local memory store and reset when the API process restarts; Cosmos is
the intended persistent deployment store.

## A note on the data

`sdoc-hackathon-docker/` contains the organisers' scoring package, which the
organisers confirmed is provided to every team so they can evaluate their own
work. We use its scorer, because that is the rubric. We do not derive rules from
its per-email labels: the final round is a fresh draw from a deterministic
generator, so anything fitted to this particular draw would be a validation
number that lies. See `docs/eval_plan.md`.

## Team

Team Protozero — Roshiii (lead), Dyson, Gene, Christabel, seunniee.
