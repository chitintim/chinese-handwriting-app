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
    var P = { ch: o.ch, script: o.script === 'simp' ? 'simp' : 'trad', rec: null, n: 0, part: null, mode: 'idle', i: 0, k: 0, steps: 0, redraws: 0, ovPage: 0, timer: null, size: 200, dpr: 1, cv: null, status: null, state: 'loading' };
    var body = h('div', { class: 'spbody', 'data-role': 'stroke-body' });
    var api = MX.modal({
      body: [h('div', { class: 'sheethead' }, [h('h2', { class: 'grow', text: '筆順 · ' + P.ch, 'data-role': 'stroke-title' }),
        h('button', { class: 'on', text: '關閉', 'data-act': 'close', onclick: function () { close(); } })]), body],
      onClose: function () { stopTimer(); if (cur === P) cur = null; if (o.onClose) o.onClose(); }
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
      if (P.mode === 'anim') return '第 ' + Math.min(P.i + 1, N) + ' / ' + N + ' 畫';
      return '共 ' + N + ' 畫' + (P.n > 0 && P.n < N ? ' · 已看 ' + P.n : '');
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
          row.appendChild(h('button', { type: 'button', class: 'spf', 'data-act': 'frame', 'data-k': String(kk), title: '第 ' + kk + ' 畫', onclick: function () { toStatic(kk); } },
            [c, h('div', { class: 'cap', text: caption(kk) })]));
        })(k);
      }
      var box = h('div', { 'data-role': 'stroke-overview', 'data-page': String(P.ovPage), 'data-pages': String(pages) }, [row]);
      if (pages > 1) {
        box.appendChild(h('div', { class: 'btnrow spov' }, [
          MX.btn({ label: '上頁', icon: 'tri-l', act: 'ov-prev', disabled: P.ovPage <= 0, onclick: function () { P.ovPage--; build(); } }),
          h('div', { class: 'ctr', 'data-role': 'ov-ctr', text: (P.ovPage + 1) + ' / ' + pages }),
          MX.btn({ label: '下頁', icon: 'tri-r', iconRight: true, act: 'ov-next', disabled: P.ovPage >= pages - 1, onclick: function () { P.ovPage++; build(); } })
        ]));
      }
      return box;
    }
    function build() {
      body.innerHTML = '';
      P.cv = null; P.status = null;
      if (P.state === 'loading') { body.appendChild(h('p', { text: '載入中…', 'data-role': 'stroke-loading' })); return; }
      if (P.state !== 'ok') {
        body.appendChild(h('p', { class: 'spnodata', 'data-role': P.state === 'nodata' ? 'stroke-nodata' : 'stroke-error', text: P.state === 'nodata'
          ? '找不到「' + P.ch + '」的筆順資料。' : '筆順資料無法載入（離線且尚未下載過？）。連上網路後再試一次。' }));
        return;
      }
      P.dpr = dprNow();
      P.size = Math.floor(MX.clamp(Math.min(window.innerWidth - (MX.Device.isPhone() ? 56 : 80), window.innerHeight - (MX.Device.isPhone() ? 360 : 470)), 200, 520));
      P.status = h('div', { class: 'spstatus', 'data-role': 'stroke-status' });
      P.cv = h('canvas', { class: 'sp-cv', 'data-role': 'stroke-canvas', style: 'width:' + P.size + 'px;height:' + P.size + 'px' });
      P.cv.width = Math.round(P.size * P.dpr); P.cv.height = Math.round(P.size * P.dpr);
      body.appendChild(P.status);
      body.appendChild(P.cv);
      var sp = MX.Form.seg([['slow', '慢'], ['mid', '中'], ['fast', '快']], SPEEDS[settings().strokeSpeed] ? settings().strokeSpeed : 'mid', function (v) {
        settings().strokeSpeed = v; MX.Model.saveSettings();
        if (P.mode === 'anim') { stopTimer(); schedule(); }
      });
      sp.setAttribute('data-role', 'speed');
      body.appendChild(h('div', { class: 'spctl' }, [
        h('button', { type: 'button', text: '重播', 'data-act': 'replay', onclick: play }),
        h('div', { class: 'sprow' }, [h('span', { class: 'lbl', text: '逐筆' }),
          MX.btn({ label: '上一筆', icon: 'tri-l', act: 'step-prev', onclick: function () { toStatic(prevTarget()); } }),
          MX.btn({ label: '下一筆', icon: 'tri-r', iconRight: true, act: 'step-next', onclick: function () { toStatic(P.n + 1); } })]),
        h('div', { class: 'sprow' }, [h('span', { class: 'lbl', text: '速度' }), sp])
      ]));
      body.appendChild(frames());
      body.appendChild(h('div', { class: 'note', 'data-role': 'stroke-note', text: '筆順依資料集（大陸標準），部分繁體字可能與臺灣標準不同。資料：Make Me a Hanzi／文鼎字型（Arphic Public License）。' }));
      paint(); syncUi();
    }

    St.get(P.ch).then(function (rec) {
      if (cur !== P) return;
      P.rec = rec; P.state = rec ? 'ok' : 'nodata';
      build();
      if (rec) play();
    }).catch(function (e) {
      MX.err(e);
      if (cur !== P) return;
      P.state = 'error'; build();
    });
    build();
    P.play = play; P.toStatic = toStatic;
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
      return { ch: P.ch, state: P.state, strokes: P.rec ? P.rec.n : 0, n: P.n, mode: P.mode, steps: P.steps, redraws: P.redraws, ovPage: P.ovPage, size: P.size, dpr: P.dpr,
        speed: settings().strokeSpeed, ms: (MX.test && MX.test.strokeMs) || SPEEDS[settings().strokeSpeed] || SPEEDS.mid };
    }
  };
})();
