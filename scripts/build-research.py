#!/usr/bin/env python3
"""Build the AI research pages from data/ JSON. Stdlib only.

    python3 scripts/build-research.py
"""

from __future__ import annotations

import html
import json
import re
import shutil
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SITE = "https://cilliancooke.com"
THUMB_FALLBACK = "/images/papers/thumb-fallback.svg"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

GROUPS = [
    ("youtube", "YouTube channels"),
    ("podcasts", "Podcasts"),
    ("people", "People who inspire me"),
    ("organisations", "Organisations worth checking out"),
]

PORTFOLIO_HASHES = [
    "projects",
    "about",
    "cv",
    "opinions",
    "poetry",
    "books",
    "podcasts",
    "photos",
    "detail-atlas",
    "detail-lockup",
    "detail-quill",
    "detail-fiveside",
    "writing",
    "media",
]


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def fmt_date(iso: str) -> str:
    parsed = date.fromisoformat(iso)
    return f"{parsed.day} {parsed.strftime('%b %Y')}"


def paragraphs(text: str) -> str:
    chunks = [part.strip() for part in str(text).split("\n\n") if part.strip()]
    return "\n".join(f"<p>{esc(part)}</p>" for part in chunks)


def external(url: str, label: str) -> str:
    return (
        f'<a href="{esc(url)}" target="_blank" rel="noopener noreferrer">{esc(label)}</a>'
    )


def thumb_img(youtube_id: str) -> str:
    base = f"https://img.youtube.com/vi/{esc(youtube_id)}"
    return (
        f'<img class="video-card-thumb" src="{base}/maxresdefault.jpg" '
        f'data-hq="{base}/hqdefault.jpg" data-local="{THUMB_FALLBACK}" '
        f'alt="" width="1280" height="720" loading="lazy" decoding="async">'
    )


def video_card(video: dict) -> str:
    paper = video["paper"]
    return f"""<a class="video-card" href="/videos/{esc(video['slug'])}/">
            <div class="video-card-media">
              {thumb_img(video['youtubeId'])}
              <img class="video-card-paper" src="{esc(paper['image'])}" alt="" width="480" height="640" loading="lazy" decoding="async">
            </div>
            <h3>{esc(video['title'])}</h3>
            <p>{esc(paper['title'])} · {esc(paper['authors'])}</p>
            <p>{esc(video['shortDescription'])}</p>
            <p class="piece-meta">{esc(fmt_date(video['date']))}</p>
          </a>"""


def shell(title: str, description: str, canonical: str, body: str, *, og_image: str, og_type: str = "website", hash_redirect: bool = False) -> str:
    redirect = ""
    if hash_redirect:
        keys = ",".join(f'"{name}":1' for name in PORTFOLIO_HASHES)
        redirect = (
            "<script>(function(){var known={"
            + keys
            + "};var h=location.hash.slice(1);if(known[h])location.replace('/portfolio/#'+h);})();</script>\n  "
        )
    image_meta = ""
    if og_image:
        image_meta = f"""
  <meta property="og:image" content="{esc(og_image)}">
  <meta name="twitter:image" content="{esc(og_image)}">"""
    card = "summary_large_image" if og_image and "img.youtube.com" in og_image else "summary"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">
  <meta name="author" content="Cillian Cooke">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{esc(canonical)}">
  <meta property="og:type" content="{esc(og_type)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:locale" content="en_IE">
  <meta property="og:site_name" content="Cillian Cooke">{image_meta}
  <meta name="twitter:card" content="{card}">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(description)}">
  <link rel="icon" href="/images/site-icon.png" type="image/png">
  <link rel="apple-touch-icon" href="/images/site-icon.png">
  {redirect}<link rel="stylesheet" href="/css/style.css">
</head>
<body class="research">
  <nav class="nav">
    <a class="nav-brand" href="/" aria-label="Home">
      <img class="nav-brand-mark" src="/images/site-icon.png" alt="" width="44" height="44">
    </a>
  </nav>
  <main class="site-main">
{body}
    <footer class="footer">
      <div class="footer-links">
        <a href="https://github.com/Cillian-Cooke" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="https://www.linkedin.com/in/cillian-cooke-15155939a/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        <a href="https://cookie876.substack.com" target="_blank" rel="noopener noreferrer">Substack</a>
        <a href="/portfolio/">Portfolio</a>
      </div>
      <p class="footer-copy">Dublin, Ireland · 2026</p>
    </footer>
  </main>
  <script src="/js/research.js"></script>
  <script src="/js/curves.js"></script>
</body>
</html>
"""


def require(video: dict, key: str):
    if key not in video or video[key] in ("", None, []):
        if key == "standoutComments":
            return
        raise SystemExit(f"{video.get('slug', '?')}: missing {key}")


def load_videos() -> list[dict]:
    videos = []
    for path in sorted((DATA / "videos").glob("*.json")):
        video = load_json(path)
        for key in (
            "slug",
            "title",
            "date",
            "youtubeId",
            "shortDescription",
            "paper",
            "summary",
            "uncertainties",
        ):
            require(video, key)
        if video["slug"] != path.stem:
            raise SystemExit(f"{path.name}: slug must match the filename")
        if not SLUG_RE.match(video["slug"]):
            raise SystemExit(f"{video['slug']}: slug must be lowercase words separated by hyphens")
        date.fromisoformat(video["date"])
        paper = video["paper"]
        for key in ("title", "authors", "year", "source", "url", "image"):
            if key not in paper or paper[key] in ("", None):
                raise SystemExit(f"{video['slug']}: paper.{key} is required")
        if not str(paper["image"]).startswith("/images/papers/"):
            raise SystemExit(f"{video['slug']}: paper.image must be a local file in /images/papers/")
        video.setdefault("extraLinks", [])
        video.setdefault("mentions", [])
        video.setdefault("standoutComments", [])
        videos.append(video)
    videos.sort(key=lambda item: item["date"], reverse=True)
    return videos


def render_cards(videos: list[dict]) -> str:
    return "\n          ".join(video_card(video) for video in videos)


def render_home(site: dict, recs: dict, videos: list[dict]) -> str:
    latest = videos[:5]
    more = ""
    if len(videos) > 5:
        more = '\n        <p class="research-more"><a class="btn" href="/videos/">Load all</a></p>'
    groups = []
    for key, label in GROUPS:
        cards = []
        for entry in recs[key]:
            cards.append(
                f"""<a class="recommend-card" href="{esc(entry['url'])}" target="_blank" rel="noopener noreferrer">
            <h3>{esc(entry['name'])}</h3>
            <p>{esc(entry['why'])}</p>
          </a>"""
            )
        groups.append(
            f"""<div class="recommend-group">
          <h3>{esc(label)}</h3>
          <div class="recommend-grid">
          {chr(10).join(cards)}
          </div>
        </div>"""
        )
    body = f"""    <section class="section research-videos" aria-labelledby="latest-videos">
      <h2 id="latest-videos">Latest videos</h2>
      <div class="video-grid">
          {render_cards(latest)}
      </div>{more}
    </section>

    <section class="section research-recommended" aria-labelledby="recommended">
      <h2 id="recommended">Recommended</h2>
      {chr(10).join(groups)}
    </section>
"""
    return shell(
        "Cillian Cooke · AI research",
        site["intro"],
        f"{SITE}/",
        body,
        og_image=f"{SITE}/images/site-icon.png",
        hash_redirect=True,
    )


def render_index(videos: list[dict]) -> str:
    description = "Every paper video, newest first."
    body = f"""    <section class="section">
      <a class="detail-back" href="/">← Home</a>
      <div class="page-header">
        <p class="eyebrow">AI research</p>
        <h1>Videos</h1>
      </div>
      <div class="video-grid">
          {render_cards(videos)}
      </div>
    </section>
"""
    return shell(
        "Videos · Cillian Cooke",
        description,
        f"{SITE}/videos/",
        body,
        og_image=f"{SITE}/images/site-icon.png",
    )


def link_list(items: list[dict], label_key: str) -> str:
    return "\n".join(
        f"<li>{external(item['url'], item[label_key])}</li>" for item in items
    )


def render_video(video: dict, newer: dict | None, older: dict | None) -> str:
    paper = video["paper"]
    paper_alt = paper.get("alt") or f"Title page of {paper['title']}"
    extra = ""
    if video["extraLinks"]:
        extra = f"""<section class="video-section">
        <h2>Links I used</h2>
        <ul class="video-links">{link_list(video['extraLinks'], 'label')}</ul>
      </section>"""
    mentions = ""
    if video["mentions"]:
        mentions = f"""<section class="video-section">
        <h2>People and organisations</h2>
        <ul class="mention-list">{link_list(video['mentions'], 'name')}</ul>
      </section>"""
    comments = ""
    if video["standoutComments"]:
        items = []
        for comment in video["standoutComments"]:
            items.append(
                f"""<li>
            <a href="{esc(comment['url'])}" target="_blank" rel="noopener noreferrer">{esc(comment['author'])}</a>
            <blockquote>{esc(comment['text'])}</blockquote>
          </li>"""
            )
        comments = f"""<section class="video-section">
        <h2>Comments that stood out</h2>
        <ul class="comment-list">
          {chr(10).join(items)}
        </ul>
      </section>"""
    unsure = ""
    if str(video["uncertainties"]).strip():
        unsure = f"""<h3>What I'm still unsure about</h3>
        {paragraphs(video['uncertainties'])}"""
    pager = []
    if newer:
        pager.append(
            f'<a href="/videos/{esc(newer["slug"])}/"><span>Newer</span>{esc(newer["title"])}</a>'
        )
    if older:
        pager.append(
            f'<a href="/videos/{esc(older["slug"])}/"><span>Older</span>{esc(older["title"])}</a>'
        )
    thumb = f"https://img.youtube.com/vi/{video['youtubeId']}/maxresdefault.jpg"
    body = f"""    <article class="section">
      <a class="detail-back" href="/videos/">← Videos</a>
      <p class="piece-meta">{esc(fmt_date(video['date']))}</p>
      <h1>{esc(video['title'])}</h1>
      <div class="video-frame">
        <iframe src="https://www.youtube-nocookie.com/embed/{esc(video['youtubeId'])}" title="{esc(video['title'])}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
      </div>

      <section class="video-section" aria-labelledby="paper-heading">
        <h2 id="paper-heading">Paper</h2>
        <div class="paper-block">
          <img class="paper-shot" src="{esc(paper['image'])}" alt="{esc(paper_alt)}" width="480" height="640" loading="lazy" decoding="async">
          <div>
            <h3>{esc(paper['title'])}</h3>
            <p>{esc(paper['authors'])} · {esc(paper['year'])} · {esc(paper['source'])}</p>
            {paragraphs(video['shortDescription'])}
            <p>{external(paper['url'], 'Read the paper')}</p>
          </div>
        </div>
      </section>

      {extra}
      {mentions}

      <section class="video-section">
        <h2>Summary</h2>
        {paragraphs(video['summary'])}
        {unsure}
      </section>

      {comments}

      <nav class="video-pager" aria-label="More videos">
        {''.join(pager)}
      </nav>
      <p><a class="detail-back" href="/">← Home</a></p>
    </article>
"""
    return shell(
        f"{video['title']} · Cillian Cooke",
        video["shortDescription"],
        f"{SITE}/videos/{video['slug']}/",
        body,
        og_image=thumb,
        og_type="article",
    )


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print(path.relative_to(ROOT))


def render_sitemap(videos: list[dict]) -> str:
    urls = [f"{SITE}/", f"{SITE}/videos/", f"{SITE}/portfolio/", f"{SITE}/portfolio/essays/agent-identity.html"]
    urls[2:2] = [f"{SITE}/videos/{video['slug']}/" for video in videos]
    lines = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>", '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url in urls:
        lines.append(f"  <url><loc>{esc(url)}</loc></url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main() -> None:
    site = load_json(DATA / "site.json")
    recs = load_json(DATA / "recommendations.json")
    for key, _label in GROUPS:
        if key not in recs:
            raise SystemExit(f"recommendations.json is missing {key}")
    videos = load_videos()
    if not videos:
        raise SystemExit("Add at least one file in data/videos/")

    write(ROOT / "index.html", render_home(site, recs, videos))
    write(ROOT / "videos" / "index.html", render_index(videos))

    keep = set()
    for index, video in enumerate(videos):
        newer = videos[index - 1] if index > 0 else None
        older = videos[index + 1] if index + 1 < len(videos) else None
        folder = ROOT / "videos" / video["slug"]
        keep.add(video["slug"])
        write(folder / "index.html", render_video(video, newer, older))

    videos_root = ROOT / "videos"
    for child in videos_root.iterdir():
        if child.is_dir() and child.name not in keep:
            shutil.rmtree(child)
            print(f"removed videos/{child.name}")

    write(ROOT / "sitemap.xml", render_sitemap(videos))


if __name__ == "__main__":
    main()
