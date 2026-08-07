/* ============================================
   LOCKUP VISUAL · floating padlock marks on detail page
   ============================================ */

(function () {
  'use strict';

  const PAGE_ID = 'detail-lockup';
  const ICON = 'images/lockup-icon.png';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let layer = null;
  let items = [];
  let rafId = null;
  let lastTime = 0;
  let active = false;

  function count() {
    if (window.innerWidth < 600) return 5;
    if (window.innerWidth < 900) return 7;
    return 9;
  }

  function ensureLayer() {
    if (layer) return;
    layer = document.createElement('div');
    layer.className = 'lockup-visual-field';
    layer.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(layer, document.body.firstChild);
  }

  function clear() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    items.forEach((item) => item.el.remove());
    items = [];
    lastTime = 0;
    active = false;
    if (layer) layer.classList.remove('is-active');
  }

  function place() {
    clear();
    ensureLayer();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const n = count();

    for (let i = 0; i < n; i++) {
      const size = 72 + Math.random() * 140;
      const el = document.createElement('img');
      el.className = 'lockup-visual-mark';
      el.src = ICON;
      el.alt = '';
      el.width = Math.round(size);
      el.height = Math.round(size);
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.opacity = String(0.06 + Math.random() * 0.1);

      const x = (W * 0.08) + Math.random() * (W * 0.84) - size / 2;
      const y = (H * 0.12) + Math.random() * (H * 0.76) - size / 2;
      const rot = -18 + Math.random() * 36;

      el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
      layer.appendChild(el);

      items.push({
        el,
        x,
        y,
        rot,
        size,
        vx: reduceMotion ? 0 : (-8 + Math.random() * 16),
        vy: reduceMotion ? 0 : (-6 + Math.random() * 12),
        vr: reduceMotion ? 0 : (-4 + Math.random() * 8),
      });
    }

    layer.classList.add('is-active');
    active = true;
    if (!reduceMotion) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    if (!active) return;
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    const W = window.innerWidth;
    const H = window.innerHeight;

    for (const item of items) {
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.rot += item.vr * dt;

      if (item.x < -item.size) item.x = W;
      if (item.x > W) item.x = -item.size;
      if (item.y < -item.size) item.y = H;
      if (item.y > H) item.y = -item.size;

      item.el.style.transform = `translate(${item.x}px, ${item.y}px) rotate(${item.rot}deg)`;
    }

    rafId = requestAnimationFrame(tick);
  }

  function sync() {
    const page = document.getElementById(PAGE_ID);
    const on = page && page.classList.contains('active');
    if (on && !active) place();
    else if (!on && active) clear();
  }

  function watch() {
    const page = document.getElementById(PAGE_ID);
    if (!page) return;

    const observer = new MutationObserver(sync);
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
    sync();

    window.addEventListener('resize', () => {
      if (active) place();
    });
  }

  document.addEventListener('DOMContentLoaded', watch);
})();
