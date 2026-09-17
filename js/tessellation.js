/* ============================================
   Morphing tessellation background
   triangles → squares → hexagons
   Scroll-lagged morph + parallax drift
   ============================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ACCENT = '15, 107, 107';
  const SAMPLES = 56;
  const UNIT = 68;
  const ALPHA = 0.055;
  /** How quickly smooth values chase the scroll (lower = more lag) */
  const FOLLOW = reduceMotion ? 1 : 0.065;
  /** Background scroll factor vs content (0 = locked, 1 = same speed) */
  const PARALLAX = 0.32;

  let canvas; let ctx;
  let w = 0; let h = 0; let dpr = 1;
  let smoothT = 0;
  let smoothY = 0;
  let rafId = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smootherstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'tessellation-bg';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
  }

  function resize() {
    ensureCanvas();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function scrollMetrics() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const y = window.scrollY || 0;
    return { t: clamp(y / max, 0, 1), y };
  }

  /** Only three tilings; long soft morph bands */
  function stageFromScroll(t) {
    if (reduceMotion) return { a: 'tri', b: 'tri', u: 0 };
    // 0.00–0.14 hold triangles
    // 0.14–0.48 morph → squares
    // 0.48–0.58 hold squares
    // 0.58–0.92 morph → hexagons
    // 0.92–1.00 hold hexagons
    if (t < 0.14) return { a: 'tri', b: 'tri', u: 0 };
    if (t < 0.48) return { a: 'tri', b: 'sq', u: smootherstep(0.14, 0.48, t) };
    if (t < 0.58) return { a: 'sq', b: 'sq', u: 0 };
    if (t < 0.92) return { a: 'sq', b: 'hex', u: smootherstep(0.58, 0.92, t) };
    return { a: 'hex', b: 'hex', u: 0 };
  }

  function regularR(apothem, n, theta, rot) {
    const R = apothem / Math.cos(Math.PI / n);
    const a = theta - rot;
    const sector = (Math.PI * 2) / n;
    const local = ((a % sector) + sector) % sector - sector / 2;
    return R * Math.cos(Math.PI / n) / Math.cos(local);
  }

  function shapeRadius(kind, metric, theta) {
    if (kind === 'tri') {
      return regularR((Math.sqrt(3) / 6) * metric, 3, theta, Math.PI / 2);
    }
    if (kind === 'sq') {
      return regularR(metric / 2, 4, theta, Math.PI / 4);
    }
    if (kind === 'hex') {
      return regularR(metric / 2, 6, theta, Math.PI / 6);
    }
    return metric / 2;
  }

  function morphRadius(kindA, kindB, u, metric, theta) {
    if (u <= 0) return shapeRadius(kindA, metric, theta);
    if (u >= 1) return shapeRadius(kindB, metric, theta);
    // Ease the morph curve itself for softer mid-blend
    const e = u * u * (3 - 2 * u);
    return lerp(shapeRadius(kindA, metric, theta), shapeRadius(kindB, metric, theta), e);
  }

  function cellsFor(kind, metric, y0, y1) {
    const cells = [];
    const top = y0 - metric * 2;
    const bot = y1 + metric * 2;

    if (kind === 'tri') {
      const side = metric;
      const hTri = (Math.sqrt(3) / 2) * side;
      const rowStart = Math.floor(top / hTri) - 1;
      const rowEnd = Math.ceil(bot / hTri) + 1;
      const cols = Math.ceil(w / side) + 3;
      for (let row = rowStart; row < rowEnd; row++) {
        for (let col = -1; col < cols; col++) {
          const x0 = col * side + (row % 2 ? side * 0.5 : 0);
          const yy = row * hTri;
          cells.push({ x: x0 + side / 2, y: yy + hTri / 3, flip: false });
          cells.push({ x: x0 + side / 2, y: yy + (2 * hTri) / 3, flip: true });
        }
      }
      return cells;
    }

    if (kind === 'sq') {
      const s = metric;
      const rowStart = Math.floor(top / s) - 1;
      const rowEnd = Math.ceil(bot / s) + 1;
      const cols = Math.ceil(w / s) + 3;
      for (let row = rowStart; row < rowEnd; row++) {
        for (let col = -1; col < cols; col++) {
          cells.push({ x: col * s + s / 2, y: row * s + s / 2, flip: false });
        }
      }
      return cells;
    }

    if (kind === 'hex') {
      const R = metric / Math.sqrt(3);
      const xStep = 1.5 * R;
      const yStep = Math.sqrt(3) * R;
      const rowStart = Math.floor(top / yStep) - 1;
      const rowEnd = Math.ceil(bot / yStep) + 1;
      const cols = Math.ceil(w / xStep) + 3;
      for (let row = rowStart; row < rowEnd; row++) {
        for (let col = -1; col < cols; col++) {
          cells.push({
            x: col * xStep + R,
            y: row * yStep + yStep / 2 + (col % 2 ? yStep / 2 : 0),
            flip: false,
          });
        }
      }
      return cells;
    }

    return cells;
  }

  function cellsMorph(kindA, kindB, u, metric, y0, y1) {
    if (u <= 0.001) return cellsFor(kindA, metric, y0, y1);
    if (u >= 0.999) return cellsFor(kindB, metric, y0, y1);

    const cells = [];
    const top = y0 - metric * 2;
    const bot = y1 + metric * 2;
    const yStep = metric * 0.65;
    const rowStart = Math.floor(top / yStep) - 1;
    const rowEnd = Math.ceil(bot / yStep) + 1;
    const cols = Math.ceil(w / (metric * 0.75)) + 4;

    for (let row = rowStart; row < rowEnd; row++) {
      for (let col = -1; col < cols; col++) {
        const sx = col * metric + metric / 2;
        const sy = row * metric + metric / 2;

        const Rhex = (metric / 2) / Math.cos(Math.PI / 6);
        const xStepH = 1.5 * Rhex;
        const yStepH = Math.sqrt(3) * Rhex;
        const hx = col * xStepH + Rhex;
        const hy = row * yStepH + yStepH / 2 + (col % 2 ? yStepH / 2 : 0);

        const side = metric;
        const hTri = (Math.sqrt(3) / 2) * side;
        const tx = col * side + (row % 2 ? side * 0.5 : 0) + side / 2;
        const ty = row * hTri + hTri / 3;

        function center(kind) {
          if (kind === 'tri') return [tx, ty];
          if (kind === 'sq') return [sx, sy];
          return [hx, hy];
        }

        const [x0, yA] = center(kindA);
        const [x1, yB] = center(kindB);
        cells.push({ x: lerp(x0, x1, u), y: lerp(yA, yB, u), flip: false });
      }
    }
    return cells;
  }

  function peakVertices(kind, metric, flip) {
    if (kind === 'tri') {
      const side = metric;
      const hTri = (Math.sqrt(3) / 2) * side;
      return flip
        ? [[0, (2 / 3) * hTri], [-side / 2, -(1 / 3) * hTri], [side / 2, -(1 / 3) * hTri]]
        : [[0, -(2 / 3) * hTri], [-side / 2, (1 / 3) * hTri], [side / 2, (1 / 3) * hTri]];
    }
    if (kind === 'sq') {
      const half = metric / 2;
      return [[-half, -half], [half, -half], [half, half], [-half, half]];
    }
    if (kind === 'hex') {
      const R = metric / Math.sqrt(3);
      const verts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i);
        verts.push([R * Math.cos(a), R * Math.sin(a)]);
      }
      return verts;
    }
    return [];
  }

  function strokePoly(cx, cy, kindA, kindB, u, metric, alpha, flip) {
    ctx.beginPath();

    if (u < 0.001 && kindA === kindB) {
      const verts = peakVertices(kindA, metric, flip);
      verts.forEach(([px, py], i) => {
        const x = cx + px;
        const y = cy + py;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    } else {
      for (let i = 0; i <= SAMPLES; i++) {
        let theta = (i / SAMPLES) * Math.PI * 2;
        if (flip) theta += Math.PI;
        const r = morphRadius(kindA, kindB, u, metric, theta);
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    ctx.strokeStyle = `rgba(${ACCENT}, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawFrame(t, parallaxY) {
    if (!ctx) return;
    const st = stageFromScroll(t);
    const metric = UNIT;
    // Pattern drifts slower than page content
    const offsetY = -parallaxY * PARALLAX;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(0, offsetY);

    const y0 = -offsetY;
    const y1 = -offsetY + h;

    if (st.u <= 0.001) {
      const cells = cellsFor(st.a, metric, y0, y1);
      for (const c of cells) {
        if (c.x < -metric || c.x > w + metric) continue;
        strokePoly(c.x, c.y, st.a, st.a, 0, metric, ALPHA, Boolean(c.flip));
      }
    } else {
      const cells = cellsMorph(st.a, st.b, st.u, metric, y0, y1);
      for (const c of cells) {
        if (c.x < -metric || c.x > w + metric) continue;
        strokePoly(c.x, c.y, st.a, st.b, st.u, metric, ALPHA, false);
      }
      if (st.a === 'tri' && st.u < 0.85) {
        const fade = (1 - st.u) * 0.55;
        const cellsTri = cellsFor('tri', metric, y0, y1);
        for (const c of cellsTri) {
          if (!c.flip) continue;
          if (c.x < -metric || c.x > w + metric) continue;
          strokePoly(c.x, c.y, 'tri', st.b, st.u, metric, ALPHA * fade, true);
        }
      }
    }

    ctx.restore();
  }

  function tick() {
    const { t, y } = scrollMetrics();
    smoothT += (t - smoothT) * FOLLOW;
    smoothY += (y - smoothY) * FOLLOW;

    // Snap when very close to avoid endless micro-updates
    if (Math.abs(t - smoothT) < 0.00015) smoothT = t;
    if (Math.abs(y - smoothY) < 0.15) smoothY = y;

    drawFrame(smoothT, smoothY);
    rafId = requestAnimationFrame(tick);
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureCanvas();
    resize();
    const m = scrollMetrics();
    smoothT = m.t;
    smoothY = m.y;
    window.addEventListener('resize', resize);
    rafId = requestAnimationFrame(tick);
  });

  window.addEventListener('pagehide', () => {
    if (rafId) cancelAnimationFrame(rafId);
  });
})();
