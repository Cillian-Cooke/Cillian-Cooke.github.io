/* ============================================
   Morphing tessellation background
   triangles → squares → hexagons → rhombi
   ============================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ACCENT = '15, 107, 107';
  const SAMPLES = 48;
  const UNIT = 68;
  const ALPHA = 0.055;

  let canvas; let ctx;
  let w = 0; let h = 0; let dpr = 1;
  let ticking = false;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
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
    draw();
  }

  function scrollT() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return clamp(window.scrollY / max, 0, 1);
  }

  function stageFromScroll(t) {
    if (reduceMotion) return { a: 'tri', b: 'tri', u: 0 };
    if (t < 0.12) return { a: 'tri', b: 'tri', u: 0 };
    if (t < 0.28) return { a: 'tri', b: 'sq', u: smoothstep(0.12, 0.28, t) };
    if (t < 0.40) return { a: 'sq', b: 'sq', u: 0 };
    if (t < 0.60) return { a: 'sq', b: 'hex', u: smoothstep(0.40, 0.60, t) };
    if (t < 0.72) return { a: 'hex', b: 'hex', u: 0 };
    if (t < 0.90) return { a: 'hex', b: 'rhomb', u: smoothstep(0.72, 0.90, t) };
    return { a: 'rhomb', b: 'rhomb', u: 0 };
  }

  function regularR(apothem, n, theta, rot) {
    const R = apothem / Math.cos(Math.PI / n);
    const a = theta - rot;
    const sector = (Math.PI * 2) / n;
    const local = ((a % sector) + sector) % sector - sector / 2;
    return R * Math.cos(Math.PI / n) / Math.cos(local);
  }

  function rhombR(halfWidth, halfHeight, theta, rot) {
    const a = theta - rot;
    const denom = Math.abs(Math.cos(a)) / halfWidth + Math.abs(Math.sin(a)) / halfHeight;
    return denom > 1e-6 ? 1 / denom : halfWidth;
  }

  function shapeRadius(kind, metric, theta) {
    if (kind === 'tri') {
      const apo = (Math.sqrt(3) / 6) * metric;
      return regularR(apo, 3, theta, Math.PI / 2);
    }
    if (kind === 'sq') {
      return regularR(metric / 2, 4, theta, Math.PI / 4);
    }
    if (kind === 'hex') {
      return regularR(metric / 2, 6, theta, Math.PI / 6);
    }
    if (kind === 'rhomb') {
      return rhombR(metric / 2, (metric * Math.sqrt(3)) / 2, theta, 0);
    }
    return metric / 2;
  }

  function morphRadius(kindA, kindB, u, metric, theta) {
    if (u <= 0) return shapeRadius(kindA, metric, theta);
    if (u >= 1) return shapeRadius(kindB, metric, theta);
    return lerp(shapeRadius(kindA, metric, theta), shapeRadius(kindB, metric, theta), u);
  }

  function cellsFor(kind, metric) {
    const cells = [];
    if (kind === 'tri') {
      const side = metric;
      const hTri = (Math.sqrt(3) / 2) * side;
      const rows = Math.ceil(h / hTri) + 3;
      const cols = Math.ceil(w / side) + 3;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x0 = col * side + (row % 2 ? side * 0.5 : 0);
          const y0 = row * hTri;
          cells.push({ x: x0 + side / 2, y: y0 + hTri / 3, flip: false });
          cells.push({ x: x0 + side / 2, y: y0 + (2 * hTri) / 3, flip: true });
        }
      }
      return cells;
    }

    if (kind === 'sq') {
      const s = metric;
      const rows = Math.ceil(h / s) + 3;
      const cols = Math.ceil(w / s) + 3;
      for (let row = -1; row < rows; row++) {
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
      const cols = Math.ceil(w / xStep) + 3;
      const rows = Math.ceil(h / yStep) + 3;
      for (let row = -1; row < rows; row++) {
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

    if (kind === 'rhomb') {
      const xStep = metric;
      const yStep = metric * Math.sqrt(3) / 2;
      const cols = Math.ceil(w / xStep) + 3;
      const rows = Math.ceil(h / yStep) + 3;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          cells.push({
            x: col * xStep + (row % 2 ? xStep / 2 : 0) + xStep / 2,
            y: row * yStep + yStep / 2,
            flip: false,
          });
        }
      }
      return cells;
    }

    return cells;
  }

  function cellsMorph(kindA, kindB, u, metric) {
    if (u <= 0.001) return cellsFor(kindA, metric);
    if (u >= 0.999) return cellsFor(kindB, metric);

    const cells = [];
    const cols = Math.ceil(w / (metric * 0.75)) + 4;
    const rows = Math.ceil(h / (metric * 0.65)) + 4;

    for (let row = -1; row < rows; row++) {
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

        const rx = col * metric + (row % 2 ? metric / 2 : 0) + metric / 2;
        const ry = row * (metric * Math.sqrt(3) / 2) + (metric * Math.sqrt(3) / 4);

        function center(kind) {
          if (kind === 'tri') return [tx, ty];
          if (kind === 'sq') return [sx, sy];
          if (kind === 'hex') return [hx, hy];
          return [rx, ry];
        }

        const [x0, y0] = center(kindA);
        const [x1, y1] = center(kindB);
        cells.push({ x: lerp(x0, x1, u), y: lerp(y0, y1, u), flip: false });
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
    if (kind === 'rhomb') {
      const halfShort = metric / 2;
      const halfLong = (metric * Math.sqrt(3)) / 2;
      return [[0, -halfLong], [halfShort, 0], [0, halfLong], [-halfShort, 0]];
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

  function drawPeak(kind, metric, alpha) {
    const cells = cellsFor(kind, metric);
    for (const c of cells) {
      if (c.x < -metric || c.y < -metric || c.x > w + metric || c.y > h + metric) continue;
      strokePoly(c.x, c.y, kind, kind, 0, metric, alpha, Boolean(c.flip));
    }
  }

  function drawMorph(kindA, kindB, u, metric, alpha) {
    const cells = cellsMorph(kindA, kindB, u, metric);
    for (const c of cells) {
      if (c.x < -metric || c.y < -metric || c.x > w + metric || c.y > h + metric) continue;
      strokePoly(c.x, c.y, kindA, kindB, u, metric, alpha, false);
    }

    if (kindA === 'tri' && u < 0.85) {
      const fade = (1 - u) * 0.55;
      const cellsTri = cellsFor('tri', metric);
      for (const c of cellsTri) {
        if (!c.flip) continue;
        if (c.x < -metric || c.y < -metric || c.x > w + metric || c.y > h + metric) continue;
        strokePoly(c.x, c.y, 'tri', kindB, u, metric, alpha * fade, true);
      }
    }
  }

  function draw() {
    if (!ctx) return;
    const st = stageFromScroll(scrollT());
    ctx.clearRect(0, 0, w, h);
    if (st.u <= 0.001) drawPeak(st.a, UNIT, ALPHA);
    else drawMorph(st.a, st.b, st.u, UNIT, ALPHA);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      draw();
      ticking = false;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureCanvas();
    resize();
    window.addEventListener('resize', resize);
    if (!reduceMotion) {
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  });
})();
