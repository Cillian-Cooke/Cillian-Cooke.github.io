/* ============================================
   INTEREST BUBBLES — ported from the Atlas app
   (lib/Map_And_Bubbles/bubble_simulation.dart)

   Per page: two draggable interest tags float
   above everything; ~20 coloured bubbles drift in
   the background and steer toward the tag that
   matches their group. Drag a tag and its bubbles
   follow, exactly like the Atlas map.
   ============================================ */

(function () {
  'use strict';

  /* ---- Per-page interests (edit freely) ----
     Each page gets two tags. Colours are taken from
     the Atlas Material palette. Tweak the labels to
     whatever interests you want shown on each tab. */
  const PAGE_CONFIG = {
    home:     [{ name: 'Coding',   color: '#ff9800' }, { name: 'Juggling',    color: '#009688' }],
    projects: [{ name: 'Football',  color: '#2196f3' }, { name: 'Startups',  color: '#9c27b0' }],
    about:    [{ name: 'Books',    color: '#4caf50' }, { name: 'D&D',        color: '#e91e63' }],
    cv:       [{ name: 'Travel',   color: '#f44336' }, { name: 'Poetry',     color: '#2196f3' }],
  };

  const ROGUE_COLOR = '#9e9e9e';

  // Physics constants (matching the Atlas simulation)
  const MAX_SPEED = 160;     // px/sec
  const ACCEL = 300;         // px/sec^2
  const DRAG = 0.9;
  const DRIFT_SPEED = 15;    // px/sec for untargeted bubbles

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let field, tagLayer;            // DOM containers (fixed, full viewport)
  let bubbles = [];               // active bubble objects for current page
  let tags = [];                  // active tag objects for current page
  let lastTime = 0;
  let rafId = null;
  let currentPage = null;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function bubbleCount() {
    // ~20 on desktop, fewer on small screens so it stays out of the way
    if (window.innerWidth < 600) return 11;
    if (window.innerWidth < 900) return 16;
    return 20;
  }

  // --- Build the persistent layers once ---
  function ensureLayers() {
    if (field) return;
    field = document.createElement('div');
    field.className = 'bubble-field';
    field.setAttribute('aria-hidden', 'true');

    tagLayer = document.createElement('div');
    tagLayer.className = 'tag-layer';
    tagLayer.setAttribute('aria-hidden', 'true');

    // Bubble field first so it paints behind page content; tag layer can go anywhere (fixed, high z-index)
    document.body.insertBefore(field, document.body.firstChild);
    document.body.appendChild(tagLayer);
  }

  // --- Create a tag (draggable label) ---
  function makeTag(config, x, y) {
    const el = document.createElement('div');
    el.className = 'interest-tag';
    el.textContent = config.name;
    el.style.setProperty('--tag-accent', config.color);
    tagLayer.appendChild(el);

    const tag = { el, name: config.name, color: config.color, x, y };
    el.style.left = x + 'px';
    el.style.top = y + 'px';

    attachDrag(tag);
    return tag;
  }

  // --- Pointer dragging for tags ---
  function attachDrag(tag) {
    let offsetX = 0, offsetY = 0;

    function onMove(e) {
      const p = e.touches ? e.touches[0] : e;
      tag.x = clamp(p.clientX - offsetX, 0, window.innerWidth);
      tag.y = clamp(p.clientY - offsetY, 60, window.innerHeight);
      tag.el.style.left = tag.x + 'px';
      tag.el.style.top = tag.y + 'px';
    }

    function onUp() {
      tag.el.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }

    function onDown(e) {
      const p = e.touches ? e.touches[0] : e;
      const rect = tag.el.getBoundingClientRect();
      offsetX = p.clientX - (rect.left + rect.width / 2);
      offsetY = p.clientY - (rect.top + rect.height / 2);
      tag.el.classList.add('dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      e.preventDefault();
    }

    tag.el.addEventListener('mousedown', onDown);
    tag.el.addEventListener('touchstart', onDown, { passive: false });
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // --- Collect on-screen rects to avoid (text + important elements) ---
  function collectAvoidRects() {
    const rects = [];
    const push = (el) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
        rects.push(r);
      }
    };
    push(document.querySelector('.nav'));
    const active = document.querySelector('.page.active');
    if (active) {
      active.querySelectorAll(
        'h1, h2, h3, h4, p, li, .btn, .project-card, .book-card, .timeline-item, ' +
        '.about-tl-item, .about-panel, .page-header, .stat, table, details, img'
      ).forEach(push);
    }
    return rects;
  }

  function hits(x, y, w, h, rects, pad) {
    const L = x - w / 2 - pad, R = x + w / 2 + pad;
    const T = y - h / 2 - pad, B = y + h / 2 + pad;
    return rects.some(r => !(R < r.left || L > r.right || B < r.top || T > r.bottom));
  }

  // Rejection-sample a random spot that doesn't land on any avoided rect
  function findFreeSpot(w, h, rects) {
    const W = window.innerWidth, H = window.innerHeight;
    const edgeX = w / 2 + 16, topPad = 80, botPad = 40, pad = 14;
    for (let i = 0; i < 250; i++) {
      const x = rand(edgeX, W - edgeX);
      const y = rand(topPad + h / 2, H - botPad - h / 2);
      if (!hits(x, y, w, h, rects, pad)) return { x, y };
    }
    // Fallback: drop it into whichever side margin is emptier
    return { x: Math.random() < 0.5 ? edgeX : W - edgeX, y: rand(topPad + h / 2, H - botPad - h / 2) };
  }

  // --- Create a bubble ---
  function makeBubble(group, color) {
    const size = rand(16, 60);
    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.setProperty('--bubble-color', color);
    field.appendChild(el);

    return {
      el,
      size,
      r: size / 2,
      group,                                  // index of target tag, or -1 for rogue
      x: rand(0, window.innerWidth),
      y: rand(0, window.innerHeight),
      vx: 0,
      vy: 0,
      driftPhase: Math.random(),
    };
  }

  // --- Build everything for a given page ---
  function buildPage(pageId) {
    const config = PAGE_CONFIG[pageId];

    // Tear down previous page
    bubbles.forEach(b => b.el.remove());
    tags.forEach(t => t.el.remove());
    bubbles = [];
    tags = [];
    currentPage = pageId;

    if (!config) return;   // pages without interests (e.g. detail pages) stay clean

    // On mobile the draggable tag pills crowd the screen, so we skip them
    // entirely and just drift a few colourful bubbles in the background.
    if (window.innerWidth < 768) {
      const total = bubbleCount();
      const palette = [config[0].color, config[1].color, ROGUE_COLOR];
      for (let i = 0; i < total; i++) bubbles.push(makeBubble(-1, palette[i % palette.length]));
      if (reduceMotion) bubbles.forEach(render);
      return;
    }

    // Tags spawn at random spots, but never on top of the text or any
    // important element: collect the on-screen content rects and
    // rejection-sample a clear position for each pill (its bubbles cluster
    // there too, so they stay off the text as well).
    const placed = collectAvoidRects();
    config.forEach(c => {
      const tag = makeTag(c, -9999, -9999);   // append off-screen so we can measure it
      const w = tag.el.offsetWidth, h = tag.el.offsetHeight;
      const spot = findFreeSpot(w, h, placed);
      tag.x = spot.x;
      tag.y = spot.y;
      tag.el.style.left = spot.x + 'px';
      tag.el.style.top = spot.y + 'px';
      placed.push({ left: spot.x - w / 2, right: spot.x + w / 2, top: spot.y - h / 2, bottom: spot.y + h / 2 });
      tags.push(tag);
    });

    // Bubbles: split between the two tags, plus a few rogue grey ones
    const total = bubbleCount();
    const rogue = Math.round(total * 0.3);
    const perTag = Math.round((total - rogue) / 2);

    for (let i = 0; i < perTag; i++) bubbles.push(makeBubble(0, config[0].color));
    for (let i = 0; i < perTag; i++) bubbles.push(makeBubble(1, config[1].color));
    for (let i = 0; i < rogue; i++) bubbles.push(makeBubble(-1, ROGUE_COLOR));

    if (reduceMotion) {
      // No animation: just place them statically
      bubbles.forEach(render);
    }
  }

  // --- One physics step (ported from bubble_simulation.dart) ---
  function step(dt) {
    const W = window.innerWidth, H = window.innerHeight;

    for (const b of bubbles) {
      const target = b.group >= 0 ? tags[b.group] : null;

      if (target) {
        // Steer toward the matching tag
        const dx = target.x - b.x;
        const dy = target.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.1) {
          const desX = (dx / dist) * MAX_SPEED;
          const desY = (dy / dist) * MAX_SPEED;
          let steerX = desX - b.vx;
          let steerY = desY - b.vy;
          const steerMag = Math.hypot(steerX, steerY);
          const maxSteer = ACCEL * dt;
          if (steerMag > maxSteer && steerMag > 0) {
            steerX *= maxSteer / steerMag;
            steerY *= maxSteer / steerMag;
          }
          b.vx += steerX;
          b.vy += steerY;
        }
      } else {
        // Rogue: gentle random drift
        b.driftPhase += dt * 0.5;
        if (b.driftPhase > 1.0) {
          b.driftPhase = 0;
          const a = Math.random() * 2 * Math.PI;
          b.vx += Math.cos(a) * DRIFT_SPEED * 0.5;
          b.vy += Math.sin(a) * DRIFT_SPEED * 0.5;
        }
      }

      // Drag
      const d = Math.pow(DRAG, dt);
      b.vx *= d;
      b.vy *= d;

      // Clamp speed
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) {
        b.vx = (b.vx / speed) * MAX_SPEED;
        b.vy = (b.vy / speed) * MAX_SPEED;
      }

      // Integrate
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // Collision push between bubbles
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], b = bubbles[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r + 1;
        if (dist < minDist && dist > 0) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }

    // Clamp inside the viewport
    for (const b of bubbles) {
      b.x = clamp(b.x, b.r, W - b.r);
      b.y = clamp(b.y, b.r, H - b.r);
    }
  }

  function render(b) {
    b.el.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`;
  }

  // --- Animation loop ---
  function loop(now) {
    const dt = lastTime === 0 ? 0.016 : Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    step(dt);
    for (const b of bubbles) render(b);
    rafId = requestAnimationFrame(loop);
  }

  // --- Watch for page changes via the .page.active class ---
  function watchPages() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const el = m.target;
        if (el.classList && el.classList.contains('page') && el.classList.contains('active')) {
          if (el.id !== currentPage) buildPage(el.id);
        }
      }
    });
    document.querySelectorAll('.page').forEach(p => {
      observer.observe(p, { attributes: true, attributeFilter: ['class'] });
    });

    const active = document.querySelector('.page.active');
    buildPage(active ? active.id : 'home');
  }

  // Reclamp positions on resize; rebuild if we cross the mobile breakpoint
  // (so tags get dropped/restored when the viewport flips past 768px).
  let wasMobile = window.innerWidth < 768;
  window.addEventListener('resize', () => {
    const W = window.innerWidth, H = window.innerHeight;
    const nowMobile = W < 768;
    if (nowMobile !== wasMobile) {
      wasMobile = nowMobile;
      if (currentPage) buildPage(currentPage);
      return;
    }
    tags.forEach(t => {
      t.x = clamp(t.x, 0, W);
      t.y = clamp(t.y, 60, H);
      t.el.style.left = t.x + 'px';
      t.el.style.top = t.y + 'px';
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureLayers();
    watchPages();
    if (!reduceMotion) rafId = requestAnimationFrame(loop);
  });
})();
