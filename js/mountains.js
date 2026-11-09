/* ============================================
   Bird's-eye topographic contour background
   Vector contours · fixed while scrolling · pans/zooms on place change
   ============================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ACCENT = '15, 107, 107';
  const CAM_FOLLOW = reduceMotion ? 1 : 0.12;
  const IMPULSE_MS = 720;
  const INDEX_EVERY = 5;
  const STORAGE_KEY = 'topo:cam';

  const WORLD = { minX: 0, minY: 0, maxX: 6400, maxY: 4800 };
  const WORLD_W = WORLD.maxX - WORLD.minX;
  const WORLD_H = WORLD.maxY - WORLD.minY;

  const PLACES = {
    research:        { x: 1400, y: 1200, zoom: 2.15 },
    papers:          { x: 1580, y: 1280, zoom: 2.05 },
    videos:          { x: 1750, y: 1450, zoom: 2.0 },
    'videos-one':    { x: 1880, y: 1580, zoom: 0.85 },
    'videos-two':    { x: 1980, y: 1500, zoom: 0.85 },
    'videos-detail': { x: 1930, y: 1540, zoom: 0.85 },
    portfolio:       { x: 4600, y: 3200, zoom: 2.05 },
    opinions:        { x: 4350, y: 3550, zoom: 0.85 },

    essay:           { x: 4280, y: 3620, zoom: 0.85 },
    books:           { x: 4850, y: 3600, zoom: 0.85 },
    podcasts:        { x: 5000, y: 3480, zoom: 0.85 },
    photos:          { x: 5150, y: 3320, zoom: 0.85 },
    'detail-lockup': { x: 4450, y: 2950, zoom: 0.85 },
    'detail-quill':  { x: 4900, y: 3020, zoom: 0.85 },
    'detail-fiveside':{ x: 5100, y: 3100, zoom: 0.85 },
    'detail-atlas':  { x: 4700, y: 2880, zoom: 0.85 },
  };

  const HILLS = [
    [1400, 1200, 320, 1.05],
    [1600, 980, 180, 0.7],
    [1180, 1380, 170, 0.65],
    [1750, 1450, 240, 0.9],
    [1930, 1540, 140, 0.7],
    [2100, 1100, 200, 0.55],
    [900, 1600, 220, 0.55],
    [2500, 900, 260, 0.65],
    [2800, 1500, 200, 0.5],
    [3200, 2100, 340, 0.8],
    [3700, 2600, 260, 0.7],
    [4000, 2900, 190, 0.55],
    [4600, 3200, 300, 1.0],
    [4450, 3350, 150, 0.6],
    [4200, 3700, 190, 0.9],
    [4350, 3550, 165, 0.8],
    [4850, 3600, 175, 0.75],
    [5000, 3480, 155, 0.7],
    [5150, 3320, 165, 0.65],
    [4450, 2950, 155, 0.85],
    [4700, 2880, 145, 0.8],
    [4900, 3020, 160, 0.75],
    [5600, 2200, 280, 0.55],
    [700, 2800, 300, 0.5],
    [5800, 4200, 340, 0.6],
    [3000, 3800, 260, 0.45],
  ];

  let root;
  let canvas;
  let ctx;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let rafId = 0;
  let push = 0;
  let impulseFrom = 0;
  let placeId = 'research';
  let target = { x: 1400, y: 1200, zoom: 2.15 };
  let cam = { x: 1400, y: 1200, zoom: 2.15 };
  /** @type {{ path: Path2D, index: boolean }[]} */
  let layers = [];
  let ready = false;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function easeOutCubic(t) {
    const u = 1 - t;
    return 1 - u * u * u;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function hash2(ix, iy) {
    const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function noise2(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0);
    const b = hash2(x0 + 1, y0);
    const c = hash2(x0, y0 + 1);
    const d = hash2(x0 + 1, y0 + 1);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  }

  function fbm2(x, y, octaves) {
    let v = 0;
    let a = 0.5;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += a * noise2(x * f, y * f);
      norm += a;
      a *= 0.5;
      f *= 2.03;
    }
    return v / norm;
  }

  function hill(x, y, cx, cy, sigma, amp) {
    const dx = x - cx;
    const dy = y - cy;
    return amp * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  }

  function heightAt(wx, wy) {
    let z = 0;
    for (let i = 0; i < HILLS.length; i++) {
      const d = HILLS[i];
      z += hill(wx, wy, d[0], d[1], d[2], d[3]);
    }
    z += (fbm2(wx / 480, wy / 480, 3) - 0.45) * 0.35;
    return Math.max(0, z);
  }

  function mix(a, b, va, vb, level) {
    const d = vb - va;
    const t = d === 0 ? 0.5 : (level - va) / d;
    return a + (b - a) * t;
  }

  function placeFromRoute() {
    const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
    const hash = location.hash.slice(1);
    if (path.includes('/essays/')) return 'essay';
    if (path.includes('/videos/placeholder-one')) return 'videos-one';
    if (path.includes('/videos/placeholder-two')) return 'videos-two';
    if (path === '/papers') return 'papers';
    if (path === '/videos') return 'videos';
    if (path.includes('/videos/')) return 'videos-detail';
    if (path.includes('/portfolio')) {
      if (hash && PLACES[hash]) return hash;
      return 'portfolio';
    }
    return 'research';
  }

  function placeFromNavigate(detail) {
    const id = (detail && (detail.to || detail.id)) || '';
    if (!id || id === 'home' || id === 'projects' || id === 'about' || id === 'cv') {
      return 'portfolio';
    }
    if (PLACES[id]) return id;
    return placeFromRoute();
  }

  function persistCam() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        x: cam.x,
        y: cam.y,
        zoom: cam.zoom,
        place: placeId,
        t: Date.now(),
      }));
    } catch (_) { /* private mode */ }
  }

  function restoreCam() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.x !== 'number') return null;
      if (data.t && Date.now() - data.t > 1000 * 60 * 60 * 6) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function ensureDom() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'mountains-bg';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    root.appendChild(canvas);
    document.body.insertBefore(root, document.body.firstChild);
    ctx = canvas.getContext('2d', { alpha: true });
  }

  /**
   * Build contour geometry once as Path2D in world coordinates.
   * Painted with a camera transform so zoom stays sharp (true vectors).
   */
  function bakeVectors() {
    const mobile = window.innerWidth < 720;
    const step = mobile ? 28 : 22;
    const cols = Math.ceil(WORLD_W / step) + 1;
    const rows = Math.ceil(WORLD_H / step) + 1;
    const levelCount = mobile ? 18 : 24;
    const levels = [];
    for (let i = 1; i <= levelCount; i++) levels.push(i / (levelCount + 1));

    const grid = new Array(rows);
    for (let j = 0; j < rows; j++) {
      const row = new Array(cols);
      const wy = WORLD.minY + j * step;
      for (let i = 0; i < cols; i++) {
        row[i] = heightAt(WORLD.minX + i * step, wy);
      }
      grid[j] = row;
    }

    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const v = grid[j][i];
        if (v < minZ) minZ = v;
        if (v > maxZ) maxZ = v;
      }
    }
    const range = Math.max(1e-6, maxZ - minZ);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        grid[j][i] = (grid[j][i] - minZ) / range;
      }
    }

    layers = [];
    for (let n = 0; n < levels.length; n++) {
      const level = levels[n];
      const path = new Path2D();
      const isIndex = (n + 1) % INDEX_EVERY === 0;

      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const x0 = WORLD.minX + i * step;
          const y0 = WORLD.minY + j * step;
          const x1 = x0 + step;
          const y1 = y0 + step;
          const tl = grid[j][i];
          const tr = grid[j][i + 1];
          const br = grid[j + 1][i + 1];
          const bl = grid[j + 1][i];
          let mask = 0;
          if (tl >= level) mask |= 8;
          if (tr >= level) mask |= 4;
          if (br >= level) mask |= 2;
          if (bl >= level) mask |= 1;
          if (mask === 0 || mask === 15) continue;

          const top = [mix(x0, x1, tl, tr, level), y0];
          const right = [x1, mix(y0, y1, tr, br, level)];
          const bottom = [mix(x0, x1, bl, br, level), y1];
          const left = [x0, mix(y0, y1, tl, bl, level)];
          const segs = [];

          if (mask === 1 || mask === 14) segs.push(left, bottom);
          else if (mask === 2 || mask === 13) segs.push(bottom, right);
          else if (mask === 3 || mask === 12) segs.push(left, right);
          else if (mask === 4 || mask === 11) segs.push(top, right);
          else if (mask === 6 || mask === 9) segs.push(top, bottom);
          else if (mask === 7 || mask === 8) segs.push(left, top);
          else {
            const center = (tl + tr + br + bl) / 4;
            const split = center >= level;
            if (mask === 5) {
              if (split) segs.push(left, top, bottom, right);
              else segs.push(left, bottom, top, right);
            } else if (split) {
              segs.push(top, right, left, bottom);
            } else {
              segs.push(top, left, bottom, right);
            }
          }

          for (let k = 0; k < segs.length; k += 2) {
            path.moveTo(segs[k][0], segs[k][1]);
            path.lineTo(segs[k + 1][0], segs[k + 1][1]);
          }
        }
      }

      layers.push({ path: path, index: isIndex });
    }

    ready = true;
  }

  function resizeView() {
    ensureDom();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  /** Stroke world-space vectors through the current camera — always crisp */
  function paint() {
    if (!ctx || !ready) return;

    const z = cam.zoom;
    const maxViewW = WORLD_W * 0.42;
    const maxViewH = WORLD_H * 0.42;
    const viewWorldW = Math.min(w * z, maxViewW);
    const viewWorldH = Math.min(h * z, maxViewH);
    const scale = w / viewWorldW;
    const scaleY = h / viewWorldH;
    // Uniform scale from X so strokes stay even; slight letterbox via Y center
    const s = Math.min(scale, scaleY);

    const cx = cam.x;
    const cy = cam.y;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const sink = push * 0.08;
    ctx.save();
    if (sink > 0.001) {
      ctx.translate(w / 2, h * 0.55);
      ctx.scale(1 + sink * 0.85, 1 - sink * 1.65);
      ctx.translate(-w / 2, -h * 0.55);
    }

    // Screen = (world - cam) * s + viewport center
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      // Line width in world units so it stays ~1px on screen at any zoom
      ctx.lineWidth = (layer.index ? 1.35 : 0.9) / s;
      ctx.strokeStyle = layer.index
        ? `rgba(${ACCENT}, 0.16)`
        : `rgba(${ACCENT}, 0.07)`;
      ctx.stroke(layer.path);
    }

    ctx.restore();
  }

  function camSettled() {
    return (
      Math.abs(target.x - cam.x) < 0.4 &&
      Math.abs(target.y - cam.y) < 0.4 &&
      Math.abs(target.zoom - cam.zoom) < 0.003
    );
  }

  function tick(now) {
    rafId = 0;
    let alive = false;

    if (!camSettled()) {
      cam.x += (target.x - cam.x) * CAM_FOLLOW;
      cam.y += (target.y - cam.y) * CAM_FOLLOW;
      cam.zoom += (target.zoom - cam.zoom) * CAM_FOLLOW;
      if (Math.abs(target.x - cam.x) < 0.4) cam.x = target.x;
      if (Math.abs(target.y - cam.y) < 0.4) cam.y = target.y;
      if (Math.abs(target.zoom - cam.zoom) < 0.003) cam.zoom = target.zoom;
      alive = true;
    }

    if (impulseFrom > 0) {
      const u = clamp((now - impulseFrom) / IMPULSE_MS, 0, 1);
      if (u < 0.4) push = easeOutCubic(u / 0.4);
      else push = 1 - easeInOut((u - 0.4) / 0.6);
      if (u >= 1) {
        push = 0;
        impulseFrom = 0;
      } else {
        alive = true;
      }
    }

    paint();
    if (alive) rafId = requestAnimationFrame(tick);
  }

  function kick() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function triggerPushDown() {
    if (reduceMotion) return;
    impulseFrom = performance.now();
    push = 0;
    kick();
  }

  function setPlace(id, { pushDown = true, animate = true } = {}) {
    if (!id || !PLACES[id]) id = placeFromRoute();
    const next = PLACES[id] || PLACES.research;
    placeId = PLACES[id] ? id : 'research';
    target = { x: next.x, y: next.y, zoom: next.zoom };

    if (!animate || reduceMotion) {
      cam.x = target.x;
      cam.y = target.y;
      cam.zoom = target.zoom;
      paint();
    } else {
      kick();
    }

    if (pushDown) triggerPushDown();
  }

  function onNavigate(e) {
    setPlace(placeFromNavigate(e.detail || {}), {
      pushDown: true,
      animate: !reduceMotion,
    });
  }

  function start() {
    ensureDom();
    resizeView();
    bakeVectors();

    const route = placeFromRoute();
    const prev = restoreCam();
    const next = PLACES[route] || PLACES.research;
    placeId = route;
    target = { x: next.x, y: next.y, zoom: next.zoom };

    if (prev && !reduceMotion) {
      cam.x = prev.x;
      cam.y = prev.y;
      cam.zoom = typeof prev.zoom === 'number' ? prev.zoom : target.zoom;
    } else {
      cam.x = target.x;
      cam.y = target.y;
      cam.zoom = target.zoom;
    }

    paint();

    const traveled = prev && (
      Math.hypot(prev.x - target.x, prev.y - target.y) > 40 ||
      Math.abs((prev.zoom || target.zoom) - target.zoom) > 0.08
    );
    if (!reduceMotion) {
      if (prev && traveled) kick();
      triggerPushDown();
    }

    // No scroll listener — background stays still while the page moves
    window.addEventListener('resize', () => {
      resizeView();
      paint();
    });
    window.addEventListener('site:navigate', onNavigate);
    window.addEventListener('hashchange', () => {
      setPlace(placeFromRoute(), { pushDown: true, animate: !reduceMotion });
    });
    window.addEventListener('pagehide', persistCam);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistCam();
    });
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      setPlace(placeFromRoute(), { pushDown: true, animate: false });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.addEventListener('pagehide', () => {
    if (rafId) cancelAnimationFrame(rafId);
  });
})();
