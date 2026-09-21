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

This is orchestration and deterministic document checking, not custom-model
training. Optional AI services only assist when rules or parsers cannot finish;
after repeated service failures a circuit breaker keeps the deterministic path
running and says so in the interface.

## The interface

Four focused screens, each with one job.

| Screen | Question it answers |
| --- | --- |
| Worklist | What came in, and what did the system conclude? |
| Analytics | Where is workload building up, and which cases explain it? |
| Review queue | What did it refuse to decide, and can I settle it in one click? |
| Case | What did we read, did it match, and how far do we trust our own reading? |

The worklist stays focused on daily triage with a compact operational snapshot.
Detailed analytics and live component health have a dedicated **Analytics** page.
It reports the live inbox-to-outcome flow, workload by email type, outcomes for
genuine document-comparison cases, fields with differences and the primary
reasons for human review. Every chart includes its counts and explains its scope;
selecting a chart row opens the matching cases in the worklist. Explainable priority
labels and priority-first sorting bring blocking cases to the top. Cases can be
assigned, moved from assigned to in progress, and completed through the existing
review decisions; ownership and status changes are retained in the audit trail. The
month, year, last-30-days and full-history selector updates the worklist and
workbook together. Flagged fields explain the two values,
similarity and review status in plain language; one click opens both source
excerpts with the compared text highlighted. The audit drawer exposes every
event's trace ID, timestamp, actor, action, previous value, new value and reason.

For day-to-day triage, the worklist separates **Incoming**, **History** and
**All records**, shows a compact added-today/action-needed summary, and provides
a contained expandable filter panel. Results and email types support multiple
selections; date presets, custom date ranges and keyword search can be combined.
The panel opens below the tabs without covering or narrowing the case list.

The worklist has a shared **Worklist period & Excel export** selector and
**Download Excel** action. Reports can cover all cases, any selected calendar
month or year, or the rolling last 30 days. Changing the period updates the
visible worklist, tab totals, filter counts and workbook together. Keyword and
advanced filters refine the screen only; each workbook still contains every
case in the selected period. Each workbook
states its reporting scope and includes separate sheets for summary, cases,
comparisons, document evidence, audit events and the review queue.
Unchanged reports are cached for five minutes and automatically invalidated when
case, review, decision or audit data changes.
Period reports use the email received timestamp when available and otherwise use
the case's first processing timestamp, which is stated on the Summary sheet.

Each comparison case also opens with a compact case report: documents present,
issues, extracted field pairs, human corrections, final result, audit-event
count and real page/line evidence locations. The **Download PDF** action exports
that current case state together with the field comparison and audit trail.
Selecting any field opens the full
SI and BL source-text previews side by side, scrolls both to the located source
line and highlights it. An **Open original** link serves the unmodified stored
attachment when the live API is connected.

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

## Running the application

The production frontend is the React/Vite application in `web/`. Install
Node.js 20 or newer before running it locally.

For local end-to-end development, run the API from the repository root:

```bash
uv run --with-requirements requirements.txt uvicorn api.main:app --reload --port 8000
```

Then start the frontend in a second PowerShell window:

```powershell
$env:VITE_API_BASE="http://127.0.0.1:8000/api"
cd web
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 5175
```

Open <http://127.0.0.1:5175>.

Run the quality checks and production build with:

```powershell
cd web
npm.cmd run build
```

The build output is `web/dist/`. FastAPI serves this directory when it exists.

The live path enables document evidence, ordered audit activity, review retries
and case decisions. The in-memory backend keeps changes until the API process
restarts.

The worklist prioritises operational cases by severity and exposes measurable
processing and health information. Reviewer corrections rejoin at comparison,
leaving the source extraction intact, and the audit panel exposes the case
trace ID.

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

The production Dockerfile builds the React frontend with `/api` as its data
source and FastAPI serves both the API and SPA from one public URL. Reviewer actions currently use the
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
