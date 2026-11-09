# Cillian Cooke — Portfolio

Static site for [cilliancooke.com](https://cilliancooke.com) (GitHub Pages).

## Structure

- `index.html` — AI research home (generated)
- `videos/` — all videos, plus one folder per video (generated)
- `data/site.json`, `data/recommendations.json`, `data/videos/*.json` — source for the research pages
- `portfolio/index.html` — portfolio (Projects, About, CV + secondary overlays)
- `portfolio/essays/` — HTML opinion pieces (`_template.html`)
- `css/style.css` — design system
- `js/main.js` — portfolio scroll nav, overlays, OpenDyslexic toggle, reveals
- `js/research.js` — font toggle and thumbnail fallback on research pages
- `js/bubbles.js` — Atlas-style tags/bubbles on project detail pages
- `cv/` — downloadable CV
- `fonts/` — OpenDyslexic (optional toggle in nav)

## Add a video

1. Copy `data/videos/placeholder-one.json` to `data/videos/your-slug.json`.
2. Fill in the fields. Keep `slug` the same as the filename. Put a local title-page image in `images/papers/` and point `paper.image` at it (`/images/papers/...`). Do not hotlink figures from the paper.
3. Run `python3 scripts/build-research.py`.
4. Commit the JSON, the paper image, and the generated HTML.

The home page lists the five newest videos. **Load all** appears only when there are more than five. A video page hides **Comments that stood out** when `standoutComments` is empty.

Set the real YouTube channel URL in `data/site.json` (`youtube`). Replace every `PLACEHOLDER: replace me` entry before publishing those as real recommendations or videos.

## Local preview

Serve the root over HTTP:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
