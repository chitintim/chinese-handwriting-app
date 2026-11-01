(function () {
  'use strict';
  // Ink engine (docs/SPEC.md "Ink engine"). One brush model shared by the practice view, the pen-test preview pad and the export.
  //
  //   samples (raw, post-coalesce, stored)  --Builder-->  stabilised points  --centripetal Catmull-Rom-->  nodes (ellipse footprints)
  //   --hull of two neighbouring footprints--> filled polygons.        Rendering is a deterministic function of (samples, style).
  // Everything in the pipeline is CAUSAL (a point only depends on the samples up to it: One-Euro pressure filter, EMA tilt / speed / position, a
  // curve segment whose end tangent does not look at the next point, start taper by distance from the start, no distance based end taper), so what is painted while the
  // pen moves is final. At pen-up exactly two things are added, deterministically from the last ~30 ms of raw samples: the flush to the real final pen position and the
  // 出鋒 tail (finish()). Live painting + finish() paints the same pixels as the whole-stroke render (paintStroke).
  //
  // Stored stroke, version 2: { v: 2, d: "<packed string>" } holding the integer samples [x, y, p, tx, ty, t, ...]:
  //   x, y   cell-local position in 1/1000 cell (0..1000 inside the cell; strokes may leave the cell a little)
  //   p      RAW pen pressure * 1000 (1..1000; 500 = no pressure information). The floor / curve are applied when rendering.
  //   tx, ty tiltX / tiltY in degrees (-90..90; 0 for touch / mouse / pens without tilt)
  //   t      ms since the previous sample (0 for the first)
  //   d is delta coded (the first sample absolute, every later one as the difference to its predecessor; t is already a delta) and packed as
  //   zigzag base-64 digits, see pack() below. A plain number list is accepted when reading.
  // Version 1 (before the ink engine): a plain flat array [x, y, p, x, y, p, ...] (p = smoothed pressure * 1000); it renders with tilt 0 and a
  // nominal sample interval. In memory a stroke is always the absolute flat array with stride 6 (Ink.decode / Ink.encode convert).
  var MX = window.MX;
  var Ink = MX.Ink = {};

  Ink.VERSION = 2;
  Ink.STRIDE = 6;
  Ink.BASE = { thin: 13, mthin: 17.5, mid: 22, thick: 36 };    // 筆粗 細 / 中細 / 中 / 粗: nib diameter in 1/1000 cell at a typical writing pressure (n = 0.4); 中細 = midway between 細 and 中
  var DEG = Math.PI / 180, TWO_PI = 6.283185307179586;
  var NOMINAL_DT = 4;          // ms between samples when the time is unknown (v1 data, duplicate timestamps)
  var VREF = 2.8;              // writing speed (cell units / ms) at which the speed term saturates
  var ELONG = 2.2;             // 毛筆 footprint: major / minor axis = 1 + ELONG * sin(tilt)^2
  var RING = 16;               // polygon points per footprint
  var TAU_V = 45, TAU_T = 40;  // ms: EMA time constants of speed, tilt
  var MIN_STEP = 0.05;         // cell units: a stabilised point that moved less is not a new point
  var LEARN_N = 12;            // the pressure floor is learned over this many strokes
  var RANGE_RATE = 0.12;       // adaptive working range: share of each new stroke's p5 blended into the low end
  var RANGE_MIN_SPAN = 0.3;    // the working range never gets narrower than this (cannot collapse)
  var MAX_KEEP = 24;           // the high end of the working range is the p75 of the peak pressures of the last strokes
  var TAIL_WIN = 30, TAIL_MIN_DIST = 30, TAIL_V0 = 0.5, TAIL_V1 = 4.0;   // 出鋒: exit window (ms), shortest stroke that gets a tail (cell units), exit speed (cell units / ms) where the tail starts / is full

  // ONE width model (docs/SPEC.md revision 10). width = base * R(n) * gain * (1 - speed * v * (1 - shield * n^2)) * start(d) * tail(k), where
  //   base  = 粗細 (筆粗 細 13 / 中細 17.5 / 中 22 / 粗 36 units): the stroke size at NORMAL pressure, nothing else;
  //   n     = the normalised pressure 0..1 from the pen's raw pressure through the calibration / learned map: light ~0.1, normal 0.5, hard ~0.95 (Ink.normPressure). Calibration only
  //           builds this map, it never changes a width;
  //   R(n)  = width relative to the normal width: R(0.5) = 1, R(0) = wMin^k, R(1) = wMax^k, a smooth monotone curve through those three points (k = 筆壓幅度 小 0.55 / 中 1 / 大 1.45
  //           widens or narrows the range around normal; wMin < 1 < wMax are the brush's own factors, the sliders of the tuning panel);
  //   gain  = brush constant (1; 經典 1.37 = 0.5.1's mean width at normal pressure).
  //   wMin   最細 ×: thinnest line relative to the normal width         wMax  最粗 ×: widest line relative to the normal width
  //   speed  速度變細: share of the width lost at full writing speed     tail  出鋒長度: longest synthetic tail (cell units) added at pen-up; 0 = none (default)
  //   start  起筆: strength of the press-down bloom (0 = none)            smooth 筆壓平滑: jitter removal of the pressure at rest (never lags a real change)
  //   Fixed per brush (not on the panel): tilt (0 = round nib, 1 = full ellipse), startLen (bloom length, cell units), bloom (bulge per unit of start), gain, shield (share of the speed thinning
  //   removed at full pressure), beta / betaDown / dead / fcd = One-Euro pressure filter (cut-off gain in Hz per unit/s of pressure change while the pressure RISES / FALLS, dead band in unit/s,
  //   derivative cut-off in Hz: a quick press passes at nearly the raw value, a release is smoothed more).
  // 毛筆 = the v0.5.1 look made more readable: thinnest 0.4x and widest 2.5x the normal width (ratio ~6), subtle 起筆, NO synthetic 出鋒 tail (the slider stays for those who want it): a stroke ends
  // as the pen's real pressure falls, smoothly (the release is filtered more than the press), never to a needle (the thinnest line is wMin). 經典 = v0.5.1's 毛筆 as closely as the model allows.
  var BRUSH = {
    mao: { label: '毛筆', wMin: 0.4, wMax: 2.5, gain: 1, speed: 0.15, tail: 0, start: 0.3, smooth: 0.5, tilt: 1, startLen: 55, bloom: 0.15, beta: 40, betaDown: 14, dead: 3, fcd: 25, shield: 0.8 },
    xiu: { label: '秀麗筆', wMin: 0.48, wMax: 2.0, gain: 1, speed: 0.10, tail: 0, start: 0.25, smooth: 0.5, tilt: 0.3, startLen: 32, bloom: 0.125, beta: 40, betaDown: 14, dead: 3, fcd: 25, shield: 0.8 },
    ying: { label: '硬筆', wMin: 0.72, wMax: 1.5, gain: 1, speed: 0.05, tail: 0, start: 0.2, smooth: 0.5, tilt: 0, startLen: 22, bloom: 0, beta: 40, betaDown: 14, dead: 3, fcd: 25, shield: 0.8 },
    gang: { label: '鋼筆', wMin: 0.92, wMax: 1.1, gain: 1, speed: 0, tail: 0, start: 0, smooth: 0.5, tilt: 0, startLen: 0, bloom: 0, beta: 40, betaDown: 14, dead: 3, fcd: 25, shield: 0.8 },
    classic: { label: '經典 (0.5.1)', wMin: 0.16, wMax: 1.84, gain: 1.37, speed: 0.15, tail: 0, start: 0.625, smooth: 0.8, tilt: 1, startLen: 55, bloom: 0.256, beta: 10, betaDown: 10, dead: 0, fcd: 15, shield: 0 }
  };
  // the tunable fields (the panel's sliders, in this order); min / max also bound what a saved 自訂 preset may hold
  var PARAMS = [
    { k: 'wMin', label: '最細 ×平常', min: 0.05, max: 1, step: 0.01, fmt: 'x' },
    { k: 'wMax', label: '最粗 ×平常', min: 1, max: 4, step: 0.05, fmt: 'x' },
    { k: 'speed', label: '速度變細', min: 0, max: 0.5, step: 0.01, fmt: 'pct' },
    { k: 'tail', label: '出鋒長度', min: 0, max: 300, step: 5, fmt: 'u' },
    { k: 'start', label: '起筆', min: 0, max: 1, step: 0.05, fmt: 'n' },
    { k: 'smooth', label: '筆壓平滑', min: 0, max: 1, step: 0.05, fmt: 'n' }
  ];
  var FIXED = { tilt: [0, 1], startLen: [0, 120], bloom: [0, 0.5], gain: [0.5, 2], beta: [0, 200], betaDown: [0, 200], dead: [0, 20], fcd: [1, 100], shield: [0, 1] };
  var RANGE = { small: 0.55, mid: 1, large: 1.45 };                               // 筆壓幅度 小 / 中 / 大: exponent applied to wMin / wMax
  var STAB = { off: { tau: 0, lazy: 0 }, light: { tau: 6, lazy: 0 }, mid: { tau: 10, lazy: 7 } };   // 防抖: EMA time constant (ms), lazy-brush radius (cell units)
  Ink.BRUSHES = BRUSH; Ink.RANGE = RANGE; Ink.STAB = STAB; Ink.PARAMS = PARAMS; Ink.FIXED = FIXED;
  Ink.stats = { hulls: 0, nodes: 0, strokes: 0, regions: 0 };       // counters (tests, perf notes)

  var COS = [], SIN = [];
  (function () { for (var i = 0; i < RING; i++) { COS.push(Math.cos(TWO_PI * i / RING)); SIN.push(Math.sin(TWO_PI * i / RING)); } })();

  // ------------------------------------------------------------------ style
  // A complete, clamped parameter set from a (partial) one: every missing / broken field comes from `base` (default 毛筆). Adds the derived values the renderer needs.
  function sanitize(p, base, label) {
    var out = { label: label || (p && p.label) || base.label }, i, d, v;
    p = p || {};
    for (i = 0; i < PARAMS.length; i++) {
      d = PARAMS[i]; v = +p[d.k];
      if (!(v === v) || p[d.k] === null || p[d.k] === '') v = base[d.k];
      out[d.k] = clamp(v, d.min, d.max);
    }
    Object.keys(FIXED).forEach(function (k) { v = +p[k]; out[k] = clamp(v === v && p[k] !== null && p[k] !== '' ? v : base[k], FIXED[k][0], FIXED[k][1]); });
    out.startMin = 1 - 0.8 * out.start;                                  // width at the very start, as a share of the full width
    out.bulge = out.bloom * out.start;
    out.fcMin = 36 - 30 * out.smooth;                                    // Hz: pressure cut-off at rest (about 4.4 ms .. 26 ms time constant)
    return out;
  }
  // The parameter set of a settings object: one of the four brushes, or the saved 自訂 preset (settings.custom, a partial set on top of 毛筆)
  Ink.params = function (st) {
    st = st || {};
    if (st.brush === 'custom') {
      var c = st.custom;
      if (c && !c.rel) { c = {}; Object.keys(st.custom).forEach(function (k) { if (k !== 'wMin' && k !== 'wMax') c[k] = st.custom[k]; }); }   // saved before the one-model rewrite: wMin / wMax meant something else
      return sanitize(c, BRUSH.mao, '自訂');
    }
    return sanitize(BRUSH[st.brush] || BRUSH.mao, BRUSH.mao);
  };
  Ink.sanitize = function (p) { return sanitize(p, BRUSH.mao); };
  // Everything that decides how samples look; built from the settings object (brush, custom, inkWidth, pressRange, stab, pressure, pressFloor, pressLo / pressHi / pressNm learned, pressKnots calibrated).
  // knots = the pressure map [[raw, n], ...] (raw 0..1, increasing): calibrated (floor -> 0, light -> 0.1, normal -> 0.5, hard -> 0.95, 1 -> 1) or adaptive (low end -> 0, the typical
  // pressure of the hand -> 0.5, the hard end -> 1), so ordinary writing lands near n = 0.5 and never saturates.
  Ink.style = function (st) {
    st = st || {};
    var key = st.brush === 'custom' || BRUSH[st.brush] ? st.brush : 'mao', fl = +st.pressFloor, lo = +st.pressLo, hi = +st.pressHi, md = +st.pressNm, kn = st.pressCal && Ink.validKnots(st.pressKnots), knots, pn;
    if (!(fl > 0)) fl = 0;
    if (fl > 0.25) fl = 0.25;
    if (!(lo > 0)) lo = fl;                       // working range [lo, hi] (raw pressure 0..1): learned, else floor .. 1
    lo = lo < fl ? fl : (lo > 0.6 ? 0.6 : lo);
    if (!(hi > 0)) hi = 1;
    hi = hi > 1 ? 1 : (hi < lo + RANGE_MIN_SPAN ? Math.min(1, lo + RANGE_MIN_SPAN) : hi);
    if (kn) {
      var k0 = st.pressKnots, x0 = fl < k0[0] - 0.02 ? fl : k0[0] * 0.5;
      knots = [[x0, 0], [k0[0], 0.1], [k0[1], 0.5], [k0[2], 0.95]];
      if (k0[2] < 0.995) knots.push([1, 1]);
      lo = x0; hi = k0[2];
    } else {
      pn = md > 0 ? md : lo + 0.45 * (hi - lo);
      pn = clamp(pn, lo + 0.15 * (hi - lo), hi - 0.15 * (hi - lo));
      knots = [[lo, 0], [pn, 0.5], [hi, 1]];
    }
    var B = Ink.params({ brush: key, custom: st.custom }), rng = RANGE[st.pressRange] || 1;
    return {
      brush: key, B: B, base: Ink.BASE[st.inkWidth] || Ink.BASE.thin, rng: rng, wHi: Math.pow(B.wMax, rng) * B.gain, floor: fl, lo: lo, hi: hi, knots: knots, calibrated: !!kn,
      fixed: st.pressure === 'off', stab: STAB[st.stab] || STAB.light
    };
  };
  // [light, normal, hard] raw pressures (0..1) of a calibration, or false when they are not a clear, increasing triple
  Ink.validKnots = function (k) {
    return Array.isArray(k) && k.length === 3 && k[0] > 0 && k[1] - k[0] >= 0.02 && k[2] - k[1] >= 0.03 && k[2] <= 1 ? k : false;
  };
  // width of the line relative to the normal width for a normalised pressure n (0..1): a smooth monotone curve (cubic Hermite) through (0, wMin^k), (0.5, 1), (1, wMax^k); k = 筆壓幅度
  // (default 1). Multiplied by the brush's gain. R(0.5) = 1 * gain, so 粗細 is the stroke size at normal pressure.
  Ink.response = function (B, n, k) {
    k = k || 1;
    var lo = Math.pow(B.wMin, k), hi = Math.pow(B.wMax, k), s1 = (1 - lo) / 0.5, s2 = (hi - 1) / 0.5, m = s1 > 0 && s2 > 0 ? 2 * s1 * s2 / (s1 + s2) : 0, t, t2, t3, v;
    n = n < 0 ? 0 : (n > 1 ? 1 : n);
    if (n <= 0.5) { t = n / 0.5; t2 = t * t; t3 = t2 * t; v = (2 * t3 - 3 * t2 + 1) * lo + (t3 - 2 * t2 + t) * 0.5 * s1 + (-2 * t3 + 3 * t2) + (t3 - t2) * 0.5 * m; }
    else { t = (n - 0.5) / 0.5; t2 = t * t; t3 = t2 * t; v = (2 * t3 - 3 * t2 + 1) + (t3 - 2 * t2 + t) * 0.5 * m + (-2 * t3 + 3 * t2) * hi + (t3 - t2) * 0.5 * s2; }
    return v * (B.gain || 1);
  };
  // raw pressure (0..1000) -> n 0..1 through the pressure map (piecewise linear, monotone). raw is kept for old callers (no 筆壓 curve exists any more).
  Ink.normPressure = function (p, S) {
    if (S.fixed) return 0.5;
    var x = p / 1000, K = S.knots, i;
    if (x <= K[0][0]) return 0;
    for (i = 1; i < K.length; i++) if (x <= K[i][0]) return K[i - 1][1] + (K[i][1] - K[i - 1][1]) * (x - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
    return K[K.length - 1][1];
  };
  // the raw pressure (0..1000) that maps to n (inverse of normPressure; used for the static width samples)
  Ink.rawFor = function (S, n) {
    var K = S.knots, i;
    for (i = 1; i < K.length; i++) if (n <= K[i][1]) return Math.round(1000 * (K[i - 1][0] + (K[i][0] - K[i - 1][0]) * (n - K[i - 1][1]) / (K[i][1] - K[i - 1][1])));
    return Math.round(1000 * K[K.length - 1][0]);
  };
  // tiltX / tiltY (deg) -> azimuth (deg, 0 = +x, clockwise on screen), altitude (deg, 90 = upright), and the angle from vertical (rad)
  Ink.angles = function (tiltX, tiltY) {
    var tx = Math.tan((tiltX || 0) * DEG), ty = Math.tan((tiltY || 0) * DEG), m = Math.sqrt(tx * tx + ty * ty);
    var th = Math.atan(m), az = m < 1e-9 ? 0 : Math.atan2(ty, tx);
    if (az < 0) az += TWO_PI;
    return { azimuth: az / DEG, altitude: 90 - th / DEG, theta: th, phi: az };
  };

  // ------------------------------------------------------------------ storage format
  // d is a string: every delta zigzag-coded and written as base-64 digits of 5 bits (bit 6 = more digits follow), so |delta| <= 15 takes one character.
  // Typical 300 Hz samples need about 6 characters (vs about 15 as a JSON number list). Alphabet is JSON/URL safe (no escapes).
  var DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', DIGIT_AT = {};
  (function () { for (var i = 0; i < 64; i++) DIGIT_AT[DIGITS.charAt(i)] = i; })();
  function pack(a) {
    var out = '', i, z, c;
    for (i = 0; i < a.length; i++) {
      z = a[i] < 0 ? -a[i] * 2 - 1 : a[i] * 2;
      do { c = z % 32; z = Math.floor(z / 32); out += DIGITS.charAt(z ? c + 32 : c); } while (z);
    }
    return out;
  }
  function unpack(str) {
    var out = [], i, c, z = 0, m = 1;
    for (i = 0; i < str.length; i++) {
      c = DIGIT_AT[str.charAt(i)];
      if (c === undefined) return null;
      z += (c % 32) * m; m *= 32;
      if (c < 32) { out.push(z % 2 ? -(z + 1) / 2 : z / 2); z = 0; m = 1; }
    }
    return m === 1 ? out : null;
  }
  Ink.encode = function (s) {
    var n = s.length / 6, d = new Array(s.length), i, j;
    for (i = 0; i < n; i++) {
      for (j = 0; j < 5; j++) d[i * 6 + j] = i ? s[i * 6 + j] - s[(i - 1) * 6 + j] : s[j];
      d[i * 6 + 5] = s[i * 6 + 5];
    }
    return { v: 2, d: pack(d) };
  };
  function num(v) { v = +v; return v === v && v !== Infinity && v !== -Infinity ? v : 0; }
  // stored stroke (v1 flat [x,y,p,...] or v2 object) -> in-memory flat stride-6 array, or null when unreadable
  Ink.decode = function (s) {
    var out = [], i, j, n, d;
    if (Array.isArray(s)) {
      n = Math.floor(s.length / 3);
      for (i = 0; i < n; i++) out.push(num(s[i * 3]), num(s[i * 3 + 1]), num(s[i * 3 + 2]), 0, 0, 0);
      return n ? out : null;
    }
    if (s && s.v === 2) {
      d = typeof s.d === 'string' ? unpack(s.d) : (Array.isArray(s.d) ? s.d : null);    // an unpacked number list is accepted too
      if (!d) return null;
      n = Math.floor(d.length / 6);
      for (i = 0; i < n; i++) {
        for (j = 0; j < 5; j++) out.push(num(d[i * 6 + j]) + (i ? out[(i - 1) * 6 + j] : 0));
        out.push(num(d[i * 6 + 5]));
      }
      return n ? out : null;
    }
    return null;
  };
  // ~ bytes of a stroke as JSON (storage notes / tests)
  Ink.jsonSize = function (s) { return JSON.stringify(Ink.encode(s)).length; };

  // ------------------------------------------------------------------ geometry helpers
  function crossKnot(a, b) { var d = Math.sqrt(Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))); return d < 1e-3 ? 1e-3 : d; }

  // Footprint ring of node A into the current path (a closed polygon)
  function addRing(ctx, A) {
    var i, ux, uy;
    for (i = 0; i < RING; i++) {
      ux = A.a * COS[i]; uy = A.b * SIN[i];
      if (i) ctx.lineTo(A.x + ux * A.c - uy * A.s, A.y + ux * A.s + uy * A.c);
      else ctx.moveTo(A.x + ux * A.c - uy * A.s, A.y + ux * A.s + uy * A.c);
    }
    ctx.closePath();
  }
  // Convex hull of two footprints as one closed polygon: the sweep of the nib from A to B. Front-facing ring points (outward normal . d > 0)
  // come from B, back-facing ones from A; both points are emitted where the side changes. No sorting, O(RING).
  function addHull(ctx, A, B) {
    var dx = B.x - A.x, dy = B.y - A.y;
    if (dx * dx + dy * dy < 0.0016) { addRing(ctx, A); addRing(ctx, B); return; }
    var du = dx * B.c + dy * B.s, dv = -dx * B.s + dy * B.c, i, front = [], first = true;
    for (i = 0; i < RING; i++) front.push(COS[i] * du / B.a + SIN[i] * dv / B.b > 0);
    function pt(N, k) {
      var ux = N.a * COS[k], uy = N.b * SIN[k], x = N.x + ux * N.c - uy * N.s, y = N.y + ux * N.s + uy * N.c;
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    for (i = 0; i < RING; i++) {
      var prev = front[(i + RING - 1) % RING];
      if (front[i]) { if (!prev) pt(A, i); pt(B, i); }
      else { if (prev) pt(B, i); pt(A, i); }
    }
    ctx.closePath();
  }

  // ------------------------------------------------------------------ builder: samples -> points -> nodes -> painted polygons
  // S = style, sc = ctx units per cell unit (= cell px / 1000), px = device pixels per ctx unit, (ox, oy) = cell origin in ctx units.
  function Builder(S, sc, px, ox, oy) {
    this.S = S; this.sc = sc; this.px = px || 1; this.ox = ox || 0; this.oy = oy || 0;
    this.minw = 1.1 / this.px;                // thinnest nib (ctx units): about one device pixel
    this.pts = []; this.fin = null; this.started = false;
    this.done = 0; this.node0 = null; this.dot = false;
    this.hist = []; this.tms = 0;             // the last raw samples {t ms, x, y, n}: the exit speed / pressure slope / curvature of the 出鋒 tail
  }
  Ink.Builder = Builder;

  // smoothing factor of a low-pass with cut-off fc (Hz) for a step of dt ms
  function oneEuro(dt, fc) { return 1 / (1 + 1000 / (TWO_PI * fc * dt)); }

  // one raw sample (cell units; p raw pressure * 1000; tilt degrees; t ms since the previous sample)
  Builder.prototype.add = function (x, y, p, tx, ty, t) {
    var S = this.S, n = Ink.normPressure(p, S), dt, a, nx, ny, dd, dx, dy, dl;
    if (!this.started) {
      this.started = true;
      this.bx = this.ex = x; this.by = this.ey = y; this.en = n; this.np = n; this.edn = 0; this.etx = tx; this.ety = ty; this.sv = 0; this.dist = 0;
      this.rx = x; this.ry = y;
      this.pts.push({ x: x, y: y, n: n, v: 0, tx: tx, ty: ty, d: 0, k: 1 });
      this.hist.push({ t: 0, x: x, y: y, n: n });
      return;
    }
    dt = t > 0 ? (t > 100 ? 100 : t) : NOMINAL_DT;
    this.rx = x; this.ry = y;
    this.tms += dt;
    this.hist.push({ t: this.tms, x: x, y: y, n: n });
    if (this.hist.length > 24 || this.tms - this.hist[0].t > 120) this.hist.shift();
    if (S.stab.lazy > 0) {                      // lazy brush: the brush follows the pen only when it is further away than the radius
      dx = x - this.bx; dy = y - this.by; dl = Math.sqrt(dx * dx + dy * dy);
      if (dl > S.stab.lazy) { this.bx = x - dx * S.stab.lazy / dl; this.by = y - dy * S.stab.lazy / dl; }
    } else { this.bx = x; this.by = y; }
    a = S.stab.tau > 0 ? 1 - Math.exp(-dt / S.stab.tau) : 1;
    nx = this.ex + (this.bx - this.ex) * a; ny = this.ey + (this.by - this.ey) * a;
    dd = Math.sqrt((nx - this.ex) * (nx - this.ex) + (ny - this.ey) * (ny - this.ey));
    // One-Euro filter on the pressure: only jitter is removed. Slow cut-off at rest (steady width); above the dead band the cut-off rises steeply with the rate of change, so a quick
    // press (頓筆) or release passes at nearly the raw value and a peak is never flattened.
    this.edn += ((n - this.np) / dt * 1000 - this.edn) * oneEuro(dt, S.B.fcd);
    this.np = n;
    a = Math.abs(this.edn) - S.B.dead;
    this.en += (n - this.en) * oneEuro(dt, S.B.fcMin + (this.edn < 0 ? S.B.betaDown : S.B.beta) * (a > 0 ? a : 0));
    this.etx += (tx - this.etx) * (1 - Math.exp(-dt / TAU_T));
    this.ety += (ty - this.ety) * (1 - Math.exp(-dt / TAU_T));
    this.sv += (dd / dt - this.sv) * (1 - Math.exp(-dt / TAU_V));
    this.ex = nx; this.ey = ny;
    if (dd < MIN_STEP) return;                  // standing still
    this.dist += dd;
    this.pts.push({ x: nx, y: ny, n: this.en, v: this.sv, tx: this.etx, ty: this.ety, d: this.dist, k: 1 });
  };

  function sstep(x, a, b) { x = (x - a) / (b - a); return x <= 0 ? 0 : (x >= 1 ? 1 : x * x * (3 - 2 * x)); }
  // least squares slope d f / dt over hist[i0..i1] (f = 'x' | 'y' | 'n'; t in ms)
  function slope(h, i0, i1, f) {
    var m = i1 - i0 + 1, i, tm = 0, fm = 0, num = 0, den = 0;
    if (m < 2) return 0;
    for (i = i0; i <= i1; i++) { tm += h[i].t; fm += h[i][f]; }
    tm /= m; fm /= m;
    for (i = i0; i <= i1; i++) { num += (h[i].t - tm) * (h[i][f] - fm); den += (h[i].t - tm) * (h[i].t - tm); }
    return den > 0 ? num / den : 0;
  }
  // 出鋒: the tail of the stroke, extrapolated from the last ~30 ms of raw samples (exit velocity, pressure slope, a little of the path's curvature). Deterministic: the same
  // samples always give the same points. The tail grows with the exit speed (smoothstep between TAIL_V0 and TAIL_V1, up to the brush's `tail` length); a quickly falling pressure also
  // starts one (up to 70% of it) and makes the taper drop sooner. A slow stop with a steady pressure has no tail (a deliberate blunt end). Points get the width factor k: 1 -> 0.
  Builder.prototype.makeTail = function () {
    var B = this.S.B, h = this.hist, k = h.length, pts = this.pts, last = pts[pts.length - 1], i, j, i0 = k - 1, tl, vx, vy, v, sp, L, pw, th, turn, m, u, step, x, y, len, c1x, c1y, c2x, c2y, l1, l2, dth, mid;
    if (!B.tail || k < 2 || this.dist < TAIL_MIN_DIST) return;
    tl = h[k - 1].t;
    while (i0 > 0 && tl - h[i0 - 1].t <= TAIL_WIN) i0--;
    if (i0 > k - 2) i0 = k - 2;
    vx = slope(h, i0, k - 1, 'x'); vy = slope(h, i0, k - 1, 'y'); v = Math.sqrt(vx * vx + vy * vy);
    sp = -slope(h, i0, k - 1, 'n') ;                       // pressure falling = positive (per ms)
    L = B.tail * Math.max(sstep(v, TAIL_V0, TAIL_V1), 0.7 * sstep(sp, 0.001, 0.006));
    if (L < 3 || v < 1e-6) return;
    pw = 1.6 + 1.0 * sstep(sp, 0.002, 0.01);               // a quick pressure release drops the width sooner
    th = Math.atan2(vy, vx);
    // curvature from the last ~60 ms: heading change between the two halves of the window
    j = k - 1; while (j > 0 && tl - h[j - 1].t <= 2 * TAIL_WIN) j--;
    turn = 0;
    if (k - j >= 5) {
      mid = j + ((k - 1 - j) >> 1);
      c1x = h[mid].x - h[j].x; c1y = h[mid].y - h[j].y; c2x = h[k - 1].x - h[mid].x; c2y = h[k - 1].y - h[mid].y;
      l1 = Math.sqrt(c1x * c1x + c1y * c1y); l2 = Math.sqrt(c2x * c2x + c2y * c2y);
      if (l1 >= 3 && l2 >= 3) {
        dth = Math.atan2(c2y, c2x) - Math.atan2(c1y, c1x);
        if (dth > Math.PI) dth -= TWO_PI; else if (dth < -Math.PI) dth += TWO_PI;
        turn = clamp(dth / ((l1 + l2) / 2) * L * 0.5, -0.7, 0.7);
      }
    }
    m = Math.ceil(L / 5); m = m < 4 ? 4 : (m > 24 ? 24 : m);
    step = L / m; x = last.x; y = last.y; len = this.dist;
    for (i = 1; i <= m; i++) {
      u = i / m;
      th = Math.atan2(vy, vx) + turn * (u - 0.5 / m);
      x += Math.cos(th) * step; y += Math.sin(th) * step; len += step;
      pts.push({ x: x, y: y, n: last.n, v: last.v, tx: last.tx, ty: last.ty, d: len, k: i === m ? 0 : Math.pow(1 - u, pw) });
    }
    this.dist = len;
  };

  // Pen up: flush to the final raw position (the stabiliser lags behind the pen), then the 出鋒 tail. The ink already painted does not change.
  Builder.prototype.finish = function () {
    var pts = this.pts, n = pts.length, last, dx, dy, dd;
    if (!n || this.fin) return;
    last = pts[n - 1];
    dx = this.rx - last.x; dy = this.ry - last.y; dd = Math.sqrt(dx * dx + dy * dy);
    if (dd >= MIN_STEP) {
      this.dist += dd;
      pts.push({ x: this.rx, y: this.ry, n: last.n, v: last.v, tx: last.tx, ty: last.ty, d: this.dist, k: 1 });
    }
    this.makeTail();
    this.fin = true;
  };

  // footprint of one (interpolated) point in ctx coordinates
  Builder.prototype.shape = function (P) {
    var S = this.S, B = S.B, w = Ink.response(B, P.n, S.rng), x, g, R = 1, phi = 0, tx, ty, m, s2, ra, rb;
    if (B.speed) { x = P.v / VREF; w *= 1 - B.speed * (x > 1 ? 1 : x) * (1 - B.shield * P.n * P.n); }     // a hard fast press stays bold
    if (B.startLen && B.start) {
      x = P.d / B.startLen;
      if (x < 1) {
        g = B.startMin + (1 - B.startMin) * x * x * (3 - 2 * x) + B.bulge * Math.sin(Math.PI * x);
        w *= g;
      }
    }
    if (P.k < 1) w *= P.k;
    w *= S.base * this.sc;
    if (w < this.minw) w = this.minw;
    if (B.tilt) {
      tx = Math.tan(P.tx * DEG); ty = Math.tan(P.ty * DEG); m = Math.sqrt(tx * tx + ty * ty);
      if (m > 1e-4) { s2 = Math.sin(Math.atan(m)); R = 1 + ELONG * B.tilt * s2 * s2; phi = Math.atan2(ty, tx); }
    }
    ra = w / 2 * Math.sqrt(R); rb = w / 2 / Math.sqrt(R);
    Ink.stats.nodes++;
    return { x: this.ox + P.x * this.sc, y: this.oy + P.y * this.sc, a: ra, b: rb < this.minw / 2 ? this.minw / 2 : rb, c: Math.cos(phi), s: Math.sin(phi) };
  };

  // Walk segment i (pts[i] -> pts[i+1]) as a centripetal Catmull-Rom curve and add one hull per sub-step to the path.
  // from = the node at pts[i]; returns the node at pts[i+1]. The end control point is duplicated while it is not known yet.
  Builder.prototype.run = function (i, from, ctx) {
    // causal: the end control point is the mirror of p1 about p2, never the next sample, so a segment is final the moment its end point exists
    var pts = this.pts, p1 = pts[i], p2 = pts[i + 1], p0 = pts[i - 1] || p1, p3 = { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    var t01 = crossKnot(p0, p1), t12 = crossKnot(p1, p2), t23 = crossKnot(p2, p3);
    var m1x = t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12) + (p2.x - p1.x) / t12);
    var m1y = t12 * ((p1.y - p0.y) / t01 - (p2.y - p0.y) / (t01 + t12) + (p2.y - p1.y) / t12);
    var m2x = t12 * ((p2.x - p1.x) / t12 - (p3.x - p1.x) / (t12 + t23) + (p3.x - p2.x) / t23);
    var m2y = t12 * ((p2.y - p1.y) / t12 - (p3.y - p1.y) / (t12 + t23) + (p3.y - p2.y) / t23);
    var lenPx = Math.sqrt((p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y)) * this.sc * this.px;
    var m = Math.ceil(lenPx / 1.5), k, s, s2, s3, h00, h10, h01, h11, P = { x: 0, y: 0, n: 0, v: 0, tx: 0, ty: 0, d: 0, k: 1 }, cur = from, nd;
    m = m < 1 ? 1 : (m > 32 ? 32 : m);
    for (k = 1; k <= m; k++) {
      s = k / m; s2 = s * s; s3 = s2 * s;
      h00 = 2 * s3 - 3 * s2 + 1; h10 = s3 - 2 * s2 + s; h01 = -2 * s3 + 3 * s2; h11 = s3 - s2;
      P.x = h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x;
      P.y = h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y;
      P.n = p1.n + (p2.n - p1.n) * s; P.v = p1.v + (p2.v - p1.v) * s;
      P.tx = p1.tx + (p2.tx - p1.tx) * s; P.ty = p1.ty + (p2.ty - p1.ty) * s; P.d = p1.d + (p2.d - p1.d) * s; P.k = p1.k + (p2.k - p1.k) * s;
      nd = this.shape(P);
      ctx.beginPath(); addHull(ctx, cur, nd); ctx.fill();      // one fill per hull: the result does not depend on how the segments were batched (live vs whole stroke)
      Ink.stats.hulls++;
      cur = nd;
    }
    return cur;
  };

  // Paint what is new (every segment is final once it exists, see run()). `last` is kept for callers: live and after finish() paint the same way.
  Builder.prototype.paint = function (ctx, last, color) {
    var pts = this.pts, n = pts.length, cur, lastFinal, i;
    if (!n) return;
    ctx.fillStyle = color || '#000';
    if (!this.dot) {                           // the first footprint (a dot for a one-sample stroke)
      this.node0 = this.shape(pts[0]);
      ctx.beginPath(); addRing(ctx, this.node0); ctx.fill();
      this.dot = true;
    }
    if (n === 1) return;
    cur = this.node0;
    lastFinal = n - 2;
    for (i = this.done; i <= lastFinal; i++) cur = this.run(i, cur, ctx);
    if (lastFinal + 1 > this.done) { this.done = lastFinal + 1; this.node0 = cur; }
  };

  // ------------------------------------------------------------------ public painters
  // Live session: pen.add(x, y, p, tx, ty, t) per stored sample, pen.draw() paints the new part (incremental, no clearing).
  Ink.pen = function (ctx, ox, oy, sc, S, o) {
    var b = new Builder(S, sc, o && o.px, ox, oy);
    b.draw = function () { b.paint(ctx, false, '#000'); };
    b.end = function () { b.finish(); b.paint(ctx, true, '#000'); };      // pen-up: the flush to the final position + the 出鋒 tail, painted like the whole-stroke render does
    return b;
  };
  // Whole stroke (flat stride-6 samples) in one go: the final, clean shape. Used for redraws, the pen-up polish and the export.
  Ink.paintStroke = function (ctx, st, ox, oy, sc, S, color, o) {
    var n = st.length / 6, b, i;
    if (!n) return;
    b = new Builder(S, sc, o && o.px, ox, oy);
    for (i = 0; i < n; i++) b.add(st[i * 6], st[i * 6 + 1], st[i * 6 + 2], st[i * 6 + 3], st[i * 6 + 4], st[i * 6 + 5]);
    b.finish();
    b.paint(ctx, true, color || '#000');
    Ink.stats.strokes++;
  };
  // Bounding box (ctx units) of everything a stroke can paint: sample extents + the largest footprint of the brush
  Ink.bounds = function (st, ox, oy, sc, S, px) {
    var n = st.length / 6, i, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, B = S.B;
    for (i = 0; i < n; i++) {
      if (st[i * 6] < x0) x0 = st[i * 6]; if (st[i * 6] > x1) x1 = st[i * 6];
      if (st[i * 6 + 1] < y0) y0 = st[i * 6 + 1]; if (st[i * 6 + 1] > y1) y1 = st[i * 6 + 1];
    }
    var mg = S.base * sc * S.wHi * (1 + B.bulge) * 0.5 * Math.sqrt(1 + ELONG * B.tilt) + B.tail * sc * 1.05 + 2.5 / (px || 1);     // largest footprint + the longest tail
    return { x0: ox + x0 * sc - mg, y0: oy + y0 * sc - mg, x1: ox + x1 * sc + mg, y1: oy + y1 * sc + mg };
  };
  function meets(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
  Ink.union = function (a, b) {
    return a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b;
  };
  // Re-render just a rectangle (ctx units) of an ink canvas: snap it to whole device pixels, clear it, repaint the strokes that reach into it.
  // items = [{st, ox, oy, sc}]; kx / ky = device pixels per ctx unit. Returns the snapped rectangle.
  Ink.repaintRegion = function (ctx, kx, ky, rect, items, S, px) {
    var x0 = Math.floor(rect.x0 * kx) / kx, y0 = Math.floor(rect.y0 * ky) / ky, x1 = Math.ceil(rect.x1 * kx) / kx, y1 = Math.ceil(rect.y1 * ky) / ky;
    var r = { x0: x0, y0: y0, x1: x1, y1: y1 }, i, it;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (meets(Ink.bounds(it.st, it.ox, it.oy, it.sc, S, px), r)) Ink.paintStroke(ctx, it.st, it.ox, it.oy, it.sc, S, '#000', { px: px });
    }
    ctx.restore();
    Ink.stats.regions++;
    return r;
  };

  // ------------------------------------------------------------------ pressure floor, working range, calibration
  // The pen's lowest reported pressure (0.094 on the iReader) is "just touching": learned from the lightest sample of each of the first strokes (pressFloor).
  // The pressure map (Ink.style knots) is built from, in this order of authority:
  //   1. 校準 (Ink.calibrate): three strokes, 輕 / 平常 / 重: light median -> n 0.1, normal median -> 0.5, hard p90 -> 0.95 (settings.pressKnots, pressCal). Learning stops until it is reset.
  //   2. otherwise the adaptive range: low end = the robust p5 of each stroke's pressures (blended in slowly); hard end = the p75 of the peak pressures (p97 of each stroke) of the last
  //      MAX_KEEP strokes (settings.pressMx); NORMAL = the median of the strokes' median pressures (settings.pressMd -> pressNm) which maps to n = 0.5, so ordinary writing sits in the
  //      middle of the range and can neither saturate nor vanish. lo <= 0.4, hi >= 0.6, span >= 0.3.
  // Neither changes a width: the width at n = 0.5 is the 粗細 preset (see the model at the top of BRUSH).
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pressures(pts) {
    var out = [], i;
    for (i = 2; i < pts.length; i += 6) if (pts[i] > 0) out.push(pts[i] / 1000);
    return out.sort(function (a, b) { return a - b; });
  }
  function pct(a, q) { return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + 0.5))]; }
  // set = the settings object (pressFloor 0..0.25, pressN strokes seen, pressLo / pressHi, pressMx recent stroke peaks, pressMd recent stroke medians, pressNm); minP = lowest raw pressure * 1000
  // of the stroke; pts = the stroke's flat stride-6 samples (optional: the working range is learned from it). True when the settings changed.
  Ink.learn = function (set, minP, pts) {
    var n = set.pressN || 0, f, cur, nf, changed = false, a, lo, hi, fl, list, mdl, i, nm;
    if (minP > 0 && minP <= 1000 && n < LEARN_N) {
      f = minP / 1000;
      f = f < 0.02 ? 0.02 : (f > 0.25 ? 0.25 : f);
      cur = n > 0 && set.pressFloor > 0 ? set.pressFloor : 1;
      nf = round3(Math.min(cur, f));
      set.pressN = n + 1;
      set.pressFloor = nf;
      changed = true;
    }
    if (pts && !set.pressCal) {
      a = pressures(pts);
      if (a.length >= 4) {
        fl = set.pressFloor > 0 ? set.pressFloor : 0;
        lo = clamp(pct(a, 0.05), fl, 0.4);
        list = Array.isArray(set.pressMx) ? set.pressMx.slice(-(MAX_KEEP - 1)) : [];
        for (i = list.length - 1; i >= 0; i--) if (!(list[i] > 0 && list[i] <= 1)) list.splice(i, 1);
        if (a.length >= 8) list.push(round3(pct(a, 0.97)));            // a dot or a tick says nothing about how hard the hand presses
        mdl = Array.isArray(set.pressMd) ? set.pressMd.slice(-(MAX_KEEP - 1)) : [];
        for (i = mdl.length - 1; i >= 0; i--) if (!(mdl[i] > 0 && mdl[i] <= 1)) mdl.splice(i, 1);
        if (a.length >= 8) mdl.push(round3(pct(a, 0.5)));
        nm = mdl.length ? round3(pct(mdl.slice().sort(function (p, q) { return p - q; }), 0.5)) : 0;
        if (list.length) hi = pct(list.slice().sort(function (p, q) { return p - q; }), 0.75);
        else hi = set.pressHi > 0 ? set.pressHi : pct(a, 0.95);
        hi = clamp(hi, 0.6, 1);
        if (set.pressHi > 0) lo = (set.pressLo > 0 ? set.pressLo : fl) * (1 - RANGE_RATE) + lo * RANGE_RATE;
        lo = round3(clamp(lo, fl, 0.4)); hi = round3(clamp(hi, Math.max(0.6, lo + RANGE_MIN_SPAN), 1));
        if (lo !== set.pressLo || hi !== set.pressHi || nm !== set.pressNm || JSON.stringify(list) !== JSON.stringify(set.pressMx)) {
          set.pressLo = lo; set.pressHi = hi; set.pressMx = list; set.pressMd = mdl; set.pressNm = nm; changed = true;
        }
      }
    }
    return changed;
  };
  // 校準: flat stride-6 samples of one 輕 (light), one 平常 (normal) and one 重 (hard) stroke. Stores settings.pressKnots = [light median, normal median, hard p90] and pressCal.
  // Returns null on success, else the reason (nothing is stored): too few pressure samples, or the three strokes are not clearly increasing (hard <= normal, normal <= light ...).
  Ink.calibrate = function (set, light, normal, hard) {
    var a = pressures(light), b = pressures(normal), c = pressures(hard), pl, pn, ph;
    if (a.length < 4 || b.length < 4 || c.length < 4) return '壓力資料太少，請重寫（筆要長一點）';
    pl = pct(a, 0.5); pn = pct(b, 0.5); ph = pct(c, 0.9);
    if (pn - pl < 0.02) return '「平常」不比「輕」重，請重做';
    if (ph - pn < 0.03) return '「重」不比「平常」重，請重做（壓得更用力）';
    if (pl < 0.02 || ph > 1) return '壓力資料不合理，請重做';
    set.pressKnots = [round3(pl), round3(pn), round3(ph)]; set.pressCal = true;
    set.pressLo = round3(pl * 0.5); set.pressHi = round3(ph);
    return null;
  };
  // back to the adaptive map (also forgets what was learned)
  Ink.resetRange = function (set) { set.pressLo = 0; set.pressHi = 0; set.pressCal = false; set.pressKnots = null; set.pressMx = []; set.pressMd = []; set.pressNm = 0; };

  // ------------------------------------------------------------------ input: events -> stored samples
  // One Sampler per drawing surface. take(e, map) expands getCoalescedEvents() (never getPredictedEvents()), drops what was already seen
  // (pointerrawupdate AND pointermove both deliver the same samples) and appends integer samples to this.pts. map(ev) -> [x, y] in cell units.
  function Sampler() { this.pressureSeen = false; this.reset(); }
  Ink.Sampler = Sampler;
  Sampler.prototype.reset = function () {
    this.pts = []; this.seen = []; this.lastTr = 0; this.lastP = 500; this.minP = 1001; this.raw = 0;
    this.synth = null; this.vl = null; this.sv = 0; this.vn = 0.6; this.force = null; this.fn = -1;
  };
  // A finger (or mouse) reports no real pressure: a constant 0 / 0.5. When `synth` is set (a function n 0..1 -> raw pressure 0..1000, set by the practice view for touch strokes),
  // the pressure is derived from the writing speed instead: slow -> thick, fast -> thin (a brush that is pulled quickly leaves a thinner line), smoothed so the width changes
  // gradually. The result is stored like any other pressure, so a copy written with the finger renders the same on every layout.
  var TOUCH_V0 = 0.25, TOUCH_V1 = 4.0, TOUCH_NSLOW = 0.9, TOUCH_NFAST = 0.15;     // speed (cell units / ms) where the width starts to fall / is thinnest; the normalised pressure at both ends
  // `force` (optional, set by the practice view for a Force Touch trackpad): a function returning the normalised pressure 0..1 the trackpad reports right now, or -1 when it has no reading;
  // while it has one it replaces the speed model (low-passed, tau 40 ms).
  Sampler.prototype.velocityP = function (xy, ts) {
    var l = this.vl, dt, v, a, f = this.force ? this.force() : -1;
    if (!l) {
      this.vl = { x: xy[0], y: xy[1], t: ts }; this.vn = 0.6;
      if (f >= 0) this.fn = f;
      return this.synth(f >= 0 ? f : this.vn);
    }
    dt = ts - l.t;
    dt = dt > 0 ? (dt > 100 ? 100 : dt) : 4;
    v = Math.sqrt((xy[0] - l.x) * (xy[0] - l.x) + (xy[1] - l.y) * (xy[1] - l.y)) / dt;
    this.sv += (v - this.sv) * (1 - Math.exp(-dt / 60));
    a = (this.sv - TOUCH_V0) / (TOUCH_V1 - TOUCH_V0); a = a <= 0 ? 0 : (a >= 1 ? 1 : a * a * (3 - 2 * a));
    this.vn += (TOUCH_NSLOW - (TOUCH_NSLOW - TOUCH_NFAST) * a - this.vn) * (1 - Math.exp(-dt / 90));
    l.x = xy[0]; l.y = xy[1]; l.t = ts;
    if (f >= 0) {
      this.fn = this.fn < 0 ? f : this.fn + (f - this.fn) * (1 - Math.exp(-dt / 40));
      return this.synth(this.fn);
    }
    return this.synth(this.vn);
  };
  Sampler.events = function (e) {
    var list = null;
    if (typeof e.getCoalescedEvents === 'function') {
      try { list = e.getCoalescedEvents(); } catch (x) { list = null; }
    }
    return list && list.length ? list : [e];
  };
  // A sample is the same one when time stamp and position match. The last few keys are remembered (not "newer than the last one": a platform whose
  // time stamps wobble must never lose real samples).
  Sampler.prototype.fresh = function (ev) {
    var k = (ev.timeStamp || 0) + '|' + ev.clientX + '|' + ev.clientY;
    if (this.seen.indexOf(k) >= 0) return false;
    this.seen.push(k);
    if (this.seen.length > 24) this.seen.shift();
    return true;
  };
  Sampler.prototype.pressureOf = function (ev) {
    if (ev.pointerType !== 'pen') return 500;
    var pr = ev.pressure, p;
    if (pr > 0 && pr !== 0.5) this.pressureSeen = true;
    if (!this.pressureSeen) return 500;
    if (!(pr > 0)) return this.lastP;
    p = Math.round(pr * 1000);
    p = p < 1 ? 1 : (p > 1000 ? 1000 : p);
    if (p < this.minP) this.minP = p;
    return p;
  };
  function tilt(v) { v = Math.round(+v || 0); return v < -90 ? -90 : (v > 90 ? 90 : v); }
  Sampler.prototype.add = function (ev, xy, force) {
    var pts = this.pts, n = pts.length, x = xy[0], y = xy[1], p = ev.pointerType !== 'pen' && this.synth ? this.velocityP(xy, ev.timeStamp || 0) : this.pressureOf(ev), tx = 0, ty = 0, tr, dx, dy, tn, az;
    if (ev.pointerType === 'pen') {
      tx = tilt(ev.tiltX); ty = tilt(ev.tiltY);
      // Safari (Apple Pencil) may give altitudeAngle / azimuthAngle (radians) and no tiltX / tiltY
      if (!tx && !ty && ev.altitudeAngle > 0 && ev.altitudeAngle < 1.5 && ev.azimuthAngle === ev.azimuthAngle) {
        tn = Math.tan(1.5707963267948966 - ev.altitudeAngle); az = ev.azimuthAngle;
        tx = tilt(Math.atan(tn * Math.cos(az)) / DEG); ty = tilt(Math.atan(tn * Math.sin(az)) / DEG);
      }
    }
    this.lastP = p;
    this.raw++;
    if (n) {
      dx = x - pts[n - 6]; dy = y - pts[n - 5];
      if (Math.abs(p - pts[n - 4]) < 10 && Math.abs(tx - pts[n - 3]) <= 2 && Math.abs(ty - pts[n - 2]) <= 2 && (dx === 0 && dy === 0 || !force && dx * dx + dy * dy < 2.25)) return false;
    }
    tr = Math.round(ev.timeStamp || 0);
    pts.push(x, y, p, tx, ty, n ? Math.max(0, tr - this.lastTr) : 0);
    this.lastTr = tr;
    return true;
  };
  // returns how many samples were appended
  Sampler.prototype.take = function (e, map) {
    var list = Sampler.events(e), i, n0 = this.pts.length;
    for (i = 0; i < list.length; i++) if (this.fresh(list[i])) this.add(list[i], map(list[i]), false);
    return (this.pts.length - n0) / 6;
  };
  // pen up: the final position is always kept (the pressure of the up event is meaningless, the last one is reused)
  Sampler.prototype.end = function (e, map) {
    var n0 = this.pts.length;
    this.add(e, map(e), true);
    return (this.pts.length - n0) / 6;
  };
})();
