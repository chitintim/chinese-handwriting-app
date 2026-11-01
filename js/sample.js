(function () {
  'use strict';
  // Live samples for the settings: small, static canvases drawn with the app's real drawing code (Draw.cell for the cells, Ink for the strokes), so a sample is exactly what the
  // practice view will show. A sample is created with get() -> {cfg, st} (the copy choices and the app settings it illustrates; read again on every update()) and is redrawn ONLY
  // when update() is called (after a change): no animation, no timers, no layout reads. Pure black / white follows the settings (gridLook 點線 / 描紅樣式 網點 are 1-bit black
  // device pixels, exactly like the practice view on 電子紙). The template fonts load lazily: until a font chunk is ready the cell shows its grid only, and the glyphs are drawn
  // as soon as it is (Draw.fontsReady), never twice for a stale state. docs/SPEC.md revision 19.
  //   Sample.modes(get, set, o)   three cells of one character: 描 / 臨 / 默, each a button (tap = set(mode); set() stores it and calls update()); o.compact, o.chars (['永'])
  //   Sample.cells(get, o)        a 2 x 2 block of cells in the current font / 描紅樣式 / 格線形狀 / 格線 / 外框 / 方向 / 格大小; o.compact, o.chars
  //   Sample.brush(get, o)        the 輕 / 平常 / 重 strokes at the current 筆觸 / 粗細 / 筆壓幅度 + a small pad to try the brush
  // Each returns {el, update(), setChars(list)}.
  var MX = window.MX, h = MX.h, Draw = MX.Draw, Layout = MX.Layout, Ink = MX.Ink;
  var Sm = MX.Sample = {};

  Sm.MODES = [['trace', '描', '灰字打底，沿著描'], ['copy', '臨', '範字在角落，對著寫'], ['recall', '默', '不給範字，憑記憶寫（可按提示）']];
  Sm.CHARS = { trad: '觀自在菩', simp: '观自在菩' };
  Sm.ONE = '永';

  function script(cfg) { return cfg && cfg.script === 'simp' ? 'simp' : 'trad'; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function availW() { return clamp(window.innerWidth - 64, 120, 360); }
  // a canvas of w x hh CSS px at the device pixel ratio; the context works in CSS px
  function sized(cv, w, hh) {
    var d = window.devicePixelRatio || 1, ctx;
    cv.style.width = w + 'px'; cv.style.height = hh + 'px';
    cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
    ctx = cv.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx: ctx, dpr: d };
  }
  // the options of Draw.cell for a copy's choices + the app settings: the same fields the practice view passes (practice.js drawBg)
  function cellOpts(g, mode, dpr) {
    var cfg = g.cfg || {}, st = g.st || {}, gr = Draw.gridOf(cfg);
    return {
      box: gr.box, guide: gr.guide, gstyle: gr.style, look: st.gridLook, density: st.gridDensity, dpr: dpr, tplScale: Draw.tplScale(st.tplSize), font: st.tplFont,
      mode: mode, script: script(cfg), tplStyle: st.tplStyle, tplColor: Draw.TONE[st.tplTone] || Draw.TONE.mid, punct: false, tpl: mode === 'trace'
    };
  }
  // The fonts are unicode-range chunks that load on demand: a sample draws its grid at once and the glyphs when the chunk is ready. lazy() answers whether the glyphs can be drawn now;
  // if not it asks for the font once (per script / font / characters) and calls the owner's update() when it is there. After that one wait the glyphs are drawn whatever the
  // answer (a font that cannot load must not make a loop).
  function lazy(owner, g, chars) {
    var sc = script(g.cfg), font = (g.st || {}).tplFont, key = sc + '|' + font + '|' + chars;
    if (owner.tried === key || Draw.fontsLoaded(sc, font, chars)) return true;
    if (owner.pend !== key) {
      owner.pend = key;
      Draw.fontsReady(sc, chars, font).then(function () { owner.tried = key; owner.pend = null; owner.update(); });
    }
    return false;
  }

  // ------------------------------------------------------------------ 描 / 臨 / 默 side by side
  Sm.modes = function (get, set, o) {
    o = o || {};
    var box = h('div', { class: 'mcards' + (o.compact ? ' compact' : ''), 'data-k': 'mode', 'data-role': 'sample-modes', role: 'radiogroup', 'aria-label': MX.t('書寫方式') });
    var self = { el: box, chars: o.chars || [Sm.ONE], cards: [] };
    var SIZE = o.compact ? 64 : (window.innerWidth < 420 ? 72 : 88);
    Sm.MODES.forEach(function (m) {
      var cv = h('canvas', { 'data-mode': m[0] });
      var b = h('button', { type: 'button', class: 'mcard', 'data-v': m[0], role: 'radio', 'aria-checked': 'false', 'aria-label': MX.t('{name}：{desc}', { name: MX.t(m[1]), desc: MX.t(m[2]) }), onclick: function () { set(m[0]); } },
        [cv, h('span', { class: 'mn', text: MX.t(m[1]) }), h('span', { class: 'md', text: MX.t(m[2]) })]);
      self.cards.push({ b: b, cv: cv, mode: m[0] });
      box.appendChild(b);
    });
    self.update = function () {
      var g = get(), cur = (g.cfg || {}).mode || 'trace', ch = self.chars[0] || Sm.ONE, ready = lazy(self, g, ch);
      self.cards.forEach(function (c) {
        var on = c.mode === cur, r = sized(c.cv, SIZE, SIZE);
        c.b.className = 'mcard' + (on ? ' on' : '');
        c.b.setAttribute('aria-checked', on ? 'true' : 'false');
        Draw.cell(r.ctx, 0, 0, SIZE, { ch: ready ? ch : '', punct: '' }, cellOpts(g, c.mode, r.dpr));
      });
      box.setAttribute('data-chars', ch);
      box.setAttribute('data-v', cur + '|' + (ready ? ch : '') + '|' + [(g.cfg || {}).grid, (g.cfg || {}).guide, (g.cfg || {}).box, (g.st || {}).tplStyle, (g.st || {}).gridLook].join());
    };
    self.setChars = function (list) { if (list && list.length) { self.chars = list.slice(); self.update(); } };
    self.update();
    return self;
  };

  // ------------------------------------------------------------------ the look of the cells
  Sm.cells = function (get, o) {
    o = o || {};
    var cv = h('canvas', { 'data-role': 'sample-cells-canvas' }), cap = h('div', { class: 'note scap', 'data-role': 'sample-caption' });
    var box = h('div', { class: 'smp scells' + (o.compact ? ' compact' : ''), 'data-role': 'sample-cells' }, [h('div', { class: 'frame' }, [cv]), cap]);
    var self = { el: box, chars: o.chars || null };
    self.update = function () {
      var g = get(), cfg = g.cfg || {}, sc = script(cfg), list = self.chars || Array.from(Sm.CHARS[sc]), dm = Layout.DIMS[cfg.size] || Layout.DIMS.M, dir = cfg.dir === 'h' ? 'h' : 'v';
      var max = o.compact ? 84 : 120, cell = clamp(Math.min(max, Math.floor((o.compact ? 300 : 400) / dm[0]), Math.floor(availW() / 2)), 26, max), chars = list.slice(0, 4).join('');
      var ready = lazy(self, g, chars), r = sized(cv, cell * 2, cell * 2), grid = { dir: dir, cols: 2, rows: 2 }, s, p, op = cellOpts(g, 'trace', r.dpr);
      for (s = 0; s < 4; s++) {
        p = Layout.slotToColRow(grid, s);
        Draw.cell(r.ctx, p.col * cell, p.row * cell, cell, { ch: ready ? (list[s] || '') : '', punct: '' }, op);
      }
      cap.textContent = [MX.t('每頁 {c}×{r} 格', { c: dm[0], r: dm[1] }), dir === 'h' ? MX.t('橫書：左到右，由上而下') : MX.t('直書：右行先，由上而下'), cfg.mode && cfg.mode !== 'trace' ? MX.t('預覽以描紅顯示') : ''].filter(Boolean).join(' · ');
      box.setAttribute('data-chars', list.slice(0, 4).join(''));
      box.setAttribute('data-v', [cfg.script, cfg.grid, cfg.guide, cfg.box, dir, cfg.size, (g.st || {}).tplStyle, (g.st || {}).tplFont, (g.st || {}).gridLook, ready ? 1 : 0].join());
    };
    self.setChars = function (list) { if (list && list.length) { self.chars = list.slice(0, 4); self.update(); } };
    self.update();
    return self;
  };

  // ------------------------------------------------------------------ the brush
  var PAD_SC = 0.14;      // ctx px per 1/1000 cell: the pad is drawn as if it were a cell of 140 css px (about a 6 x 8 cell of the tablet layout)
  Sm.brush = function (get, o) {
    o = o || {};
    var st0 = get().st, ws = MX.Form.widthSample(st0), W = Math.max(200, Math.min(560, window.innerWidth - 56)), HH = 112;
    var cv = h('canvas', { class: 'padcv', 'data-role': 'brush-try', style: 'width:' + W + 'px;height:' + HH + 'px' });
    cv.style.touchAction = 'none';
    var ps = { strokes: [], cur: null, cap: new Ink.Sampler(), ctx: null, kx: 1 };
    var clear = h('button', { type: 'button', text: MX.t('清除'), 'data-act': 'try-clear', onclick: function () { ps.strokes = []; paintAll(); } });
    var box = h('div', { class: 'smp sbrush', 'data-role': 'sample-brush' }, [ws.el, h('div', { class: 'note', text: MX.t('在下面框裡試寫（用目前的筆觸，改設定會用同一筆重畫）：') }), h('div', { class: 'frame' }, [cv]), h('div', { class: 'btnrow' }, [clear])]);
    var self = { el: box };
    function style() { return Ink.style(get().st); }
    function setup() {
      var d = window.devicePixelRatio || 1;
      cv.width = Math.round(W * d); cv.height = Math.round(HH * d);
      ps.kx = cv.width / W; ps.ctx = cv.getContext('2d'); ps.ctx.setTransform(ps.kx, 0, 0, ps.kx, 0, 0);
    }
    function paintAll() {
      ps.ctx.clearRect(0, 0, W, HH);
      var S = style();
      ps.strokes.forEach(function (s) { Ink.paintStroke(ps.ctx, s, 0, 0, PAD_SC, S, '#000', { px: ps.kx }); });
    }
    function map(ev) { var r = cv.getBoundingClientRect(); return [Math.round((ev.clientX - r.left) / PAD_SC), Math.round((ev.clientY - r.top) / PAD_SC)]; }
    function feed() {
      var c = ps.cur, pts = ps.cap.pts, n = pts.length / 6, k;
      for (k = c.fed; k < n; k++) c.pen.add(pts[k * 6], pts[k * 6 + 1], pts[k * 6 + 2], pts[k * 6 + 3], pts[k * 6 + 4], pts[k * 6 + 5]);
      if (n > c.fed) { c.fed = n; c.pen.draw(); }
    }
    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      ps.cap.reset();
      ps.cur = { id: e.pointerId, fed: 0, pen: Ink.pen(ps.ctx, 0, 0, PAD_SC, style(), { px: ps.kx }) };
      ps.cap.take(e, map);
      feed();
    });
    function move(e) { if (ps.cur && e.pointerId === ps.cur.id && ps.cap.take(e, map)) feed(); }
    cv.addEventListener('pointermove', move);
    function up(e) {
      var c = ps.cur;
      if (!c || e.pointerId !== c.id) return;
      if (e.type === 'pointerup') { ps.cap.end(e, map); feed(); c.pen.end(); }
      ps.cur = null;
      if (ps.cap.pts.length) { ps.strokes.push(ps.cap.pts.slice()); if (ps.strokes.length > 4) ps.strokes.shift(); }
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    self.update = function () {
      ws.update();
      setup();
      paintAll();
      var st = get().st;
      box.setAttribute('data-v', [st.brush, st.inkWidth, st.pressRange, st.stab, st.pressure, ps.strokes.length].join());
    };
    self.setChars = function () { /* a stroke has no characters */ };
    self.pad = ps;
    self.update();
    return self;
  };
})();
