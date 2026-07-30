/* ============================================
   INTEREST BUBBLES · Atlas-style (project details)
   ============================================ */

(function () {
  'use strict';

  /* Bubbles + interest tags only on Atlas detail */
  const PAGE_CONFIG = {
    'detail-atlas': [
      { name: 'Proximity', color: '#0f6b6b' },
      { name: 'Map', color: '#e8913a' },
    ],
  };

  const ROGUE_COLOR = '#9e9e9e';
  const MAX_SPEED = 160;
  const ACCEL = 300;
  const DRAG = 0.9;
  const DRIFT_SPEED = 15;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let field, tagLayer;
  let bubbles = [];
  let tags = [];
  let lastTime = 0;
  let rafId = null;
  let currentPage = null;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function bubbleCount() {
    if (window.innerWidth < 600) return 11;
    if (window.innerWidth < 900) return 16;
    return 20;
  }

  function ensureLayers() {
    if (field) return;
    field = document.createElement('div');
    field.className = 'bubble-field';
    field.setAttribute('aria-hidden', 'true');

    tagLayer = document.createElement('div');
    tagLayer.className = 'tag-layer';
    tagLayer.setAttribute('aria-hidden', 'true');

    document.body.insertBefore(field, document.body.firstChild);
    document.body.appendChild(tagLayer);
  }

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
    const active = document.querySelector('.panel.active');
    if (active) {
      active.querySelectorAll(
        'h1, h2, h3, p, li, .btn, .detail-body, .page-header, .detail-header, img, .detail-back'
      ).forEach(push);
    }
    return rects;
  }

  function hits(x, y, w, h, rects, pad) {
    const L = x - w / 2 - pad, R = x + w / 2 + pad;
    const T = y - h / 2 - pad, B = y + h / 2 + pad;
    return rects.some((r) => !(R < r.left || L > r.right || B < r.top || T > r.bottom));
  }

  function findFreeSpot(w, h, rects) {
    const W = window.innerWidth, H = window.innerHeight;
    const edgeX = w / 2 + 16, topPad = 80, botPad = 40, pad = 14;
    for (let i = 0; i < 250; i++) {
      const x = rand(edgeX, W - edgeX);
      const y = rand(topPad + h / 2, H - botPad - h / 2);
      if (!hits(x, y, w, h, rects, pad)) return { x, y };
    }
    return { x: Math.random() < 0.5 ? edgeX : W - edgeX, y: rand(topPad + h / 2, H - botPad - h / 2) };
  }

  function makeBubble(group, color) {
    const size = rand(16, 60);
    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.setProperty('--bubble-color', color);
    field.appendChild(el);

    return {
      el, size, r: size / 2, group,
      x: rand(0, window.innerWidth),
      y: rand(0, window.innerHeight),
      vx: 0, vy: 0, driftPhase: Math.random(),
    };
  }

  function buildPage(pageId) {
    const config = PAGE_CONFIG[pageId];

    bubbles.forEach((b) => b.el.remove());
    tags.forEach((t) => t.el.remove());
    bubbles = [];
    tags = [];
    currentPage = pageId;

    if (!config) return;

    if (window.innerWidth < 768) {
      const total = bubbleCount();
      const palette = [config[0].color, config[1].color, ROGUE_COLOR];
      for (let i = 0; i < total; i++) bubbles.push(makeBubble(-1, palette[i % palette.length]));
      if (reduceMotion) bubbles.forEach(render);
      return;
    }

    const placed = collectAvoidRects();
    config.forEach((c) => {
      const tag = makeTag(c, -9999, -9999);
      const w = tag.el.offsetWidth, h = tag.el.offsetHeight;
      const spot = findFreeSpot(w, h, placed);
      tag.x = spot.x;
      tag.y = spot.y;
      tag.el.style.left = spot.x + 'px';
      tag.el.style.top = spot.y + 'px';
      placed.push({ left: spot.x - w / 2, right: spot.x + w / 2, top: spot.y - h / 2, bottom: spot.y + h / 2 });
      tags.push(tag);
    });

    const total = bubbleCount();
    const rogue = Math.round(total * 0.3);
    const perTag = Math.round((total - rogue) / 2);

    for (let i = 0; i < perTag; i++) bubbles.push(makeBubble(0, config[0].color));
    for (let i = 0; i < perTag; i++) bubbles.push(makeBubble(1, config[1].color));
    for (let i = 0; i < rogue; i++) bubbles.push(makeBubble(-1, ROGUE_COLOR));

    if (reduceMotion) bubbles.forEach(render);
  }

  function step(dt) {
    const W = window.innerWidth, H = window.innerHeight;

    for (const b of bubbles) {
      const target = b.group >= 0 ? tags[b.group] : null;

      if (target) {
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
        b.driftPhase += dt * 0.5;
        if (b.driftPhase > 1.0) {
          b.driftPhase = 0;
          const a = Math.random() * 2 * Math.PI;
          b.vx += Math.cos(a) * DRIFT_SPEED * 0.5;
          b.vy += Math.sin(a) * DRIFT_SPEED * 0.5;
        }
      }

      const d = Math.pow(DRAG, dt);
      b.vx *= d;
      b.vy *= d;

      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) {
        b.vx = (b.vx / speed) * MAX_SPEED;
        b.vy = (b.vy / speed) * MAX_SPEED;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

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

    for (const b of bubbles) {
      b.x = clamp(b.x, b.r, W - b.r);
      b.y = clamp(b.y, b.r, H - b.r);
    }
  }

  function render(b) {
    b.el.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`;
  }

  function loop(now) {
    const dt = lastTime === 0 ? 0.016 : Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    step(dt);
    for (const b of bubbles) render(b);
    rafId = requestAnimationFrame(loop);
  }

  function watchPages() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const el = m.target;
        if (el.classList && el.classList.contains('panel') && el.classList.contains('active')) {
          if (el.id !== currentPage) buildPage(el.id);
        }
      }
    });
    document.querySelectorAll('.panel').forEach((p) => {
      observer.observe(p, { attributes: true, attributeFilter: ['class'] });
    });

    const active = document.querySelector('.panel.active');
    buildPage(active ? active.id : null);
  }

  let wasMobile = window.innerWidth < 768;
  window.addEventListener('resize', () => {
    const W = window.innerWidth, H = window.innerHeight;
    const nowMobile = W < 768;
    if (nowMobile !== wasMobile) {
      wasMobile = nowMobile;
      if (currentPage) buildPage(currentPage);
      return;
    }
    tags.forEach((t) => {
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
