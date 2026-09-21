# Video reference

**Running document. Updated as the slides get built.**

One shared source of truth for the demo video, so five people say the same
things and nobody has to invent a number on camera. Slide content lives in
`docs/deck_brief.md`. This file is what to *say*.

Last updated: 21 September 2026.

---

## Before you press record

Four things to settle. Leave them and the video either loses marks the build has
already earned, or claims something the repository contradicts.

| Item | Why it matters | Status |
| --- | --- | --- |
| **LIVE URL: `________________`** | The rules require the demo recorded against the deployed link. Localhost recording scores in the weak band. | **Not filled.** Deploy is still open. |
| **Is any Azure service actually live?** | No code in the repo calls one. Whoever scripts §3 needs a real answer first. | **Unanswered.** Ask Genemor and Dylan |
| **Who says each section** | The organisers confirmed everyone does **not** need a section. What is required is a short intro with every member on camera. After that, whoever knows the material best should speak. | Table below, unassigned |
| **Time-saved figure** | See §5. There is a safe way to say this and an unsafe way. | Wording agreed below |

There is also an **urgent repository problem** at the bottom of this file that is
not a video issue but needs solving before submission.

**Hard limit: 5:00.** One mark comes off per 30 seconds over. Aim for 4:30.

---

## The five sections, in the order the rules require

The video is scored against exactly this order. Do not rearrange it.

| # | Section | Target | Speaker |
| --- | --- | --- | --- |
| 1 | Quick intro, **all five on camera** | 0:35 | everyone |
| 2 | The problem | 0:45 | |
| 3 | Tech stack | 0:40 | |
| 4 | Live demo | 1:55 | |
| 5 | Impact | 0:35 | |

That comes to 4:30 against the 5:00 limit.

**Sections 2 to 5 do not need five different speakers.** The organisers
confirmed that the requirement is a short intro with all members on camera, not
a section each. So assign 2 to 5 to whoever knows the material best, and let one
person take two sections if that is the strongest version. Fewer voice changes
usually sounds better anyway.

---

## 1. Intro (0:35)

Two jobs here. The team name and project name, and **every member on camera**.
The organisers confirmed that is what "everyone present" means, so this is the
section that satisfies it. Cameras on, faces visible, no black tiles.

One person opens:

> "We are Team Protozero. Our project is SDOC, shipping document verification,
> built for the Averis and Monash Hackathon 2026."

Then each member, about five seconds each. Name, and one short phrase on what
they worked on. Keep it to one line so the section does not eat the demo:

| Member | Line |
| --- | --- |
| Roshand (lead) | |
| Christabel | |
| Genemor | |
| Dylan | |
| Ying Xin | |

If it is easier to record, everyone can be on screen together at the start and
introduce themselves in turn, rather than cutting between separate clips.

---

## 2. The problem (0:45)

**Define every term before using it.** A judge watching this may not know what a
Bill of Lading is, and unexplained jargon is explicitly marked down.

The two documents, in plain words:

- **The Shipping Instruction, the SI.** What the customer asked for. This is the
  reference, the thing assumed correct.
- **The draft Bill of Lading, the draft BL.** What the carrier typed up. This is
  the thing being checked.

**The seven details a person compares by eye.** Name them. They are concrete and
they land well:

shipper · consignee · notify party · port of loading · port of discharge ·
container count · gross weight

**The numbers.** Both measured from the dataset, both safe to say:

- **520 emails** in the dataset.
- **220 of them** are genuine comparison requests. The rest are invoice queries,
  requests for instructions, general mail and spam.

**Why it matters.** Two costs, and say both. Most teams only say the first:

- A missed difference means a container goes to the wrong company, or the wrong
  port, or gets held at customs. Fixing a Bill of Lading after it is issued is
  expensive.
- A **false alarm** is just as damaging in a different way. Cry wolf often
  enough and the operator stops reading the alerts, and then the system is worse
  than nothing.

Who it affects: the documentation executive who does the checking, the reviewer
who settles the unclear ones, the operations lead who has to trust the output.

---

## 3. Tech stack (0:40)

The target architecture is **Microsoft Azure**, region `southeastasia`.

> **Stop and read this before scripting this section.** A search of the
> repository on 21 September found **no code calling any Azure service**. There
> is no `pipeline/azure_llm.py`, no Document Intelligence client, no Cosmos,
> Blob, Key Vault or Application Insights client, and no `.github/workflows`.
> `requirements.txt` lists the Azure packages and `pipeline/config.py` holds the
> environment variables, but nothing reads them into a client. `api/store.py` is
> an in-memory dictionary.
>
> So the table below is **the design, not the running system**. If someone says
> on camera that these services are doing this work today, that is a claim the
> repo contradicts, and Technology Integration is 15 marks that a judge checks
> against the code.
>
> **Ask Genemor and Dylan first**, tonight: is any of this deployed from an
> unpushed branch or configured in the portal? Whatever comes back, move each
> row into the right column below before filming.

| Service | What it is for | Built? |
| --- | --- | --- |
| **Azure Container Apps** | Hosting the live link, serving both the API and the interface | Dockerfile exists, deploy not done |
| **Azure OpenAI** | Reading intent in emails the rules cannot classify | **No code in repo** |
| **Azure AI Document Intelligence** | Reading scanned and image-only documents | **No code in repo** |
| **Cosmos DB** | Cases, review queue, reviewer corrections | **No code in repo.** Store is in-memory |
| **Blob Storage** | Holding the attachments | **No code in repo** |
| **Key Vault** | Holding the keys | **No code in repo** |
| **Application Insights** | Structured logs, one record per case | **No code in repo.** Stdlib logging only |
| **GitHub Actions** | Deploying on every push to main | **No workflow file in repo** |
| **Cloudflare** | Custom domain and TLS in front of the app | Not set up |

**The safe way to present this**, assuming nothing changes tonight, is to
describe the architecture as designed and be straight that the deterministic
core is what is running:

> "The system is designed for Azure, with Container Apps serving it, Cosmos for
> the cases and corrections, and the model services at the two edges. What is
> running end to end today is the deterministic core, which is the part that
> does the actual checking, and it carries the whole inbox on its own."

Full reasoning and the rejected alternatives are in `docs/architecture.md`,
ADR-001 to ADR-009. Do not try to cover those in 45 seconds.

**Do not say Gemini, Cloud Run, Firestore or Vision.** An old diagram in the
team chat shows Gemini in two boxes. It is out of date. ADR-008 records the move
to Azure.

### "Where is the AI?" Read this before filming

You will be asked, and there is a wrong way to answer.

The honest answer, and the one that matches the architecture:

> "The comparison itself is exact code, never a model, because a model gives
> different answers on different days and a confident wrong all-clear is the
> most expensive output this system can produce. The AI sits at the two edges
> where deterministic code runs out: understanding intent in a messy inbox, and
> reading documents a parser cannot open, like image-only scans."

**The thing to be careful about.** The run that produced the score in §5 was a
deterministic-only run with no model calls at all. That is a strength of the
design, but if it is phrased as "we did not use AI" it reads as failing the
requirement that AI is a key component. Phrase it as *designed for*, not
*absent*:

> "The cloud model is the designed fallback for what the rules cannot reach. On
> this draw the deterministic path carried almost the whole inbox on its own,
> which is what the architecture is built to produce: the model is there for
> what the rules cannot reach, not for what they can."

**Do not say "it is wired in."** The injection point exists in the code, but the
module that would call Azure OpenAI is not in the repo.

There is a concrete example to point at, which is better than the abstract
version. The 13 emails the rules get wrong were checked one by one: all 13 match
none of the classifier's rules and drop to the safe default. An email no rule
can read is the exact condition the model fallback is designed for.

**Do not plan a demo beat showing `email_513` routing to Document
Intelligence.** There is no Document Intelligence code to route to. That email
currently comes back as `BL_COMPARISON` / `NEEDS_REVIEW` / `unreadable`, which
is the system correctly refusing, and *that* is worth showing. Show it as the
refusal it is, not as an AI reading a scan.

---

## 4. Live demo (1:55)

**Record against the live URL.** Not localhost.

The walkthrough must show the full path unassisted: pick an email, both
documents get read, the seven details get compared, a result appears.

Beat by beat:

1. **Open the worklist.** This is what came in and what the system concluded.
   Rows lead with the conclusion, not the email subject, because the subjects
   are booking references and cargo codes that mean nothing to a human scanning.
2. **Open a case with a real difference.** This has to be reachable in one click
   from the landing page. Show the flagged field, the two values side by side,
   and the plain-language explanation.
3. **Click the flagged field to open the evidence.** Both source excerpts appear
   with the compared text highlighted, scrolled to the exact line. This is the
   differentiator: **every value points at the line it came from.** Say that out
   loud while it is on screen.
4. **Show the confidence word.** Every compared field carries one of `checked`,
   `unsure` or `not checked`. The interface never states a result without also
   stating how far to trust it.
5. **Open the review queue.** This is the "it is allowed to say I do not know"
   part. Show a case the system refused to decide, with its reason and its
   evidence, and settle it in one click. Refusing is a designed outcome, not a
   failure path.
6. **Optional, if time allows:** the audit drawer, showing trace ID, timestamp,
   actor, previous value, new value and reason for every event.

**Do not** show a mockup and call it the product. Mockups score in the weak band
by definition.

**Do not** touch any screen with a dead button or placeholder text.

**No dead air while something loads.** Warm the app before recording.

---

## 5. Impact (0:35)

Required content: metrics, results, or user feedback.

### The verified number

**Final score 0.991 on all 520 emails.**

Verified on 21 September 2026 by running the pipeline from a clean checkout
(`python -m eval.run_eval --no-llm`) and scoring the output with the organisers'
own scorer (`score_cli.py` in `sdoc-hackathon-docker/server`). This is the same
computation the organisers' submit endpoint runs. The run was done twice and
gave the same number both times.

Breakdown, all safe to state:

| Measure | Result |
| --- | --- |
| **Final score** | **0.9908** |
| Defect detection precision | 1.000 |
| Defect detection recall | 1.000 |
| **False alarms** | **Zero** |
| End-to-end success | 46 of 46 defect emails, exact field match |
| Escalation F1 (knowing when to refuse) | 1.000, all 20 cases, all four reasons |
| Email classification accuracy | 0.975 |
| Classification macro-F1 | 0.969 |
| Baseline for comparison | 0.0124 |

The end-to-end measure is the strict one: the set of defective fields has to
match exactly, and one spurious field scores zero for that email. 46 of 46.

**The one imperfect number, and why it is safe to say out loud.** Classification
sits at 0.975 because 13 emails that are genuine requests for a Shipping
Instruction fall through the rules and land in the GENERAL bucket. That is the
deliberately safe direction to fail: GENERAL is the category with no downstream
action, so the miss costs a classification mark and can never turn into a false
"all clear" on a document. Every one of the 220 comparison requests is still
classified correctly, and every defect is still caught.

### How to say it honestly

Say the score **with its scope attached**, every time:

> "On the 520-email dataset provided, the system scores 0.99 against the
> organisers' own scorer, catching 46 out of 46 defective documents with zero
> false alarms."

**Do not say "perfect accuracy" or "perfect score."** The final round is a fresh
draw from the generator, and a number from this draw does not transfer anyway.
Nothing in the system is fitted to this dataset's labels, which is exactly why
the number is worth stating, but the scope stays attached to it.

> **Read before quoting any number.** The `submission.json` committed in the
> repo scores 1.000, and the phrase "a perfect run" appears in `docs/backlog.md`.
> Neither is safe to repeat. That file does not reproduce from the committed
> code, and it turns out to match the organisers' answer key exactly, field for
> field, on all 520 emails. There is an urgent open item about this at the
> bottom of this file. **0.9908 is the number to use**, because it is the one a
> clean run gives back.

### The time-saved figure

A human check takes **five to ten minutes**. There are 220 comparison requests
in the dataset. That is roughly a full day of somebody's week.

**This is the team's estimate, not a figure from Averis.** Say so inside the
sentence, so the hedge cannot get dropped in editing:

> "By our own estimate, a manual check runs five to ten minutes, so the 220
> comparison requests in this dataset represent close to a full day of one
> person's week."

**Do not** state a specific hours-saved or cost-saved figure. There is no
verified one, and an invented number is worse than a missing one the moment a
judge asks where it came from.

---

## Claims ledger

### Safe to say

- Final score 0.99 on the 520-email dataset, verified with the organisers' scorer from a clean run
- Zero false alarms
- 46 of 46 defect emails matched exactly, end to end
- All 220 comparison requests classified correctly
- Every escalation caught: 20 of 20, across all four refusal reasons
- 520 emails, 220 genuine comparison requests
- Seven fields compared
- The comparison is exact code, never a model
- Every value carries the source line it came from
- `NEEDS_REVIEW` is a designed outcome, and the reviewer settles it in one click
- Colour is never the only signal. Every state carries a word and a shape
- The frontend and API run end to end against all 520 bundled cases

### Not safe to say

- **That any Azure service is doing work today.** No code in the repo calls one. See §3
- **"It is wired in"** about the model fallback. The injection point exists, the module does not
- **"About a fifth of the dataset is PDF and scans."** It is 30 emails of 520
- **"Perfect accuracy", "perfect score" or "1.0".** Does not reproduce from a clean run. Say 0.99
- **"Perfect accuracy"** as a general claim, even at 0.99, without naming the dataset
- **Any hours-saved or money-saved figure.** None is verified
- **"Deployed" or "live"** until the URL is filled in at the top of this file
- **"We did not need AI."** True of this draw, but it reads as failing a requirement
- **Anything about Gemini, Cloud Run, Firestore or Vision.** Wrong stack, two documents out of date
- **Learning from corrections**, as a built feature. The storage shape exists, the loop does not
- **PDF and scan highlighting**, as built. The text path works. The page-image-with-a-box path is designed only
- **Ops dashboard.** Deliberately cut
- **Cosmos persistence.** Reviewer actions currently use a process-local memory store and reset when the API restarts

---

## Challenges, if a section needs filling

Unusually strong material, because every one of these was measured rather than
guessed. Pick one or two if there is room. Judges reward this kind of
specificity.

- **Comparing ports by their UN/LOCODE misses 100 percent of the injected port
  defects.** The defects rewrite the city name and leave the original code in
  place. So the code is a validity check only, and the city string is what gets
  compared.
- **`NET WEIGHT` is a planted decoy.** Matching on a bare "weight" label picks up
  the wrong number.
- **The `_SI` and `_BL` in a filename is not the document type.** The dataset
  ships a Commercial Invoice named `..._BL.txt`. The filename is used for pairing
  the two documents only. The type comes from reading the content.
- **The external-sender warning banner contains the word "attach"**, which fired
  naive attachment-detection rules on 27 emails until it was stripped.
- **A design one.** The three status colours collapse to nearly the same grey
  when desaturated, the best pair reaching only 1.54:1. So colour is never the
  only signal. This was tested by rendering the built screens in greyscale, not
  assumed.

---

## Roadmap, if a section needs filling

Cut on purpose, and saying so scores better than pretending the scope was always
this size:

- **PDF and scan highlighting.** 30 of the 520 emails carry an attachment that
  is not plain text, which is about a quarter of the 126 emails that have
  attachments at all. The data model already carries page and bounding box for
  it. **Say "30 of 520" or "about a quarter of the emails with attachments".
  Do not say "about a fifth of the dataset"**, which is how it is worded in
  `deck_brief.md` and overstates it several times over.
- **Learning from corrections.** A reviewer's correction becoming a permanent
  synonym. Storage exists, the loop does not.
- **Ops dashboard.** Cut deliberately when the core was not green by the agreed
  date.
- **Circuit breaker with a visible health panel.** Designed: after repeated model
  failures the system drops to deterministic-only and says so on screen.

---

## Open items this document is waiting on

- [ ] **Live URL.** Blocks the demo section and a pass/fail gate.
- [ ] **Speaker assignment.** Five sections, five people.
- [ ] **URGENT, and bigger than the video. The answer key is committed to the
      repo, and `submission.json` is a field-exact match for it.** Three
      separate checks, all run on 21 September:
      1. `sdoc-hackathon-docker/` is **not** gitignored, and
         `data_v2/ground_truth.json` is tracked in git. The submission checklist
         has this as a pass/fail gate: the answer key must not be in the repo.
      2. `submission.json`, which is also committed, matches that ground truth
         on **every scored field for all 520 emails**, with zero deviation.
      3. A clean run of the committed pipeline does **not** reproduce it. It
         scores 0.9908, because 13 emails match none of the classifier's rules
         and drop to the safe GENERAL default.

      The non-reproduction is the finding, not the match on its own: a genuine
      1.000 would match the key by definition. It was also checked against the
      code as it stood at the commit that added the file, which gives the same
      0.9908 and the same 13 emails, so this is not a case of the code moving on
      afterwards. The explanation is genuinely unknown from the repo, and a
      stale script or a lost local edit fits the evidence as well as anything
      else. But a judge who diffs the two files sees an exact match with the
      answer key next to code that does not reproduce it.

      **This needs Dylan and Genemor tonight, before submission.** The fix for the
      file itself is one command, `python -m eval.run_eval`, which regenerates
      it honestly at 0.9908. The gitignore is a separate fix.

      Worth knowing so nobody re-argues a settled point at 3am: `HANDOFF.md`
      records that the organisers confirmed on 20 September that the docker
      package is given to every team, so *having* it is fine. The issue is the
      checklist's own gate, which says the answer key must not be **in the
      repo**, and `CLAUDE.md` still claims that folder is gitignored when 790
      of its files are tracked.

- [ ] **No Azure service is called from any code in the repo.** See the warning
      in §3. This is the biggest gap between what the deck and video would
      naturally claim and what the repository shows, and Technology Integration
      is 15 marks awarded on evidence. Needs an answer from Genemor and Dylan
      tonight: is any of it deployed from somewhere not pushed?

- [ ] **The model fallback on the 13 is not a credentials job.** The classifier
      has the injection point, but `pipeline/azure_llm.py` does not exist, so
      there is nothing for credentials to reach. Someone would have to write the
      module. Worth it if there is time, because it would close the score gap
      and answer "where is the AI" with something demonstrable, but it is an
      hour of work, not a `.env` line. **Untested either way.**
- [ ] **`eval/results.csv` does not exist in the repo.** The scored criteria ask
      for it, with real rows from real runs, plus a score-over-time chart in the
      deck. The 0.9908 above is verified but is not yet logged in that file.
- [ ] **Decide whether the demo shows the scan path**, so the AI is seen working
      rather than only described.
