# Cillian Cooke — Portfolio

Static site for [cilliancooke.com](https://cilliancooke.com) (GitHub Pages).

## Structure

- `index.html` — one-page site (Projects, About, CV + secondary overlays)
- `css/style.css` — design system
- `js/main.js` — scroll nav, overlays, OpenDyslexic toggle, reveals
- `js/bubbles.js` — Atlas-style tags/bubbles on project detail pages
- `essays/` — HTML opinion pieces (`_template.html`)
- `cv/` — downloadable CV
- `fonts/` — OpenDyslexic (optional toggle in nav)

## Local preview

Serve the root over HTTP:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
