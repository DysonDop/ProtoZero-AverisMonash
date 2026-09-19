# Submission checklist — preliminary round

Tick as you go. Two halves: **§0 is pass/fail** — miss one and the entry is not
considered at all, regardless of how good the build is. **§1–§7 are the scored
criteria**, one block each, written as "what a judge must be able to see."

Form closes **Tue 22 Sep, 12:00 MYT**. Target: submitted **Mon 21 Sep night**.
Judges score **asynchronously from the submission** — nobody is in the room to
clarify anything, so every claim has to be visible in the repo, the video, the
deck, or the live link.

---

## §0 Hard gates — mandatory submission components

The rules say incomplete, illegible, misdirected or late submissions "will not
be considered." These are not marks, they are entry conditions.

- [ ] **Project description** written — name, purpose, problem it solves
- [ ] **GitHub repo link**, public, with a README containing **setup instructions**
- [ ] **Live prototype link**, publicly accessible, working during the judging period
- [ ] Custom domain live through Cloudflare, certificate issued, proxy on, `/api/*` excluded from cache
- [ ] Raw `*.azurecontainerapps.io` URL documented in the README as the fallback
- [ ] **Demo video link** — YouTube **unlisted or public** (private is not accepted), or Drive set to *Anyone with the link → Viewer*
- [ ] **Slide deck / documentation link**, publicly accessible
- [ ] Deck or docs covers all four required topics: **technical architecture · implementation details · challenges faced · future roadmap**
- [ ] Team details ready: team name, representative name, email, contact number
- [ ] Submitted at <https://forms.gle/nnam5eXrf5cjXdf3>

Rules compliance, also pass/fail:

- [ ] AI is a **key component**, not decoration
- [ ] Cloud infrastructure is **meaningfully** used — the rules explicitly say weak cloud use gets "significantly reduced scores"
- [ ] All work done inside 18–22 Sep
- [ ] Original work; no other team's code, ideas or designs
- [ ] Answer key from the organisers' package is **not** in the repo (`git check-ignore sdoc-hackathon-docker/`)
- [ ] **Azure OpenAI confirmed enabled on the subscription**, models deployable in region
- [ ] No secrets committed — no API keys in any file or log

> Prelim minimum bar per the rules: a low-code solution at minimum, semi-working
> prototype strongly encouraged, **no-code submissions not accepted**. We are well
> past this, but it sets what "working" has to mean on the video.

---

## §1 Working Core Prototype — 25 marks

*Excellent (19–25): "The core flow works reliably end-to-end and clearly shows
that the main technical idea has been built."*

The single biggest criterion. Slides and mock-ups score in the **weak** band here
by definition — only a running thing counts.

- [ ] Judge opens the live link and gets a working page, no login, no setup
- [ ] The full path works unassisted: pick an email → both documents read → seven details compared → result shown
- [ ] Works on a phone on mobile data, not just our laptops
- [ ] Custom domain resolves in a private window, with no redirect loop
- [ ] Still up and warm during the judging window (cold start doesn't look broken)
- [ ] A case with a real difference is reachable in **one click** from the landing page
- [ ] A case that escalates to a human is reachable in one click
- [ ] No placeholder text, no "coming soon", no dead buttons on any screen a judge will touch
- [ ] Dataset bundled into the deployment — nothing depends on localhost or the organisers' server
- [ ] Someone outside the team has opened the link and reached a result without being told how

## §2 System Design & Architecture — 15 marks

*Excellent (12–15): "Architecture is coherent, well justified and supported by
the prototype or other technical evidence."*

- [ ] Architecture diagram in the deck — components, data flow, interfaces, dependencies
- [ ] The diagram matches what is actually deployed (not an aspirational one)
- [ ] `docs/architecture.md` public in the repo
- [ ] Alternatives we rejected are written down, with reasons
- [ ] Decision records explain **why**, not just what
- [ ] Data model and API contracts documented (`docs/contracts.md`)
- [ ] Repo layout is legible to someone who has never seen it

## §3 Technology Integration — 15 marks

*Excellent (12–15): "Deep, seamless integration of modern or complex
technologies; tools are leveraged to their full potential."*

The trap is a token deploy. Each service must do real work we can point at.

- [ ] **Azure OpenAI** — doing classification/extraction the deterministic path genuinely can't
- [ ] **AI Document Intelligence** — actually reading a scanned document in the demo
- [ ] **Container Apps** — hosting the live link
- [ ] **Cosmos DB** — storing results, the review queue and corrections
- [ ] **Blob Storage** — holding attachments / rendered pages
- [ ] **Key Vault** — holding the keys
- [ ] **GitHub Actions** — auto-deploying on push to main
- [ ] **Application Insights** — structured logs, one record per model call
- [ ] For each of the above, one sentence in the deck saying what it does *and why that service*
- [ ] We can answer "where is the AI?" in one confident sentence (see the tech slide notes)

## §4 Technical Feasibility & Validation — 15 marks

*Excellent (12–15): "Critical assumptions are validated with clear evidence and
there is a credible path to completion."*

This is the one most teams hand-wave, and where our dataset work pays off.

- [ ] `eval/results.csv` committed, with real rows from real runs
- [ ] Score-over-time chart in the deck, generated from that file
- [ ] Baseline stated (0.0124) and current score stated honestly
- [ ] The three tracked numbers shown separately: right emails found, real differences found, **false alarms**
- [ ] `docs/dataset_facts.md` public — the evidence we measured before building
- [ ] The port-code finding written up as a validated assumption, not a war story
- [ ] **Known limitations** section in the README — what it does not handle, and how we know
- [ ] Unit tests exist and pass; the trap cases are in them
- [ ] Nothing in the deck or video claims a capability we have not demonstrated

## §5 Problem Statement Understanding — 10 marks

*Excellent (8–10): "Strong, well-supported understanding of the problem, its
context and why it matters."*

- [ ] Deck explains what an SI and a draft BL actually are, in plain words
- [ ] The seven compared details are named
- [ ] Named stakeholders: the documentation executive, the reviewer, the ops lead
- [ ] Consequences are concrete — mis-delivered cargo, wrong port, customs holds, post-issue amendments
- [ ] The false-alarm cost is argued, not just the miss cost
- [ ] Video covers "who it affects and why it matters" explicitly
- [ ] No unexplained jargon in the video — if a term is used, it is defined first

## §6 Innovation & Solution Approach — 10 marks

*Excellent (8–10): "The approach is original, well justified and offers a clear
advantage."*

- [ ] The differentiator is stated in one sentence, not a feature list
- [ ] Evidence-backed answers — every value points at its source line — demonstrated live
- [ ] "It is allowed to say I don't know" shown working, not just claimed
- [ ] The deterministic-comparison argument made explicitly (reproducible, testable, provable)
- [ ] Learning from corrections demonstrated, if built
- [ ] We can say what a generic "ask an LLM to read it" solution would get wrong

## §7 Practical Value & Potential — 10 marks

*Excellent (8–10): "Strong practical value with a credible path to wider use or
impact."*

- [ ] Time-saved figure — **real number from Averis, or clearly labelled as our estimate**
- [ ] Impact stated in the video ("metrics, results, or user feedback" is required content)
- [ ] Future roadmap in the deck — required content, and it is a scored criterion here too
- [ ] Roadmap items are extensions of what exists, not a different product
- [ ] The adoption argument is there: why a desk would actually turn this on

> ⚠️ Two bracketed placeholders are still live in the deck: **minutes saved per
> check**, and the **hours saved** tile on the dashboard. Either get a real
> figure or label it as an estimate. Do not invent one — an invented number is
> worse than a missing one if a judge asks where it came from.

---

## §8 Demo video — ≤ 5:00

**One mark deducted per 30 seconds over.** Aim for 4:30. Required content, per
the rules, in this order:

- [ ] **Quick intro** — team name and project name
- [ ] **The problem** — who it affects and why it matters
- [ ] **Tech stack** — the key technologies
- [ ] **Live demo** — walkthrough of the working prototype
- [ ] **Impact** — metrics, results or feedback

Production:

- [ ] Recorded against the **live deployed link**, not localhost
- [ ] Audio is audible; no dead air while something loads
- [ ] Text on screen is readable at the video's resolution
- [ ] Timed and confirmed under 5:00 before upload
- [ ] Uploaded unlisted or public, link opened in a private window to confirm it plays

## §9 Final pass before submitting

- [ ] Every one of the five links opened in a **private/incognito window** by someone not logged into our accounts
- [ ] README setup instructions followed from scratch on a clean machine, and they work
- [ ] Repo has no secrets, no answer key, no `.env`
- [ ] Deck link is public and covers architecture, implementation, challenges, roadmap
- [ ] Project description proofread
- [ ] Form submitted with time to spare — **not** at 11:55 on the 22nd
- [ ] Screenshot of the submission confirmation kept

---

### Where the marks actually are

| Criterion | Marks | Honest self-score today | Gap |
| --- | --- | --- | --- |
| Working Core Prototype | 25 | | |
| System Design & Architecture | 15 | | |
| Technology Integration | 15 | | |
| Technical Feasibility & Validation | 15 | | |
| Problem Statement Understanding | 10 | | |
| Innovation & Solution Approach | 10 | | |
| Practical Value & Potential | 10 | | |

Fill the last two columns together at the next standup. The rubric says judges
score each criterion **independently** and must not reward the same evidence
twice — so a gap in one column cannot be covered by being strong in another.
