(function () {
  'use strict';
  // Ink engine (docs/SPEC.md "Ink engine"). One brush model shared by the practice view, the pen-test preview pad and the export.
  //
  //   samples (raw, post-coalesce, stored)  --Builder-->  stabilised points  --centripetal Catmull-Rom-->  nodes (ellipse footprints)
  //   --hull of two neighbouring footprints--> filled polygons.        Rendering is a deterministic function of (samples, style).
  // Everything in the pipeline is CAUSAL (a point only depends on the samples up to it: One-Euro pressure filter, EMA tilt / speed / position, a
  // curve segment whose end tangent does not look at the next point, start taper by distance from the start, no end taper), so what is painted while the pen
  // moves is final: the pen-up repaint of the stroke reproduces the same pixels (apart from the flush to the real final pen position).
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
  var FC_MIN = 12, FC_BETA = 10, FC_D = 15;   // One-Euro pressure filter (Hz, Hz per unit/s, Hz): ~13 ms at rest, ~2.5 ms while the pressure changes quickly
  var MIN_STEP = 0.05;         // cell units: a stabilised point that moved less is not a new point
  var LEARN_N = 12;            // the pressure floor is learned over this many strokes
  var RANGE_RATE = 0.12;       // adaptive working range: share of each new stroke's p5 / p95 blended in
  var RANGE_MIN_SPAN = 0.3;    // the working range never gets narrower than this (cannot collapse)

  // Brushes. width = base * (wMin + wGain * n) * (1 - speed * v) with n = normalised, curved, filtered pressure (0 = lightest, 1 = hardest); wMin / (wMin + wGain) is the thinnest
  // line as a share of the widest, typical writing pressure (n = 0.4) gives about 1.1 - 1.2. speed: thinning at full speed, capped at 15% so it never fights pressure.
  // start*: 起筆 (ramp from startMin to 1 over startLen cell units, plus a bulge). 收筆 has no distance based taper (it would need to know where the pen lifts): it is
  // the pressure release the pen reports. tilt: strength (0 = round nib, 1 = full 毛筆 ellipse) of the footprint following tiltX / tiltY.
  var BRUSH = {
    mao: { label: '毛筆', wMin: 0.22, wGain: 2.30, speed: 0.15, tilt: 1, startLen: 55, startMin: 0.5, startBulge: 0.16 },        // thinnest ~9% of the widest
    xiu: { label: '秀麗筆', wMin: 0.52, wGain: 1.48, speed: 0.10, tilt: 0.3, startLen: 32, startMin: 0.68, startBulge: 0.05 },   // ~26%
    ying: { label: '硬筆', wMin: 0.75, wGain: 1.12, speed: 0.05, tilt: 0, startLen: 22, startMin: 0.78, startBulge: 0 },          // ~40%
    gang: { label: '鋼筆', wMin: 0.92, wGain: 0.20, speed: 0, tilt: 0, startLen: 0, startMin: 1, startBulge: 0 }                  // ~82%
  };
  var GAMMA = { light: 0.6, mid: 1.0, heavy: 1.6 };                               // 筆壓 輕 / 中 / 重
  var STAB = { off: { tau: 0, lazy: 0 }, light: { tau: 6, lazy: 0 }, mid: { tau: 10, lazy: 7 } };   // 防抖: EMA time constant (ms), lazy-brush radius (cell units)
  Ink.BRUSHES = BRUSH; Ink.GAMMA = GAMMA; Ink.STAB = STAB;
  Ink.stats = { hulls: 0, nodes: 0, strokes: 0, regions: 0 };       // counters (tests, perf notes)

  var COS = [], SIN = [];
  (function () { for (var i = 0; i < RING; i++) { COS.push(Math.cos(TWO_PI * i / RING)); SIN.push(Math.sin(TWO_PI * i / RING)); } })();

  // ------------------------------------------------------------------ style
  // Everything that decides how samples look; built from the settings object (brush, inkWidth, curve, stab, pressure, pressFloor).
  Ink.style = function (st) {
    st = st || {};
    var key = BRUSH[st.brush] ? st.brush : 'xiu', fl = +st.pressFloor, lo = +st.pressLo, hi = +st.pressHi;
    if (!(fl > 0)) fl = 0;
    if (fl > 0.25) fl = 0.25;
    if (!(lo > 0)) lo = fl;                       // working range [lo, hi] (raw pressure 0..1): learned / calibrated, else floor .. 1
    lo = lo < fl ? fl : (lo > 0.6 ? 0.6 : lo);
    if (!(hi > 0)) hi = 1;
    hi = hi > 1 ? 1 : (hi < lo + RANGE_MIN_SPAN ? Math.min(1, lo + RANGE_MIN_SPAN) : hi);
    return {
      brush: key, B: BRUSH[key], base: Ink.BASE[st.inkWidth] || Ink.BASE.mthin, gamma: GAMMA[st.curve] || 1, floor: fl, lo: lo, hi: hi,
      fixed: st.pressure === 'off', stab: STAB[st.stab] || STAB.light
    };
  };
  // raw pressure (0..1000) -> 0..1. The lower end of the working range maps to 0, the upper end to 1; raw = true skips the 筆壓 curve.
  Ink.normPressure = function (p, S, raw) {
    if (S.fixed) return 0.5;
    var n = (p / 1000 - S.lo) / (S.hi - S.lo);
    n = n < 0 ? 0 : (n > 1 ? 1 : n);
    return raw ? n : Math.pow(n, S.gamma);
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
      this.pts.push({ x: x, y: y, n: n, v: 0, tx: tx, ty: ty, d: 0 });
      return;
    }
    dt = t > 0 ? (t > 100 ? 100 : t) : NOMINAL_DT;
    this.rx = x; this.ry = y;
    if (S.stab.lazy > 0) {                      // lazy brush: the brush follows the pen only when it is further away than the radius
      dx = x - this.bx; dy = y - this.by; dl = Math.sqrt(dx * dx + dy * dy);
      if (dl > S.stab.lazy) { this.bx = x - dx * S.stab.lazy / dl; this.by = y - dy * S.stab.lazy / dl; }
    } else { this.bx = x; this.by = y; }
    a = S.stab.tau > 0 ? 1 - Math.exp(-dt / S.stab.tau) : 1;
    nx = this.ex + (this.bx - this.ex) * a; ny = this.ey + (this.by - this.ey) * a;
    dd = Math.sqrt((nx - this.ex) * (nx - this.ex) + (ny - this.ey) * (ny - this.ey));
    // One-Euro filter on the pressure: slow cut-off at rest (steady width), fast while it changes (follows the hand with almost no lag)
    this.edn += ((n - this.np) / dt * 1000 - this.edn) * oneEuro(dt, FC_D);
    this.np = n;
    this.en += (n - this.en) * oneEuro(dt, FC_MIN + FC_BETA * Math.abs(this.edn));
    this.etx += (tx - this.etx) * (1 - Math.exp(-dt / TAU_T));
    this.ety += (ty - this.ety) * (1 - Math.exp(-dt / TAU_T));
    this.sv += (dd / dt - this.sv) * (1 - Math.exp(-dt / TAU_V));
    this.ex = nx; this.ey = ny;
    if (dd < MIN_STEP) return;                  // standing still
    this.dist += dd;
    this.pts.push({ x: nx, y: ny, n: this.en, v: this.sv, tx: this.etx, ty: this.ety, d: this.dist });
  };

  // Pen up: flush to the final raw position (the stabiliser lags behind the pen). The ink already painted does not change.
  Builder.prototype.finish = function () {
    var pts = this.pts, n = pts.length, last, dx, dy, dd;
    if (!n || this.fin) return;
    last = pts[n - 1];
    dx = this.rx - last.x; dy = this.ry - last.y; dd = Math.sqrt(dx * dx + dy * dy);
    if (dd >= MIN_STEP) {
      this.dist += dd;
      pts.push({ x: this.rx, y: this.ry, n: last.n, v: last.v, tx: last.tx, ty: last.ty, d: this.dist });
    }
    this.fin = true;
  };

  // footprint of one (interpolated) point in ctx coordinates
  Builder.prototype.shape = function (P) {
    var S = this.S, B = S.B, w = B.wMin + B.wGain * P.n, x, g, R = 1, phi = 0, tx, ty, m, s2, ra, rb;
    if (B.speed) { x = P.v / VREF; w *= 1 - B.speed * (x > 1 ? 1 : x); }
    if (B.startLen) {
      x = P.d / B.startLen;
      if (x < 1) {
        g = B.startMin + (1 - B.startMin) * x * x * (3 - 2 * x) + B.startBulge * Math.sin(Math.PI * x);
        w *= g;
      }
    }
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
    var m = Math.ceil(lenPx / 1.5), k, s, s2, s3, h00, h10, h01, h11, P = { x: 0, y: 0, n: 0, v: 0, tx: 0, ty: 0, d: 0 }, cur = from, nd;
    m = m < 1 ? 1 : (m > 32 ? 32 : m);
    for (k = 1; k <= m; k++) {
      s = k / m; s2 = s * s; s3 = s2 * s;
      h00 = 2 * s3 - 3 * s2 + 1; h10 = s3 - 2 * s2 + s; h01 = -2 * s3 + 3 * s2; h11 = s3 - s2;
      P.x = h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x;
      P.y = h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y;
      P.n = p1.n + (p2.n - p1.n) * s; P.v = p1.v + (p2.v - p1.v) * s;
      P.tx = p1.tx + (p2.tx - p1.tx) * s; P.ty = p1.ty + (p2.ty - p1.ty) * s; P.d = p1.d + (p2.d - p1.d) * s;
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
    var mg = S.base * sc * (B.wMin + B.wGain) * (1 + B.startBulge) * 0.5 * Math.sqrt(1 + ELONG * B.tilt) + 2.5 / (px || 1);
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

  // ------------------------------------------------------------------ pressure floor and working range
  // The pen's lowest reported pressure (0.094 on the iReader) is "just touching": learned from the lightest sample of each of the first strokes (pressFloor).
  // On top of that a working range [pressLo, pressHi] (raw pressure 0..1) is mapped to n = 0..1: the robust p5 / p95 of each stroke's pressures, blended in slowly
  // (so the width really reaches thin on a light touch and bold on a hard press, whatever this pen / hand does). It cannot collapse: lo <= 0.4, hi >= 0.6, span >= 0.3.
  // 校準 (Ink.calibrate) sets the range from one very light and one very hard stroke and stops the adaptive learning (pressCal) until it is reset.
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pressures(pts) {
    var out = [], i;
    for (i = 2; i < pts.length; i += 6) if (pts[i] > 0) out.push(pts[i] / 1000);
    return out.sort(function (a, b) { return a - b; });
  }
  function pct(a, q) { return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + 0.5))]; }
  // set = the settings object (pressFloor 0..0.25, pressN strokes seen, pressLo / pressHi); minP = lowest raw pressure * 1000 of the stroke;
  // pts = the stroke's flat stride-6 samples (optional: the working range is learned from it). True when the settings changed.
  Ink.learn = function (set, minP, pts) {
    var n = set.pressN || 0, f, cur, nf, changed = false, a, lo, hi, fl;
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
        lo = clamp(pct(a, 0.05), fl, 0.4); hi = clamp(pct(a, 0.95), 0.6, 1);
        if (set.pressHi > 0) {
          lo = (set.pressLo > 0 ? set.pressLo : fl) * (1 - RANGE_RATE) + lo * RANGE_RATE;
          hi = set.pressHi * (1 - RANGE_RATE) + hi * RANGE_RATE;
        }
        lo = round3(clamp(lo, fl, 0.4)); hi = round3(clamp(hi, Math.max(0.6, lo + RANGE_MIN_SPAN), 1));
        if (lo !== set.pressLo || hi !== set.pressHi) { set.pressLo = lo; set.pressHi = hi; changed = true; }
      }
    }
    return changed;
  };
  // light / hard = flat stride-6 samples of one very light and one very hard stroke. Sets pressLo (typical pressure of the light stroke) and pressHi (of the hard one).
  // False when the two strokes are not clearly different (nothing is stored).
  Ink.calibrate = function (set, light, hard) {
    var a = pressures(light), b = pressures(hard), lo, hi, fl = set.pressFloor > 0 ? set.pressFloor : 0;
    if (a.length < 4 || b.length < 4) return false;
    lo = pct(a, 0.5); hi = pct(b, 0.5);
    if (hi - lo < 0.15) return false;
    lo = clamp(lo, Math.max(fl, 0.02), 0.5); hi = clamp(hi, lo + RANGE_MIN_SPAN, 1);
    set.pressLo = round3(lo); set.pressHi = round3(hi); set.pressCal = true;
    return true;
  };
  // back to the adaptive range
  Ink.resetRange = function (set) { set.pressLo = 0; set.pressHi = 0; set.pressCal = false; };

  // ------------------------------------------------------------------ input: events -> stored samples
  // One Sampler per drawing surface. take(e, map) expands getCoalescedEvents() (never getPredictedEvents()), drops what was already seen
  // (pointerrawupdate AND pointermove both deliver the same samples) and appends integer samples to this.pts. map(ev) -> [x, y] in cell units.
  function Sampler() { this.pressureSeen = false; this.reset(); }
  Ink.Sampler = Sampler;
  Sampler.prototype.reset = function () {
    this.pts = []; this.seen = []; this.lastTr = 0; this.lastP = 500; this.minP = 1001; this.raw = 0;
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
    var pts = this.pts, n = pts.length, x = xy[0], y = xy[1], p = this.pressureOf(ev), tx = 0, ty = 0, tr, dx, dy;
    if (ev.pointerType === 'pen') { tx = tilt(ev.tiltX); ty = tilt(ev.tiltY); }
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
