# HANDOFF

## Snapshot

**20 Sep 2026, evening.** The frontend is a running React app, not mockups:
three screens on real fixtures, pushed and public. Backend has docs and
contracts but no code. **Preliminary deadline Tue 22 Sep, 12:00 noon**, target
submitted Monday night.

## Active plan

No staged plan file. Work is driven by `docs/submission_checklist.md` (what is
scored, and the pass/fail gates), with `docs/prd.md` for scope and
`docs/design_system.md` for the frontend.

## Done & verified

- **`web/` React app.** React + Vite, plain CSS, no router library. Three
  routes: `#/` worklist, `#/review` queue, `#/case/{id}`. Reads `web/mocks/`;
  `VITE_API_BASE=/api` switches it to Gene's API with no other change.
  *Verified in a browser on the production build:* all twelve cases render, no
  empty screens, no contradictions between a worklist row and its case screen,
  no console errors. `npm ci` then `npm run build` clean.
- **Confidence display** (`design_system.md` §5, `.conf` in `index.css`). Every
  compared field carries `checked` / `unsure` / `not checked`. Word not icon, so
  it passes the §4 greyscale test, which was run against the built page. Only
  `--muted` and `--blue`, never the verdict colours, with an explicit rule
  keeping it muted inside a red flagged box. Measured 6.42:1 and 5.53:1, both AA.
- **Evidence view** (`prd.md` §3.2 must-have). Clicking a field shows the exact
  line from both documents with the value highlighted, sliced live from
  `locator.char_start` / `char_end`. It **replaces** that field's margin note
  instead of stacking above it.
- **`README.md`, pushed and rendering on the public repo.** §0 gate closed.
  Every path in it checked to exist, every command run before it was written.
  Still needs the live link and the raw `*.azurecontainerapps.io` fallback.
- **`docs/contracts.md` §10** — seven proposals for Gene, nothing live changed.
- **`web/mocks/cases.json`** — was promised by the mocks README and had never
  been written, so the worklist had no data source.

## In flight

Nothing half-edited. Clean stopping point. Two commits pushed (`3c47173`,
`9efe6e4`); three files deliberately left uncommitted, see Watch-outs.

## Next steps

**Pass or fail. Miss one and the entry is not considered at all.**

1. **Deploy, get a live prototype link.** *Done when:* a judge opens a public URL
   with no login and reaches a case with a real difference in one click. Add the
   URL and the raw `*.azurecontainerapps.io` fallback to `README.md`.
2. **Slide deck.** seunniee owns it. Brief written at `docs/deck_brief.md`
   (untracked, local only). *Done when:* publicly accessible and covering all
   four required topics.
3. **Demo video**, YouTube unlisted or Drive anyone-with-link. Private is not
   accepted.

**Scored.**

4. **Architecture diagram, on Azure**, inside the deck. The diagram in the team
   chat shows Gemini in two boxes and is two documents out of date; ADR-008 in
   `docs/architecture.md` records the move to Azure. *Done when:* §2's "the
   diagram matches what is actually deployed" is true.
5. **Refusal cases reached from the worklist have no actions**, only a back
   arrow. Their buttons live on `#/review`. Not a dead button, but a dead end.
6. **PDF and scan mode.** Roughly a fifth of the dataset. `Locator` already
   carries `page` and `bbox`. *Done when:* the case screen can render a locator
   that has `page` + `bbox` instead of char offsets.
7. **`design_system.md` §6–§9 are stale** and still describe a sidebar, a
   density switcher and four screens. Trust `index.css` and the app over them.

## Decisions & why

- **Three screens, not two or four.** `prd.md` names three users; the reviewer
  needs to confirm or correct **in one click**, which only the queue screen
  gives. Screen four (ops dashboard) stays cut because `prd.md` §3.3 put it
  behind "build if core is green by Sat night" and that failed.
- **Plain CSS, no Tailwind**, deviating from the old stack table, which is now
  corrected in `CLAUDE.md`. The design is named components carrying rules (a
  status mark ships its shape and colour together; the accepted AA failure is
  confined to one class). Utilities would make those rules something to
  remember rather than something the code enforces.
- **No router library.** Three routes, ~15 lines of hash routing.
- **The "Needs a person" chip navigates to `#/review`** rather than filtering in
  place, because there is nowhere else to put a door to the queue without a
  second navigation surface. Three chips filter, one navigates.
- **The worklist row leads with the conclusion**, not the subject. Subjects here
  are booking references and cargo codes. seunniee opened the first version and
  could not read it, which is exactly the §1 outsider test.
- Unchanged and not to be re-litigated: one 50px bar is the whole shell · the
  draft is drawn as a bill of lading form · corrections read wrong-then-right,
  struck through · say each thing once · white on the orange button fails AA at
  2.71:1 and was chosen anyway on appearance (`design_system.md` §2.2).

## Watch-outs

- **`ground_truth.json` is not a leak.** The organisers confirmed on 20 Sep that
  the docker zip is given to every team to evaluate their own work. Two lines in
  `CLAUDE.md` are stale as a result: the folder is *not* gitignored, and it was
  *not* sent in error. **What stands:** never fit to the labels. The final round
  is a fresh draw, so anything tuned to these is a number that lies.
- **Verify the browser is running the build you think it is.** A check of the
  evidence panel passed against a *cached* bundle on `vite preview` and reported
  a fix working that was not. Compare
  `document.querySelectorAll('script')[0].src` against the hash the build
  printed, or add a `?cb=` query. The dev server on 5175 is always fresh.
- **`npm run build` fails on seunniee's machine only.** Her personal
  `~/.npmrc` contains `os=linux`, so npm installs Linux binaries on Windows and
  rollup cannot load its native module. Nothing in the repo causes it; CI is
  fine. Use `npm install --os=win32`. Do **not** add platform binaries to
  `package.json` to paper over it; that was tried and reverted.
- **Responsive rules for the check screen are scoped to `.app` on purpose.** The
  app is fluid and stacks the notes under the sheet below 1160px; the mockups
  draw the same screens inside fixed 1360px frames and must not reflow. An
  unscoped media query silently breaks the mockups at narrow widths.
- **Three files are deliberately uncommitted:** `HANDOFF.md`,
  `docs/deck_brief.md`, `.claude/launch.json`. The first two contain the
  absolute path `C:\Users\yingx\...`. Scrub that before committing them.
- **`email_003` is a classification question for Gene.** It is `BL_COMPARISON` +
  `OK` with zero attachments, so the worklist calls it "All clear" while the
  case screen has nothing to draw. The UI now says "Nothing to compare" rather
  than contradicting the list, but an email asking *for* a draft looks like
  `SI_REQUEST`. `web/mocks/README.md` says the UI renders status as given and
  never recomputes, so this needs a backend answer.
- **`publicDir: 'mocks'` copies `web/mocks/README.md` into `dist/`**, so a
  deployed build serves the fixtures README at the site root. Remove before the
  judged deploy.
- **Two prose-vs-code disagreements in `design_system.md`**, neither patched.
  §2.1 gives `--paper` as `#F7F6F2`; `index.css` ships `#EDEAE3`, and every
  contrast figure in §5 was measured against the shipped value. §3 says "never
  all-caps labels"; `.bx__label` is `text-transform: uppercase`.
- **`web/mocks/` is UI mock data, not eval data.** Do not use it as expected
  pipeline output. One label (`email_506`) came from the organisers' key because
  a zero-attachment comparison request is genuinely ambiguous from the email.
