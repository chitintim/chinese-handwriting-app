(function () {
  'use strict';
  // The stroke-order popup (docs/SPEC.md "Stroke order"): a large cell with the character's outlines as a light dithered template, an animation that reveals every stroke along its
  // median in a few coarse steps (4 per stroke), numbers + direction arrows, 重播 / 逐筆 / 速度 / 關閉, an overview row (1, 1-2, 1-2-3 ...) and one clean full redraw when the animation ends
  // (clears e-ink ghosting). It is an ordinary MX.modal (Android Back closes it); Practice.hide() closes it too.
  var MX = window.MX, h = MX.h, St = MX.Strokes;
  var SPEEDS = { slow: 260, mid: 120, fast: 60 };       // ms per step
  var PER_PAGE = 6;                                      // overview frames per page
  var cur = null;

  function settings() { return MX.Model.settings; }
  function dprNow() { return Math.min(window.devicePixelRatio || 1, settings().perf ? 1 : 3); }
  function caption(k) { return k <= 3 ? '1-2-3'.slice(0, 2 * k - 1) : '1-' + k; }

  function open(o) {
    close();
    var P = { nav: o.nav ? { cells: o.nav.cells, idx: o.nav.idx } : null, tok: 0, ch: o.ch, script: o.script === 'simp' ? 'simp' : 'trad', rec: null, n: 0, part: null, mode: 'idle', i: 0, k: 0, steps: 0, redraws: 0, ovPage: 0, timer: null, size: 200, dpr: 1, cv: null, status: null, state: 'loading' };
    var body = h('div', { class: 'spbody', 'data-role': 'stroke-body' });
    var titleEl = h('h2', { class: 'grow', text: MX.t('筆順 · {ch}', { ch: P.ch }), 'data-role': 'stroke-title', 'data-zh': '' });
    var api = MX.modal({
      body: [h('div', { class: 'sheethead' }, [titleEl,
        h('button', { class: 'on', text: MX.t('關閉'), 'data-act': 'close', onclick: function () { close(); } })]), body],
      onClose: function () { stopTimer(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('mo-key', onMoKey); if (cur === P) cur = null; if (o.onClose) o.onClose(); }
    });
    api.el.className += ' sheet stroke-pop';
    api.el.setAttribute('data-role', 'stroke-pop');
    P.api = api; P.body = body;
    cur = P;

    function stopTimer() { clearTimeout(P.timer); P.timer = null; }
    function ms() { return (MX.test && MX.test.strokeMs) || SPEEDS[settings().strokeSpeed] || SPEEDS.mid; }
    function paint() {
      if (!P.cv || !P.rec) return;
      St.draw(P.cv.getContext('2d'), P.rec, P.size, { dpr: P.dpr, done: P.n, part: P.part, script: P.script });
    }
    function statusText() {
      var N = P.rec.n;
      if (P.mode === 'anim') return MX.t('第 {i} / {n} 畫', { i: Math.min(P.i + 1, N), n: N });
      return P.n > 0 && P.n < N ? MX.t('共 {n} 畫 · 已看 {seen}', { n: N, seen: P.n }) : MX.t('共 {n} 畫', { n: N });
    }
    function syncUi() {
      if (P.status) P.status.textContent = statusText();
      updateButtons();
      body.setAttribute('data-mode', P.mode);
      api.el.setAttribute('data-n', String(P.n));
    }
    // ---- animation: 4 coarse steps per stroke (no tweening: every step is one e-ink-friendly frame)
    function play() {
      stopTimer();
      P.mode = 'anim'; P.n = 0; P.part = null; P.i = 0; P.k = 0; P.steps = 0;
      paint(); syncUi();
      schedule();
    }
    function schedule() { P.timer = setTimeout(step, ms()); }
    function step() {
      if (cur !== P) return;
      var S = St.STEPS, N = P.rec.n;
      P.k++;
      P.steps++;
      if (P.k >= S) { P.n = P.i + 1; P.part = null; P.k = 0; P.i++; }
      else P.part = { i: P.i, f: P.k / S };
      if (P.i >= N) { finish(); return; }
      paint(); syncUi();
      schedule();
    }
    function finish() {
      P.mode = 'static'; P.n = P.rec.n; P.part = null; P.i = P.rec.n; P.timer = null;
      fullRedraw();
    }
    // one clean full redraw: every node of the popup body is rebuilt and the canvases repainted from scratch
    function fullRedraw() {
      P.redraws++;
      api.el.setAttribute('data-redraws', String(P.redraws));
      build();
    }
    function toStatic(n) {
      stopTimer();
      P.mode = 'static'; P.part = null; P.n = MX.clamp(n, 0, P.rec.n); P.i = P.n;
      paint(); syncUi(); updateButtons();
    }
    // 逐筆 targets: back = one stroke less (during the animation: the start of the stroke being drawn, or the one before when it is just finished), forward = one more stroke
    function prevTarget() { return P.mode === 'anim' && P.part ? P.n : P.n - 1; }
    function updateButtons() {
      var prev = body.querySelector('[data-act=step-prev]'), next = body.querySelector('[data-act=step-next]');
      if (prev) prev.disabled = prevTarget() < 0;
      if (next) next.disabled = P.n >= P.rec.n;
    }
    function frames() {
      var N = P.rec.n, pages = Math.max(1, Math.ceil(N / PER_PAGE)), row = h('div', { class: 'spframes', 'data-role': 'stroke-frames' }), fs = 76, k, from, to;
      P.ovPage = MX.clamp(P.ovPage, 0, pages - 1);
      from = P.ovPage * PER_PAGE + 1; to = Math.min(N, from + PER_PAGE - 1);
      for (k = from; k <= to; k++) {
        (function (kk) {
          var c = h('canvas', { style: 'width:' + fs + 'px;height:' + fs + 'px' });
          c.width = Math.round(fs * P.dpr); c.height = Math.round(fs * P.dpr);
          St.draw(c.getContext('2d'), P.rec, fs, { dpr: P.dpr, done: kk, marks: false, script: P.script });
          row.appendChild(h('button', { type: 'button', class: 'spf', 'data-act': 'frame', 'data-k': String(kk), title: MX.t('第 {n} 畫', { n: kk }), onclick: function () { remember('step'); toStatic(kk); } },
            [c, h('div', { class: 'cap', text: caption(kk) })]));
        })(k);
      }
      var box = h('div', { 'data-role': 'stroke-overview', 'data-page': String(P.ovPage), 'data-pages': String(pages) }, [row]);
      if (pages > 1) {
        box.appendChild(h('div', { class: 'btnrow spov' }, [
          MX.btn({ label: MX.t('上頁'), icon: 'tri-l', act: 'ov-prev', disabled: P.ovPage <= 0, onclick: function () { P.ovPage--; build(); } }),
          h('div', { class: 'ctr', 'data-role': 'ov-ctr', text: (P.ovPage + 1) + ' / ' + pages }),
          MX.btn({ label: MX.t('下頁'), icon: 'tri-r', iconRight: true, act: 'ov-next', disabled: P.ovPage >= pages - 1, onclick: function () { P.ovPage++; build(); } })
        ]));
      }
      return box;
    }
    function build() {
      body.innerHTML = '';
      P.cv = null; P.status = null;
      var nb = navBox();
      if (nb) body.appendChild(nb);
      if (P.state === 'loading') { body.appendChild(h('p', { text: MX.t('載入中…'), 'data-role': 'stroke-loading' })); return; }
      if (P.state !== 'ok') {
        body.appendChild(h('p', { class: 'spnodata', 'data-role': P.state === 'nodata' ? 'stroke-nodata' : 'stroke-error', text: P.state === 'nodata'
          ? MX.t('找不到「{ch}」的筆順資料。', { ch: P.ch }) : MX.t('筆順資料無法載入（離線且尚未下載過？）。連上網路後再試一次。') }));
        return;
      }
      P.dpr = dprNow();
      P.size = Math.floor(MX.clamp(Math.min(window.innerWidth - (MX.Device.isPhone() ? 56 : 80), window.innerHeight - (MX.Device.isPhone() ? 450 : 560)), 200, 520));
      P.status = h('div', { class: 'spstatus', 'data-role': 'stroke-status' });
      P.cv = h('canvas', { class: 'sp-cv', 'data-role': 'stroke-canvas', style: 'width:' + P.size + 'px;height:' + P.size + 'px' });
      P.cv.width = Math.round(P.size * P.dpr); P.cv.height = Math.round(P.size * P.dpr);
      body.appendChild(P.status);
      body.appendChild(P.cv);
      var sp = MX.Form.seg([['slow', MX.t('慢')], ['mid', MX.t('中')], ['fast', MX.t('快')]], SPEEDS[settings().strokeSpeed] ? settings().strokeSpeed : 'mid', function (v) {
        settings().strokeSpeed = v; MX.Model.saveSettings();
        if (P.mode === 'anim') { stopTimer(); schedule(); }
      });
      sp.setAttribute('data-role', 'speed');
      body.appendChild(h('div', { class: 'spctl' }, [
        h('button', { type: 'button', text: MX.t('重播'), 'data-act': 'replay', onclick: function () { remember('anim'); play(); } }),
        h('div', { class: 'sprow' }, [h('span', { class: 'lbl', text: MX.t('逐筆') }),
          MX.btn({ label: MX.t('上一筆'), icon: 'tri-l', act: 'step-prev', onclick: function () { remember('step'); toStatic(prevTarget()); } }),
          MX.btn({ label: MX.t('下一筆'), icon: 'tri-r', iconRight: true, act: 'step-next', onclick: function () { remember('step'); toStatic(P.n + 1); } })]),
        h('div', { class: 'sprow' }, [h('span', { class: 'lbl', text: MX.t('速度') }), sp])
      ]));
      body.appendChild(frames());
      body.appendChild(h('div', { class: 'note', 'data-role': 'stroke-note', text: MX.t('筆順依資料集（大陸標準），部分繁體字可能與臺灣標準不同。資料：Make Me a Hanzi／文鼎字型（Arphic Public License）。') }));
      paint(); syncUi();
    }

    // ---- characters: 上一字 / 下一字 step through the reading order of the practice view (title and 落款 cells included; punctuation is not a cell)
    function remember(m) { if (settings().strokeMode !== m) { settings().strokeMode = m; MX.Model.saveSettings(); } }
    function navBox() {
      var nv = P.nav;
      if (!nv) return null;
      var N = nv.cells.length, i = nv.idx, j, ctx = h('div', { class: 'spctx', 'data-role': 'stroke-ctx', 'data-zh': '', style: 'font-family:' + MX.Draw.uiFam(P.script) });
      var prev = MX.btn({ label: MX.t('上一字'), icon: 'tri-l', act: 'char-prev', iconSize: 18, onclick: function () { stepChar(-1); } });
      var next = MX.btn({ label: MX.t('下一字'), icon: 'tri-r', iconRight: true, act: 'char-next', iconSize: 18, onclick: function () { stepChar(1); } });
      prev.disabled = i <= 0; next.disabled = i >= N - 1;
      prev.setAttribute('aria-label', MX.t('上一字')); next.setAttribute('aria-label', MX.t('下一字'));
      for (j = Math.max(0, i - 2); j <= Math.min(N - 1, i + 2); j++) ctx.appendChild(h('span', { class: j === i ? 'cur' : '', text: nv.cells[j].ch }));
      return h('div', { class: 'spnav', 'data-role': 'stroke-nav' }, [
        h('div', { class: 'sprow big' }, [prev, next]),
        h('div', { class: 'sprow pos' }, [h('div', { class: 'sppos', 'data-role': 'stroke-pos', text: MX.t('第 {i} / {n} 字', { i: i + 1, n: N }) }), ctx])
      ]);
    }
    function start() { if (settings().strokeMode === 'step') toStatic(P.rec.n); else play(); }
    function loadChar(ch) {
      stopTimer();
      var tok = ++P.tok;
      P.ch = ch; P.rec = null; P.state = 'loading'; P.n = 0; P.part = null; P.mode = 'idle'; P.i = 0; P.ovPage = 0;
      titleEl.textContent = MX.t('筆順 · {ch}', { ch: ch });
      build();
      St.get(ch).then(function (rec) {
        if (cur !== P || tok !== P.tok) return;
        P.rec = rec; P.state = rec ? 'ok' : 'nodata';
        build();
        if (rec) start();
      }).catch(function (e) {
        MX.err(e);
        if (cur !== P || tok !== P.tok) return;
        P.state = 'error'; build();
      });
    }
    function stepChar(d) {
      var nv = P.nav;
      if (!nv) return;
      var i = MX.clamp(nv.idx + d, 0, nv.cells.length - 1);
      if (i === nv.idx) return;
      nv.idx = i;
      loadChar(nv.cells[i].ch);
    }
    P.stepChar = stepChar;
    function keyDir(k, c) {
      if (k === 'ArrowLeft' || k === 'PageUp' || k === 'AudioVolumeUp' || k === 'VolumeUp' || c === 24) return -1;
      if (k === 'ArrowRight' || k === 'PageDown' || k === 'AudioVolumeDown' || k === 'VolumeDown' || c === 25) return 1;
      return 0;
    }
    function onKey(e) { var d = keyDir(e.key, e.keyCode); if (cur === P && P.nav && d) { e.preventDefault(); e.stopPropagation(); stepChar(d); } }
    function onMoKey(e) { if (cur === P && P.nav && (e.detail === 'next' || e.detail === 'prev')) stepChar(e.detail === 'next' ? 1 : -1); }
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('mo-key', onMoKey);
    P.play = play; P.toStatic = toStatic;
    loadChar(P.ch);
    return api;
  }
  function close() {
    if (!cur) return;
    var p = cur;
    cur = null;
    clearTimeout(p.timer);
    p.api.close();
  }

  MX.StrokePop = {
    open: open, close: close, isOpen: function () { return !!cur; },
    info: function () {
      if (!cur) return null;
      var P = cur;
      return { ch: P.ch, idx: P.nav ? P.nav.idx : -1, state: P.state, strokes: P.rec ? P.rec.n : 0, n: P.n, mode: P.mode, steps: P.steps, redraws: P.redraws, ovPage: P.ovPage, size: P.size, dpr: P.dpr,
        speed: settings().strokeSpeed, ms: (MX.test && MX.test.strokeMs) || SPEEDS[settings().strokeSpeed] || SPEEDS.mid };
    }
  };
})();
