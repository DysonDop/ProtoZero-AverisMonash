# ProtoZero slide design system

Version 1.0 · 16:9 widescreen · evidence-first operational storytelling

This system translates the application’s existing visual language into presentation rules. The accompanying PowerPoint is the working specimen; `brand/slide-tokens.json` is the machine-readable source of truth.

## 1. Brand idea

ProtoZero should feel calm, precise and inspectable. A slide should make one operational claim, show the proof for it and make the next decision obvious.

- Lead with the conclusion, not the process description.
- Use plain working language: “Needs a person”, “Differences found”, “Evidence location”.
- Treat source evidence as a first-class object, never as a footnote.
- Use orange for brand emphasis only. Use red, blue and green only for status meaning.
- Never imply AI certainty where the product is showing a confidence score or fallback mode.

## 2. Colour

| Token | Hex | Use |
|---|---:|---|
| Ink | `#101A24` | Headlines, primary text, dark bands |
| Paper | `#EDEAE3` | Presentation background |
| Sheet | `#FFFFFF` | Cards and evidence surfaces |
| Soft sheet | `#F8F6F1` | Secondary panels |
| Muted | `#55606B` | Supporting text |
| Rule | `#D9DCE0` | Dividers and structure |
| Brand orange | `#E78823` | Brand line, emphasis, fallback |
| Review blue | `#006DAE` | Human review and interactive analysis |
| Difference red | `#B83A28` | Confirmed mismatch only |
| Clear green | `#2E7D6E` | Confirmed clear or online state |

Colour must never be the only carrier of meaning. Pair it with labels, shapes or numbers.

## 3. Typography

- Display and body: **Archivo**. Use Aptos as the portability fallback.
- Evidence, IDs, timestamps and metrics: **Azeret Mono**. Use Aptos Mono as fallback.
- Wordmark exception: **Lato Bold** with the final zero in **JetBrains Mono Bold**.
- Cover title: 44 pt. Section title: 34 pt. Slide title: 30 pt. Body: 18 pt. Caption: 13 pt. Data: 26 pt or larger.
- Use sentence case. Avoid all caps except short labels with tracking.

## 4. Grid and spacing

- Canvas: 1280 × 720, 16:9.
- Outer safe area: 64 px. Keep all meaningful content inside it.
- Standard title starts at x=64, y=52. Content starts at y=145.
- Use an 8 px rhythm. Preferred gaps: 12, 20, 32 and 48 px.
- Prefer one composition over repeated card grids. Use cards only when the content is genuinely modular.
- Minimum 32 px between unrelated groups. Use a rule line when ownership is ambiguous.

## 5. Data visualisation

Use charts to expose a decision, not decorate a slide.

- Use horizontal bars for ranked issues and categories.
- Use a 100% stacked bar for outcomes when the whole matters.
- Use a flow diagram for inbox → document checks → outcome.
- Label values directly and show percentages only when a denominator is clear.
- Start quantitative axes at zero. No 3D, gradients, gauges or unlabeled colour legends.
- Chart titles should state the finding, for example: “70% of document checks clear automatically”.
- Every dashboard chart should support drill-down in the product; the presentation should name the affected case set.

## 6. Status and confidence

- Cleared: green square plus “Cleared”.
- Difference: red circle plus “Difference found”.
- Human review: blue rounded square plus “Needs a person”.
- Other email: outlined square plus “Routed”.
- Confidence is always a number plus its source, for example “94% classification confidence”.
- Treat thresholds as policy: display the threshold or decision rule when it affects the outcome.
- Fallback uses orange and explicit text: “Deterministic-only mode”. Never present fallback as an error if core checks remain available.

## 7. Evidence pattern

Use two aligned evidence columns labelled **Shipping instruction** and **Bill of lading**. Put the compared field name above both values, use monospace for exact extracted text, and show the page or line reference directly below. Highlight only the exact differing fragment. The conclusion sits above the evidence, never between the documents.

## 8. Recommended slide layouts

1. Cover: wordmark, one-line promise, thin orange edge.
2. Section divider: one statement and a large step number.
3. Insight + chart: finding on the left, editable chart on the right.
4. Evidence comparison: finding across the top, aligned source panels below.
5. Architecture or workflow: one direction, five stages maximum, outcome on the right.
6. Case study: case label, problem, evidence, human action, final result.
7. Closing: three proof points and a single ask.

## 9. Accessibility and export checks

- Minimum body text is 17 pt; use 18 pt by default.
- Maintain at least 4.5:1 contrast for body text.
- Do not place text directly on detailed images without a solid backing.
- Add speaker notes for evidence sources and non-obvious definitions.
- Before sharing: render every slide, check clipping, verify editable charts/tables, and test PDF export.

## 10. Files

- `brand/slide-tokens.json` — reusable colours, typography, spacing and chart tokens.
- `outputs/slide-design-system/protozero-slide-design-system.pptx` — editable reference deck and layout specimen.
- `docs/slide_design_system.md` — usage rules for the team.
