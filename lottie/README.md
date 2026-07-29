# Lottie drop-in slots

Export JSON (or convert to the expected filename) and place files here. The site uses SVG/CSS fallbacks until a file loads successfully.

## Priority order

1. `logo.json` — nav mark (400×400; intro then idle loop)
2. Home name expand is implemented in SVG/CSS (`#name-expand`): two C strokes draw, then open into **Cillian Cooke**. A future Lottie can replace that block if you export an equivalent; keep artboard ~760×240 and match Syne letter spacing.
3. Section marks (200×200):
   - `mark-work.json`
   - `mark-opinions.json`
   - `mark-poetry.json`
   - `mark-books.json`
   - `mark-podcasts.json`
4. Empty states:
   - `empty-opinions.json`
   - `empty-podcasts.json`
5. Project emblems (optional, ≤96px display):
   - `emblem-atlas.json`
   - `emblem-lockup.json`
   - `emblem-metricare.json`
   - `emblem-digishelf.json`
   - `emblem-hackathon.json`
   - `emblem-mars.json`

## Behaviour

- Player: `lottie-web` via CDN (`js/lottie.js`)
- `prefers-reduced-motion`: keeps SVG fallback, skips autoplay
- Slots are marked with `data-lottie="lottie/….json"`

See the redesign plan for motion briefs (stroke-draw monogram, constellation, underline, verse lines, page flip, waveform).
