#!/usr/bin/env node
/**
 * Builds playful logo Lotties from the hugging dual-C mark.
 * Run: node scripts/build-logo-lotties.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'lottie');
mkdirSync(OUT, { recursive: true });

const INK = [0.071, 0.094, 0.106, 1]; // #12181b
const FR = 60;

// --- helpers ---
const ease = [0.22, 1, 0.36, 1, 1, 1]; // approx ease-out-ish for spatial; use for temporal
const easeIO = [0.42, 0, 0.58, 1, 1, 1];

function kf(t, v, easing = easeIO) {
  const o = { t, s: Array.isArray(v) ? v : [v] };
  if (easing) {
    o.i = { x: [easing[0]], y: [easing[1]] };
    o.o = { x: [easing[2]], y: [easing[3]] };
  }
  return o;
}

function anim(keys, multi = false) {
  if (keys.length === 1) {
    return { a: 0, k: keys[0].s.length === 1 && !multi ? keys[0].s[0] : keys[0].s };
  }
  return { a: 1, k: keys };
}

/** Convert cubic segments [{p,c1,c2,p2},...] into Lottie path */
function cubicsToPath(segs) {
  const v = [];
  const i = [];
  const o = [];
  segs.forEach((s, idx) => {
    if (idx === 0) {
      v.push([s.p0[0], s.p0[1]]);
      i.push([0, 0]);
      o.push([s.c1[0] - s.p0[0], s.c1[1] - s.p0[1]]);
    }
    v.push([s.p1[0], s.p1[1]]);
    i.push([s.c2[0] - s.p1[0], s.c2[1] - s.p1[1]]);
    o.push([0, 0]);
    if (idx < segs.length - 1) {
      // next segment will overwrite last o when we process continuity —
      // rebuild properly below
    }
  });
  // Rebuild with correct out-tangents for intermediate points
  const vv = [[segs[0].p0[0], segs[0].p0[1]]];
  const ii = [[0, 0]];
  const oo = [[segs[0].c1[0] - segs[0].p0[0], segs[0].c1[1] - segs[0].p0[1]]];
  for (let n = 0; n < segs.length; n++) {
    const s = segs[n];
    vv.push([s.p1[0], s.p1[1]]);
    ii.push([s.c2[0] - s.p1[0], s.c2[1] - s.p1[1]]);
    if (n < segs.length - 1) {
      const next = segs[n + 1];
      oo.push([next.c1[0] - s.p1[0], next.c1[1] - s.p1[1]]);
    } else {
      oo.push([0, 0]);
    }
  }
  return { c: false, v: vv, i: ii, o: oo };
}

/** Approximate elliptical arc as cubics (SVG a). */
function arcToCubics(x1, y1, rx, ry, large, sweep, x2, y2) {
  // Simplified: open C from (x1,y1) to (x2,y2) with rx,ry — for our known paths
  // Use kappa ellipse quarter approximations along the long arc (large=1, sweep=0)
  const cx = x1;
  const cy = (y1 + y2) / 2;
  // For path M94 82 a20 22 0 1 0 0 36 → center ~ (94,100), go the long way (right side open = left-heavy arc? sweep=0)
  // Visual open C opening to the right: arc goes left side
  // large-arc=1 from top to bottom → almost full ellipse missing a gap on the right
  const k = 0.5522847498;
  // Build from angle -90° to +90° going the long way via 180° (left): angles π/2 → π → -π/2 with sweep 0
  // Points on ellipse: top (cx, cy-ry)=(94,78) wait start is (94,82) slightly inset
  // Use exact start/end and three cubics through west
  const top = [x1, y1];
  const bot = [x2, y2];
  const left = [cx - rx, cy];
  const farLeftCtrl = rx * k;
  const farVertCtrl = ry * k;
  // top → left (going westward / CCW or CW based on sweep=0)
  // sweep=0 = clockwise in SVG y-down... actually in SVG, sweep=1 is positive angle (CW in y-down coords? Spec: sweep-flag 1 = clockwise)
  // large=1 sweep=0 = counterclockwise long arc in standard math with y-down = going right? 
  // Empirically our CSS logo opens C to the right, so the stroke is on the LEFT of the gap.
  // So path goes top → left → bottom.
  return [
    {
      p0: top,
      c1: [top[0] - farLeftCtrl, top[1]],
      c2: [left[0], left[1] - farVertCtrl],
      p1: left,
    },
    {
      p0: left,
      c1: [left[0], left[1] + farVertCtrl],
      c2: [bot[0] - farLeftCtrl, bot[1]],
      p1: bot,
    },
  ];
}

// Outer arc 1 (absolute cubics)
const OUTER_A = cubicsToPath([
  { p0: [128, 62], c1: [100, 44], c2: [60, 54], p1: [50, 90] },
  { p0: [50, 90], c1: [40, 126], c2: [68, 162], p1: [104, 168] },
]);
// Outer arc 2
const OUTER_B = cubicsToPath([
  { p0: [72, 138], c1: [100, 156], c2: [140, 146], p1: [150, 110] },
  { p0: [150, 110], c1: [160, 74], c2: [132, 38], p1: [96, 32] },
]);
// Inner Cs
const INNER_L = cubicsToPath(arcToCubics(94, 82, 20, 22, 1, 0, 94, 118));
const INNER_R = cubicsToPath(arcToCubics(134, 82, 20, 22, 1, 0, 134, 118));

function strokeGroup(pathData, width = 6) {
  return {
    ty: 'gr',
    nm: 'Stroke Group',
    it: [
      {
        ty: 'sh',
        nm: 'Path',
        ks: { a: 0, k: pathData },
      },
      {
        ty: 'st',
        nm: 'Stroke',
        c: { a: 0, k: INK },
        o: { a: 0, k: 100 },
        w: { a: 0, k: width },
        lc: 2,
        lj: 2,
        ml: 4,
        d: [],
      },
      {
        ty: 'tm',
        nm: 'Trim Paths',
        s: { a: 0, k: 0 },
        e: { a: 1, k: [kf(0, 0), kf(45, 100, ease)] },
        o: { a: 0, k: 0 },
        m: 1,
      },
      {
        ty: 'tr',
        nm: 'Transform',
        p: { a: 0, k: [0, 0] },
        a: { a: 0, k: [0, 0] },
        s: { a: 0, k: [100, 100] },
        r: { a: 0, k: 0 },
        o: { a: 0, k: 100 },
        sk: { a: 0, k: 0 },
        sa: { a: 0, k: 0 },
      },
    ],
  };
}

function shapeLayer({ name, ind, path, trimStart = 0, trimEnd = 45, width = 6, ip = 0, op = 240, parent = undefined, transform = {} }) {
  const group = strokeGroup(path, width);
  // customize trim timing
  const tm = group.it.find((x) => x.ty === 'tm');
  tm.e = {
    a: 1,
    k: [kf(trimStart, 0), kf(trimEnd, 100, ease)],
  };

  const p = transform.p || { a: 0, k: [0, 0] };
  const s = transform.s || { a: 0, k: [100, 100] };
  const r = transform.r || { a: 0, k: 0 };
  const o = transform.o || { a: 0, k: 100 };

  const layer = {
    ddd: 0,
    ind,
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o,
      r,
      p: p.a !== undefined ? p : { a: 0, k: p },
      a: { a: 0, k: [0, 0, 0] },
      s: s.a !== undefined ? s : { a: 0, k: [...(Array.isArray(s.k) ? s.k : s), 100].slice(0, 3) },
    },
    ao: 0,
    shapes: [group],
    ip,
    op,
    st: 0,
    bm: 0,
  };
  // Fix scale format
  if (!s.a) {
    const sk = Array.isArray(s) ? s : s.k || [100, 100];
    layer.ks.s = { a: 0, k: [sk[0], sk[1], 100] };
  } else {
    layer.ks.s = s;
  }
  if (!p.a && Array.isArray(p)) {
    layer.ks.p = { a: 0, k: [p[0], p[1], 0] };
  } else if (!p.a && p.k && !Array.isArray(p.k[0])) {
    layer.ks.p = { a: 0, k: [p.k[0], p.k[1], 0] };
  }
  if (parent) layer.parent = parent;
  return layer;
}

function textLayer({ name, ind, text, size, pos, ip, op, delayAppear = 0 }) {
  const start = delayAppear;
  return {
    ddd: 0,
    ind,
    ty: 5,
    nm: name,
    sr: 1,
    ks: {
      o: {
        a: 1,
        k: [
          kf(start, 0),
          kf(start + 12, 100, ease),
        ],
      },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [pos[0], pos[1], 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: {
        a: 1,
        k: [
          { ...kf(start, [88, 88, 100]), i: { x: [0.22], y: [1] }, o: { x: [0.36], y: [1] } },
          kf(start + 14, [100, 100, 100], ease),
        ],
      },
    },
    ao: 0,
    t: {
      d: {
        k: [
          {
            s: {
              s: size,
              f: 'Syne',
              t: text,
              j: 0,
              tr: 0,
              lh: size * 1.05,
              ls: 0,
              fc: [INK[0], INK[1], INK[2]],
            },
            t: 0,
          },
        ],
      },
      p: {},
      m: { g: 1, a: { a: 0, k: [0, 0] } },
      a: [],
    },
    ip,
    op,
    st: 0,
    bm: 0,
  };
}

function wrapAnim(w, h, nm, op, layers) {
  return {
    v: '5.7.4',
    fr: FR,
    ip: 0,
    op,
    w,
    h,
    nm,
    ddd: 0,
    assets: [],
    fonts: {
      list: [
        {
          fName: 'Syne',
          fFamily: 'Syne',
          fStyle: 'Bold',
          ascent: 75,
        },
      ],
    },
    layers: layers.sort((a, b) => b.ind - a.ind),
  };
}

// Offset path vertices by (dx,dy)
function offsetPath(path, dx, dy) {
  return {
    c: path.c,
    v: path.v.map(([x, y]) => [x + dx, y + dy]),
    i: path.i,
    o: path.o,
  };
}

function scalePath(path, cx, cy, factor) {
  return {
    c: path.c,
    v: path.v.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]),
    i: path.i.map(([x, y]) => [x * factor, y * factor]),
    o: path.o.map(([x, y]) => [x * factor, y * factor]),
  };
}

// --- logo.json: 400x400, draw + hug squeeze loop ---
function buildLogo() {
  const W = 400;
  const H = 400;
  const op = 240; // 4s
  // Scale paths from 200 viewBox to sit in center of 400 with padding
  const scale = 1.55;
  const ox = (W - 200 * scale) / 2;
  const oy = (H - 200 * scale) / 2;
  const map = (p) =>
    offsetPath(
      {
        c: p.c,
        v: p.v.map(([x, y]) => [x * scale, y * scale]),
        i: p.i.map(([x, y]) => [x * scale, y * scale]),
        o: p.o.map(([x, y]) => [x * scale, y * scale]),
      },
      ox,
      oy
    );

  const cx = W / 2;
  const cy = H / 2;

  // Parent null for squeeze
  const nullLayer = {
    ddd: 0,
    ind: 5,
    ty: 3,
    nm: 'Hug Root',
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [cx, cy, 0] },
      a: { a: 0, k: [cx, cy, 0] },
      s: {
        a: 1,
        k: [
          kf(70, [100, 100, 100]),
          kf(100, [96, 96, 100], easeIO),
          kf(130, [100, 100, 100], easeIO),
          kf(160, [97, 97, 100], easeIO),
          kf(200, [100, 100, 100], easeIO),
          kf(240, [100, 100, 100]),
        ],
      },
    },
    ao: 0,
    ip: 0,
    op,
    st: 0,
    bm: 0,
  };

  const mk = (name, ind, path, t0, t1) => {
    const layer = shapeLayer({
      name,
      ind,
      path: map(path),
      trimStart: t0,
      trimEnd: t1,
      width: 7,
      op,
    });
    // Parent to hug root — positions are absolute so instead apply scale on each via ks after draw
    layer.ks.s = {
      a: 1,
      k: [
        kf(70, [100, 100, 100]),
        kf(100, [96.5, 96.5, 100], easeIO),
        kf(130, [100, 100, 100], easeIO),
        kf(160, [97.5, 97.5, 100], easeIO),
        kf(200, [100, 100, 100], easeIO),
        kf(240, [100, 100, 100]),
      ],
    };
    // Anchor at center for squeeze feel
    layer.ks.a = { a: 0, k: [cx, cy, 0] };
    layer.ks.p = { a: 0, k: [cx, cy, 0] };
    // Offset shapes so path coords work with center anchor: move group
    // Easier: don't parent — bake path and use transform on shape group
    return layer;
  };

  // Recreate with shape transform offset instead of layer anchor hack
  function stroked(name, ind, path, t0, t1) {
    const mapped = map(path);
    return {
      ddd: 0,
      ind,
      ty: 4,
      nm: name,
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [0, 0, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          nm: name,
          it: [
            { ty: 'sh', nm: 'Path', ks: { a: 0, k: mapped } },
            {
              ty: 'st',
              c: { a: 0, k: INK },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 7 },
              lc: 2,
              lj: 2,
              ml: 4,
              d: [],
            },
            {
              ty: 'tm',
              s: { a: 0, k: 0 },
              e: { a: 1, k: [kf(t0, 0), kf(t1, 100, ease)] },
              o: { a: 0, k: 0 },
              m: 1,
            },
            {
              ty: 'tr',
              p: {
                a: 1,
                k: [
                  // after draw, gentle hug: drift slightly toward center
                  kf(60, [0, 0]),
                  kf(100, [(cx - (mapped.v[0][0] + mapped.v[mapped.v.length - 1][0]) / 2) * 0.04, (cy - (mapped.v[0][1] + mapped.v[mapped.v.length - 1][1]) / 2) * 0.04], easeIO),
                  kf(140, [0, 0], easeIO),
                  kf(180, [(cx - (mapped.v[0][0] + mapped.v[mapped.v.length - 1][0]) / 2) * 0.025, (cy - (mapped.v[0][1] + mapped.v[mapped.v.length - 1][1]) / 2) * 0.025], easeIO),
                  kf(220, [0, 0], easeIO),
                  kf(240, [0, 0]),
                ],
              },
              a: { a: 0, k: [0, 0] },
              s: {
                a: 1,
                k: [
                  kf(70, [100, 100]),
                  kf(105, [97, 97], easeIO),
                  kf(140, [100, 100], easeIO),
                  kf(175, [98, 98], easeIO),
                  kf(210, [100, 100], easeIO),
                  kf(240, [100, 100]),
                ],
              },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
              sk: { a: 0, k: 0 },
              sa: { a: 0, k: 0 },
            },
          ],
        },
      ],
      ip: 0,
      op,
      st: 0,
      bm: 0,
    };
  }

  return wrapAnim(W, H, 'logo', op, [
    stroked('Outer A', 4, OUTER_A, 0, 40),
    stroked('Outer B', 3, OUTER_B, 8, 48),
    stroked('Inner L', 2, INNER_L, 22, 55),
    stroked('Inner R', 1, INNER_R, 30, 62),
  ]);
}

// --- logo-fun.json: sway / orbit idle ---
function buildLogoFun() {
  const base = buildLogo();
  base.nm = 'logo-fun';
  const op = 240;
  base.op = op;
  // Replace group transforms with sway rotation around center
  base.layers.forEach((layer, idx) => {
    const tr = layer.shapes[0].it.find((x) => x.ty === 'tr');
    if (!tr) return;
    const amp = 3.5 - idx * 0.4;
    tr.r = {
      a: 1,
      k: [
        kf(70, 0),
        kf(110, amp, easeIO),
        kf(150, -amp * 0.85, easeIO),
        kf(190, amp * 0.5, easeIO),
        kf(230, 0, easeIO),
        kf(240, 0),
      ],
    };
    tr.s = {
      a: 1,
      k: [
        kf(70, [100, 100]),
        kf(120, [101.5, 101.5], easeIO),
        kf(180, [99.5, 99.5], easeIO),
        kf(240, [100, 100], easeIO),
      ],
    };
    tr.p = { a: 0, k: [0, 0] };
  });
  return base;
}

// --- logo-name.json: mark draws, opens into Cillian Cooke ---
function buildLogoName() {
  const W = 900;
  const H = 320;
  const op = 360; // ~6s then hold (player loop=false) — slower expand
  const scale = 1.15;
  const markCX = W / 2;
  const markCY = H / 2 - 10;
  const ox = markCX - 100 * scale;
  const oy = markCY - 100 * scale;

  const map = (p) =>
    offsetPath(
      {
        c: p.c,
        v: p.v.map(([x, y]) => [x * scale, y * scale]),
        i: p.i.map(([x, y]) => [x * scale, y * scale]),
        o: p.o.map(([x, y]) => [x * scale, y * scale]),
      },
      ox,
      oy
    );

  const fontSize = 68;
  // Lockup: Cillian · Cooke centered on artboard
  const cillianCX = 248;
  const cookeCX = 548;
  const nameY = markCY;
  const textY = nameY + fontSize * 0.34;

  // Per-glyph x offsets after each C (Syne Bold–ish advances; a→n given extra room)
  const illianX = [0, 26, 50, 74, 100, 152].map((x) => cillianCX + 36 + x);
  const ookeX = [0, 40, 82, 124].map((x) => cookeCX + 36 + x);
  const nameLeft = cillianCX - 48;
  const nameRight = ookeX[ookeX.length - 1] + 48;

  function pathCenter(p) {
    const xs = p.v.map((v) => v[0]);
    const ys = p.v.map((v) => v[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }

  const mOL = map(OUTER_A);
  const mOR = map(OUTER_B);
  const mIL = map(INNER_L);
  const mIR = map(INNER_R);
  const [olx, oly] = pathCenter(mOL);
  const [orx, ory] = pathCenter(mOR);
  const [ilx, ily] = pathCenter(mIL);
  const [irx, iry] = pathCenter(mIR);

  // Outer arcs bookend the full name and stay (no fade)
  const outerAFinal = [nameLeft - olx, nameY - oly - 6];
  const outerBFinal = [nameRight - orx, nameY - ory + 6];

  function strokeLayer(name, ind, mapped, t0, t1, posKeys, scaleKeys) {
    return {
      ddd: 0,
      ind,
      ty: 4,
      nm: name,
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [0, 0, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'sh', ks: { a: 0, k: mapped } },
            {
              ty: 'st',
              c: { a: 0, k: INK },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 7 },
              lc: 2,
              lj: 2,
              ml: 4,
              d: [],
            },
            {
              ty: 'tm',
              s: { a: 0, k: 0 },
              e: { a: 1, k: [kf(t0, 0), kf(t1, 100, ease)] },
              o: { a: 0, k: 0 },
              m: 1,
            },
            {
              ty: 'tr',
              p: posKeys || { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: scaleKeys || { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
              sk: { a: 0, k: 0 },
              sa: { a: 0, k: 0 },
            },
          ],
        },
      ],
      ip: 0,
      op,
      st: 0,
      bm: 0,
    };
  }

  const layers = [
    strokeLayer(
      'Outer A',
      8,
      mOL,
      0,
      55,
      {
        a: 1,
        k: [
          kf(75, [0, 0]),
          kf(140, [outerAFinal[0] * 0.55, outerAFinal[1] * 0.55], ease),
          kf(210, outerAFinal, ease),
          kf(op, outerAFinal),
        ],
      },
      {
        a: 1,
        k: [
          kf(75, [100, 100]),
          kf(210, [88, 88], ease),
          kf(op, [88, 88]),
        ],
      }
    ),
    strokeLayer(
      'Outer B',
      7,
      mOR,
      12,
      68,
      {
        a: 1,
        k: [
          kf(75, [0, 0]),
          kf(140, [outerBFinal[0] * 0.55, outerBFinal[1] * 0.55], ease),
          kf(210, outerBFinal, ease),
          kf(op, outerBFinal),
        ],
      },
      {
        a: 1,
        k: [
          kf(75, [100, 100]),
          kf(210, [88, 88], ease),
          kf(op, [88, 88]),
        ],
      }
    ),
    strokeLayer(
      'Inner L → Cillian C',
      6,
      mIL,
      28,
      78,
      {
        a: 1,
        k: [
          kf(85, [0, 0]),
          kf(200, [cillianCX - ilx, nameY - ily], ease),
          kf(op, [cillianCX - ilx, nameY - ily]),
        ],
      }
    ),
    strokeLayer(
      'Inner R → Cooke C',
      5,
      mIR,
      40,
      88,
      {
        a: 1,
        k: [
          kf(85, [0, 0]),
          kf(200, [cookeCX - irx, nameY - iry], ease),
          kf(op, [cookeCX - irx, nameY - iry]),
        ],
      }
    ),
  ];

  const illian = 'illian'.split('');
  const ooke = 'ooke'.split('');
  let ind = 4;
  illian.forEach((ch, i) => {
    layers.push(
      textLayer({
        name: `illian-${ch}`,
        ind: ind--,
        text: ch,
        size: fontSize,
        pos: [illianX[i], textY],
        ip: 0,
        op,
        delayAppear: 175 + i * 8,
      })
    );
  });
  ooke.forEach((ch, i) => {
    layers.push(
      textLayer({
        name: `ooke-${ch}`,
        ind: ind--,
        text: ch,
        size: fontSize,
        pos: [ookeX[i], textY],
        ip: 0,
        op,
        delayAppear: 185 + i * 8,
      })
    );
  });

  return wrapAnim(W, H, 'logo-name', op, layers);
}

const logo = buildLogo();
const logoFun = buildLogoFun();
const logoName = buildLogoName();

writeFileSync(join(OUT, 'logo.json'), JSON.stringify(logo));
writeFileSync(join(OUT, 'logo-fun.json'), JSON.stringify(logoFun));
writeFileSync(join(OUT, 'logo-name.json'), JSON.stringify(logoName));

console.log('Wrote lottie/logo.json, lottie/logo-fun.json, lottie/logo-name.json');
console.log(`  logo: ${logo.w}x${logo.h} @${logo.fr}fps through frame ${logo.op}`);
console.log(`  logo-name: ${logoName.w}x${logoName.h} through frame ${logoName.op}`);
