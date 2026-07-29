# Cillian Cooke — Portfolio

Static site for [cilliancooke.com](https://cilliancooke.com) (GitHub Pages).

## Structure

- `index.html` — SPA shell (Work, Writing, Media, About, CV + project details)
- `css/style.css` — design system
- `js/main.js` — routing, OpenDyslexic toggle, reveals
- `js/lottie.js` — Lottie drop-in slots with SVG fallbacks
- `js/bubbles.js` — Atlas-style tags/bubbles on project detail pages
- `essays/` — HTML opinion pieces (`_template.html`, `sample.html`)
- `lottie/` — drop JSON animations here (see README in that folder)
- `cv/` — downloadable CV
- `fonts/` — OpenDyslexic (optional toggle in nav)

## Local preview

Serve the root over HTTP (needed for essay links and optional Lottie fetch):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
