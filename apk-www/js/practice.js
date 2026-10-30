(function () {
  'use strict';
  var MX = window.MX, h = MX.h, Draw = MX.Draw, Layout = MX.Layout, Model = MX.Model;
  var S = null;          // active practice state
  var showSeq = 0;

  function settings() { return Model.settings; }
  function bridge() { return window.MoBridge || null; }
  function keepOn(v) {
    try { var b = bridge(); if (b && typeof b.keepScreenOn === 'function') b.keepScreenOn(!!v); } catch (e) { MX.err(e); }
  }
  function inkBase() { return Draw.INK_W[settings().inkWidth] || Draw.INK_W.mid; }

  // ------------------------------------------------------------------ show / hide
  var P = MX.Practice = {
    show: async function (root, copyId, opts) {
      P.hide();
      var seq = ++showSeq;
      var copy = Model.copies[copyId];
      if (!copy) { location.hash = '#/'; return; }
      if (copy.status === 'archived') opts = { readOnly: true };   // e.g. Back after 新抄一遍: never edit an archived copy
      var text;
      try { text = await MX.Library.getText(copy.textId); } catch (e) {
        root.appendChild(h('div', { class: 'screen' }, [h('h1', { text: '無法載入文本' }), h('p', { text: String(e.message || e) }),
          h('button', { text: '返回', onclick: function () { location.hash = '#/'; } })]));
        return;
      }
      if (seq !== showSeq) return;
      Model.loadInk(copy);
      var cells = Layout.buildCells(text, copy.cfg, copy.signStr);
      copy.total = cells.length;
      Model.recount(copy);
      if (!(opts && opts.readOnly) && copy.status !== 'archived') {
        // resume at the page holding the first empty cell (a finished copy keeps its last position)
        for (var ei = 0; ei < cells.length; ei++) if (!(copy.ink[ei] || []).length) { copy.pos = ei; break; }
      }
      S = {
        root: h('div', { class: 'practice' }), copy: copy, text: text, cells: cells, readOnly: !!(opts && opts.readOnly),
        cfg: copy.cfg, g: null, pages: [], pageIdx: 0, slotOf: {}, dpr: 1, token: 0,
        active: null, stroke: null, erasing: null, ops: [], focus: -1, penSeen: false, lastPen: 0, tick: 0,
        pressureSeen: false, lastP: 0, hint: -1, timers: {}, nextBtn: null, banner: null, rect: null, listeners: []
      };
      root.appendChild(S.root);
      S.bar = h('div', { class: 'pbar' });
      S.stage = h('div', { class: 'stage' });
      S.bg = h('canvas', { id: 'bg' });
      S.ink = h('canvas', { id: 'ink' });
      S.stage.appendChild(S.bg); S.stage.appendChild(S.ink);
      S.root.appendChild(S.bar); S.root.appendChild(S.stage);
      S.bgx = S.bg.getContext('2d');
      try { S.inkx = S.ink.getContext('2d', { desynchronized: true }); } catch (e) { S.inkx = null; }
      if (!S.inkx) S.inkx = S.ink.getContext('2d');
      attach();
      layout();
      keepOn(true);
    },
    hide: function () {
      if (!S) return;
      var s = S;
      flush();
      s.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
      Object.keys(s.timers).forEach(function (k) { clearTimeout(s.timers[k]); });
      if (s.root.parentNode) s.root.parentNode.removeChild(s.root);
      S = null;
      keepOn(false);
    },
    active: function () { return !!S; },
    next: function () { goRel(1); },
    prev: function () { goRel(-1); },
    refresh: refresh
  };

  function on(target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    S.listeners.push([target, type, fn, opt]);
  }
  function attach() {
    var ink = S.ink;
    on(ink, 'pointerdown', onDown);
    on(ink, 'pointermove', onMove);
    on(ink, 'pointerup', onUp);
    on(ink, 'pointercancel', onUp);
    on(ink, 'lostpointercapture', onUp);
    on(ink, 'contextmenu', function (e) { e.preventDefault(); });
    on(ink, 'pointerover', function (e) { if (e.pointerType === 'pen') { S.lastPen = Date.now(); S.penSeen = true; } });
    on(window, 'resize', onResize);
    on(window, 'orientationchange', onResize);
    on(document, 'keydown', onKey);
    on(window, 'mo-key', function (e) {
      var d = e.detail;
      if (d === 'next') goRel(1); else if (d === 'prev') goRel(-1);
    });
    on(document, 'visibilitychange', function () { if (document.hidden) flush(); });
    on(window, 'pagehide', flush);
  }
  var onResize = MX.debounce(function () {
    if (!S) return;
    if (S.active !== null) { onResize(); return; }
    layout();
  }, 150);

  // ------------------------------------------------------------------ layout & render
  function pageOf(pos) {
    for (var i = 0; i < S.pages.length; i++) if (S.pages[i].indexOf(pos) >= 0) return i;
    return 0;
  }
  function firstIdx(page) {
    for (var i = 0; i < page.length; i++) if (page[i] >= 0) return page[i];
    return 0;
  }
  function lastIdx(page) {
    for (var i = page.length - 1; i >= 0; i--) if (page[i] >= 0) return page[i];
    return -1;
  }
  function buildBar() {
    var land = S.root.className.indexOf('land') >= 0;
    var vert = S.cfg.dir === 'v';
    var bar = S.bar;
    bar.innerHTML = '';
    function btn(label, act, fn, extra) {
      var b = h('button', { type: 'button', text: label, 'data-act': act, onclick: fn, class: extra || '' });
      return b;
    }
    S.btnPrev = btn(land ? '▲ 上一頁' : (vert ? '上一頁 ▶' : '◀ 上一頁'), 'prev', function () { goRel(-1); });
    S.btnNext = btn(land ? '▼ 下一頁' : (vert ? '◀ 下一頁' : '下一頁 ▶'), 'next', function () { goRel(1); });
    S.counter = h('div', { class: 'ctr', 'data-role': 'counter' });
    var first, second;
    if (!land && vert) { first = S.btnNext; second = S.btnPrev; } else { first = S.btnPrev; second = S.btnNext; }
    bar.appendChild(first); bar.appendChild(S.counter); bar.appendChild(second);
    if (S.readOnly) {
      bar.appendChild(btn('匯出', 'export', function () { openExport(); }));
      bar.appendChild(btn('返回', 'back', function () { history.back(); }));
      return;
    }
    bar.appendChild(btn('撤銷', 'undo', undo));
    bar.appendChild(btn('清頁', 'clear', clearPage));
    if (S.cfg.mode === 'recall') bar.appendChild(btn('提示', 'hint', hint));
    bar.appendChild(btn('刷新', 'refresh', function () { refresh(); }));
    bar.appendChild(btn('設定', 'settings', openSettings));
    bar.appendChild(btn('返回', 'back', function () { flush(); location.hash = '#/'; }));
  }

  function layout() {
    if (!S) return;
    var land = window.innerWidth >= window.innerHeight;
    S.root.className = 'practice ' + (land ? 'land' : 'port');
    buildBar();
    var r = S.stage.getBoundingClientRect();
    var W = Math.floor(r.width), H = Math.floor(r.height);
    if (W < 40 || H < 40) return;
    S.g = Layout.grid(W, H, S.cfg);
    S.pages = Layout.paginate(S.cells, S.g.perPage);
    S.dpr = Math.min(window.devicePixelRatio || 1, settings().perf ? 1 : 2);
    // The grid/template canvas uses the real device pixel ratio (up to 3) so 1-device-pixel dots map 1:1 to screen pixels; resampling would
    // turn them grey (and a fast e-ink mode would drop them). The ink canvas keeps the cheaper cap.
    S.bdpr = Math.min(window.devicePixelRatio || 1, settings().perf ? 1 : 3);
    [[S.bg, S.bdpr], [S.ink, S.dpr]].forEach(function (a) {
      var c = a[0];
      c.style.width = W + 'px'; c.style.height = H + 'px';
      c.width = Math.round(W * a[1]); c.height = Math.round(H * a[1]);
    });
    S.bgx.setTransform(S.bdpr, 0, 0, S.bdpr, 0, 0);
    S.inkx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    S.pageIdx = pageOf(S.copy.pos || 0);
    renderPage();
  }

  function slotOrigin(s) {
    var cr = Layout.slotToColRow(S.g, s);
    return { x: S.g.ox + cr.col * S.g.cell, y: S.g.oy + cr.row * S.g.cell, col: cr.col, row: cr.row };
  }
  function drawBg(withTpl) {
    var g = S.g, page = S.pages[S.pageIdx], st = settings();
    S.bgx.clearRect(0, 0, g.W, g.H);
    var color = Draw.TONE[st.tplTone] || Draw.TONE.mid, gr = Draw.gridOf(S.cfg);
    for (var s = 0; s < page.length; s++) {
      var idx = page[s];
      if (idx < 0) continue;
      var o = slotOrigin(s);
      Draw.cell(S.bgx, o.x, o.y, g.cell, S.cells[idx], {
        box: gr.box, guide: gr.guide, gstyle: gr.style, look: st.gridLook, density: st.gridDensity, dpr: S.bdpr, tplScale: Draw.tplScale(st.tplSize), font: st.tplFont,
        mode: S.cfg.mode, script: S.cfg.script, tplStyle: st.tplStyle, tplColor: color,
        punct: S.cfg.punct === 'show', tpl: withTpl && (S.cfg.mode === 'trace' || idx === S.hint)
      });
    }
  }
  function renderPage() {
    S.token++;
    var tk = S.token, page = S.pages[S.pageIdx];
    S.hint = -1;
    S.slotOf = {};
    page.forEach(function (idx, s) { if (idx >= 0) S.slotOf[idx] = s; });
    hideNext();
    drawBg(false);
    if (Draw.fontsLoaded(S.cfg.script, settings().tplFont)) drawBg(true);
    else {
      var chars = page.map(function (i) { return i >= 0 ? S.cells[i].ch + S.cells[i].punct : ''; }).join('');
      Draw.fontsReady(S.cfg.script, chars, settings().tplFont).then(function () { if (S && tk === S.token) drawBg(true); });
    }
    redrawInk();
    updateUi();
    S.root.setAttribute('data-page', S.pageIdx);
  }
  function redrawInk() {
    var g = S.g, ctx = S.inkx, base = inkBase();
    ctx.clearRect(0, 0, g.W, g.H);
    var page = S.pages[S.pageIdx];
    for (var s = 0; s < page.length; s++) {
      var idx = page[s];
      if (idx < 0) continue;
      var strokes = S.copy.ink[idx];
      if (!strokes) continue;
      var o = slotOrigin(s);
      for (var i = 0; i < strokes.length; i++) Draw.paintFull(ctx, strokes[i], o.x, o.y, g.cell / 1000, base);
    }
  }
  function updateUi() {
    S.counter.textContent = (S.pageIdx + 1) + ' / ' + S.pages.length;
    S.btnPrev.disabled = S.pageIdx <= 0;
    S.btnNext.disabled = S.pageIdx >= S.pages.length - 1;
  }

  // ------------------------------------------------------------------ navigation
  function go(i) {
    if (!S || S.active !== null) return;
    i = MX.clamp(i, 0, S.pages.length - 1);
    if (i === S.pageIdx) return;
    flush();
    S.pageIdx = i;
    S.copy.pos = firstIdx(S.pages[i]);
    Model.saveMeta(S.copy);
    renderPage();
  }
  function goRel(d) { if (S) go(S.pageIdx + d); }
  function onKey(e) {
    if (!S || document.querySelector('.modal-bg')) return;
    var k = e.key, c = e.keyCode, d = 0, vert = S.cfg.dir === 'v';
    if (k === 'ArrowLeft') d = vert ? 1 : -1;
    else if (k === 'ArrowRight') d = vert ? -1 : 1;
    else if (k === 'PageDown' || k === 'AudioVolumeDown' || k === 'VolumeDown' || c === 25) d = 1;
    else if (k === 'PageUp' || k === 'AudioVolumeUp' || k === 'VolumeUp' || c === 24) d = -1;
    if (d) { e.preventDefault(); goRel(d); }
  }

  // ------------------------------------------------------------------ save
  function flush() {
    if (!S) return;
    clearTimeout(S.timers.save);
    Model.flush(S.copy);
  }
  function scheduleSave() {
    clearTimeout(S.timers.save);
    S.timers.save = setTimeout(flush, 600);
  }

  // ------------------------------------------------------------------ pointer input
  function hit(x, y) {
    var g = S.g, col = Math.floor((x - g.ox) / g.cell), row = Math.floor((y - g.oy) / g.cell);
    if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return -1;
    var s = Layout.colRowToSlot(g, col, row);
    var idx = S.pages[S.pageIdx][s];
    return idx === undefined ? -1 : idx;
  }
  function tickTime(isDown) {
    var now = Date.now();
    if (S.tick) {
      var d = now - S.tick;
      if (isDown) S.copy.activeMs += Math.min(d, 8000); else if (d < 3000) S.copy.activeMs += d;
    }
    S.tick = now;
  }
  function pressureOf(ev) {
    if (ev.pointerType !== 'pen' || settings().pressure === 'off') return 500;
    var pr = ev.pressure;
    if (pr > 0 && pr !== 0.5) S.pressureSeen = true;
    if (!S.pressureSeen) return 500;
    if (!(pr > 0)) return S.lastP || 500;
    var p = Math.round(pr * 1000);
    if (S.lastP) p = Math.round(S.lastP * 0.4 + p * 0.6);
    S.lastP = p;
    return p;
  }
  function addPoint(ev) {
    var st = S.stroke, g = S.g;
    var lx = Math.round((ev.clientX - S.rect.left - st.cx) / g.cell * 1000);
    var ly = Math.round((ev.clientY - S.rect.top - st.cy) / g.cell * 1000);
    var n = st.pts.length;
    if (n >= 3 && st.pts[n - 3] === lx && st.pts[n - 2] === ly) return false;
    st.pts.push(lx, ly, pressureOf(ev));
    return true;
  }
  function paintNew(fin) {
    var st = S.stroke, n = st.pts.length / 3;
    Draw.paint(S.inkx, st.pts, st.cx, st.cy, S.g.cell / 1000, st.drawn + 1, n - 1, fin, inkBase());
    st.drawn = n - 1;
  }
  function allowed(e) {
    if (e.pointerType === 'pen') return true;
    if (!settings().acceptTouch) return false;
    if (Math.max(e.width || 0, e.height || 0) > 45) return false;   // big contact area = palm
    return Date.now() - S.lastPen > 1500;   // palm rejection while a pen is around
  }
  function onDown(e) {
    if (!S || S.readOnly) return;
    var isPen = e.pointerType === 'pen';
    if (isPen) { S.lastPen = Date.now(); S.penSeen = true; }
    if (S.active !== null) {
      // a new pointer while one is down: ignore (palm), unless the pen arrives or the old pointer went silent (lost pointerup)
      if (!isPen && Date.now() - S.lastEv < 1500) return;
      finish(true);
    }
    if (!allowed(e)) {
      if (!isPen && !S.penSeen && !settings().acceptTouch && !settings().touchPrompted) showTouchPrompt();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 5) return;
    S.rect = S.ink.getBoundingClientRect();
    var x = e.clientX - S.rect.left, y = e.clientY - S.rect.top;
    var idx = hit(x, y);
    if (idx < 0) return;
    e.preventDefault();
    S.active = e.pointerId;
    S.activeType = e.pointerType;
    S.lastEv = Date.now();
    try { S.ink.setPointerCapture(e.pointerId); } catch (x2) { /* synthetic pointer */ }
    hideNext();
    tickTime(true);
    if (S.hint >= 0) { S.hint = -1; drawBg(true); }
    S.focus = idx;
    if ((e.buttons & 32) || e.button === 5) {
      S.erasing = { items: [] };
      eraseAt(x, y);
      return;
    }
    var o = slotOrigin(S.slotOf[idx]);
    S.stroke = { idx: idx, cx: o.x, cy: o.y, pts: [], drawn: 0 };
    S.lastP = 0;
    addPoint(e);
    paintNew(false);
  }
  function events(e) {
    var list = null;
    if (typeof e.getCoalescedEvents === 'function') {
      try { list = e.getCoalescedEvents(); } catch (x) { list = null; }
    }
    return list && list.length ? list : [e];
  }
  function onMove(e) {
    if (!S) return;
    if (e.pointerType === 'pen') { S.lastPen = Date.now(); S.penSeen = true; }
    if (S.active === null || e.pointerId !== S.active) return;
    S.lastEv = Date.now();
    tickTime(false);
    var evs = events(e), i;
    if (S.erasing) {
      for (i = 0; i < evs.length; i++) eraseAt(evs[i].clientX - S.rect.left, evs[i].clientY - S.rect.top);
      return;
    }
    var added = false;
    for (i = 0; i < evs.length; i++) if (addPoint(evs[i])) added = true;
    if (added) paintNew(false);
  }
  function onUp(e) {
    if (!S || S.active === null || e.pointerId !== S.active) return;
    if (e.type === 'pointerup' && S.stroke) {
      tickTime(false);
      var st = S.stroke, p = st.pts.length;
      // final position (pressure of the up event is meaningless -> reuse last)
      var lp = p ? st.pts[p - 1] : 500;
      var lx = Math.round((e.clientX - S.rect.left - st.cx) / S.g.cell * 1000);
      var ly = Math.round((e.clientY - S.rect.top - st.cy) / S.g.cell * 1000);
      if (p && (st.pts[p - 3] !== lx || st.pts[p - 2] !== ly)) st.pts.push(lx, ly, lp);
    }
    finish(false);
  }
  function finish(cancelled) {
    var wasErase = S.erasing, wasType = S.activeType;
    S.active = null; S.activeType = null;
    if (wasErase) {
      S.erasing = null;
      if (wasErase.items.length) { pushOp({ k: 'del', items: wasErase.items }); scheduleSave(); afterChange(); }
      return;
    }
    var st = S.stroke;
    if (!st) return;
    S.stroke = null;
    if (!st.pts.length) return;
    if (cancelled && wasType !== 'pen') { redrawInk(); return; }   // a pen took over from a touch/palm stroke: drop it
    Draw.paint(S.inkx, st.pts, st.cx, st.cy, S.g.cell / 1000, st.drawn + 1, st.pts.length / 3 - 1, true, inkBase());
    var arr = S.copy.ink[st.idx] || (S.copy.ink[st.idx] = []);
    arr.push(st.pts);
    pushOp({ k: 'add', cell: st.idx, stroke: st.pts });
    Model.markDirty(S.copy, st.idx);
    scheduleSave();
    afterChange();
    armNext();
  }
  function pushOp(op) { S.ops.push(op); if (S.ops.length > 400) S.ops.shift(); }
  function afterChange() {
    Model.recount(S.copy);
    if (!S.copy.completedAt && S.copy.total > 0 && S.copy.filled >= S.copy.total) complete();
  }

  // ------------------------------------------------------------------ erasing
  function strokeHit(pts, ox, oy, sc, x, y, r) {
    var n = pts.length / 3, i;
    var px = ox + pts[0] * sc, py = oy + pts[1] * sc;
    if (n === 1) return Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) <= r;
    for (i = 1; i < n; i++) {
      var qx = ox + pts[i * 3] * sc, qy = oy + pts[i * 3 + 1] * sc;
      var dx = qx - px, dy = qy - py, l2 = dx * dx + dy * dy, t = l2 ? ((x - px) * dx + (y - py) * dy) / l2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var cx = px + t * dx - x, cy = py + t * dy - y;
      if (cx * cx + cy * cy <= r * r) return true;
      px = qx; py = qy;
    }
    return false;
  }
  function eraseAt(x, y) {
    var g = S.g, page = S.pages[S.pageIdx], r = Math.max(10, g.cell * 0.05), removed = false;
    for (var s = 0; s < page.length; s++) {
      var idx = page[s];
      if (idx < 0) continue;
      var strokes = S.copy.ink[idx];
      if (!strokes || !strokes.length) continue;
      var o = slotOrigin(s);
      if (x < o.x - g.cell * 0.3 || x > o.x + g.cell * 1.3 || y < o.y - g.cell * 0.3 || y > o.y + g.cell * 1.3) continue;
      for (var i = strokes.length - 1; i >= 0; i--) {
        if (strokeHit(strokes[i], o.x, o.y, g.cell / 1000, x, y, r)) {
          S.erasing.items.push({ cell: idx, index: i, stroke: strokes[i] });
          strokes.splice(i, 1);
          Model.markDirty(S.copy, idx);
          removed = true;
        }
      }
    }
    if (removed) { redrawInk(); }
  }

  // ------------------------------------------------------------------ toolbar actions
  function pageHas(idx) { return S.slotOf[idx] !== undefined; }
  function undo() {
    if (!S || S.active !== null) return;
    var i, op, k;
    for (i = S.ops.length - 1; i >= 0; i--) {
      op = S.ops[i];
      var ok = op.k === 'add' ? pageHas(op.cell) : op.items.every(function (it) { return pageHas(it.cell); });
      if (!ok) continue;
      S.ops.splice(i, 1);
      if (op.k === 'add') {
        var arr = S.copy.ink[op.cell] || [], at = arr.indexOf(op.stroke);
        if (at < 0) { i = S.ops.length; continue; }
        arr.splice(at, 1);
        Model.markDirty(S.copy, op.cell);
      } else {
        for (k = op.items.length - 1; k >= 0; k--) {
          var it = op.items[k], a = S.copy.ink[it.cell] || (S.copy.ink[it.cell] = []);
          a.splice(Math.min(it.index, a.length), 0, it.stroke);
          Model.markDirty(S.copy, it.cell);
        }
      }
      return undone();
    }
    // fallback after a reload: drop the last stroke of the focus cell / last inked cell on this page
    var page = S.pages[S.pageIdx], target = -1;
    if (S.focus >= 0 && pageHas(S.focus) && (S.copy.ink[S.focus] || []).length) target = S.focus;
    else for (k = page.length - 1; k >= 0; k--) if (page[k] >= 0 && (S.copy.ink[page[k]] || []).length) { target = page[k]; break; }
    if (target < 0) { MX.toast('沒有可撤銷的筆畫'); return; }
    S.copy.ink[target].pop();
    Model.markDirty(S.copy, target);
    undone();
  }
  function undone() {
    Model.recount(S.copy);
    redrawInk(); scheduleSave(); hideNext();
  }
  async function clearPage() {
    if (!S || S.active !== null) return;
    var page = S.pages[S.pageIdx], items = [];
    page.forEach(function (idx) {
      if (idx < 0) return;
      (S.copy.ink[idx] || []).forEach(function (st, i) { items.push({ cell: idx, index: i, stroke: st }); });
    });
    if (!items.length) { MX.toast('此頁沒有字跡'); return; }
    var ok = await MX.confirm('清除此頁所有字跡？（可用「撤銷」還原）', '清除', '清頁');
    if (!ok || !S) return;
    page.forEach(function (idx) {
      if (idx >= 0 && S.copy.ink[idx] && S.copy.ink[idx].length) { S.copy.ink[idx] = []; Model.markDirty(S.copy, idx); }
    });
    pushOp({ k: 'del', items: items });
    Model.recount(S.copy);
    redrawInk(); scheduleSave(); hideNext();
  }
  function hint() {
    if (!S || S.cfg.mode !== 'recall') return;
    var page = S.pages[S.pageIdx], t = -1, i;
    for (i = 0; i < page.length; i++) if (page[i] >= 0 && !(S.copy.ink[page[i]] || []).length) { t = page[i]; break; }
    if (t < 0) t = S.focus;
    if (t < 0) return;
    S.hint = t;
    drawBg(true);
  }
  function refresh() {
    return new Promise(function (resolve) {
      var d = h('div', { class: 'flash', style: 'background:#000', 'data-role': 'flash' });
      MX.layer().appendChild(d);
      setTimeout(function () {
        d.style.background = '#fff';
        setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); resolve(); }, 220);
      }, 260);
    });
  }

  // ------------------------------------------------------------------ auto-advance, touch prompt
  function hideNext() {
    if (!S) return;
    clearTimeout(S.timers.next);
    if (S.nextBtn && S.nextBtn.parentNode) S.nextBtn.parentNode.removeChild(S.nextBtn);
    S.nextBtn = null;
  }
  // Page complete = every cell of the page has ink.
  function pageFull(page) {
    var n = 0;
    for (var i = 0; i < page.length; i++) {
      if (page[i] < 0) continue;
      n++;
      if (!(S.copy.ink[page[i]] || []).length) return false;
    }
    return n > 0;
  }
  // Called after a stroke: if the page is now full, turn to the next page after the idle delay (one instant step, no animation).
  // Any new pen-down (hideNext), page change, undo or clear cancels it. Never from the last page; only after writing on this page.
  function armFlip() {
    clearTimeout(S.timers.next);
    var st = settings();
    if (S.readOnly || !st.autoFlip || S.pageIdx >= S.pages.length - 1 || !pageFull(S.pages[S.pageIdx])) return false;
    var seq = S.token, ms = (parseInt(st.flipDelay, 10) || 2) * 1000;
    if (MX.test && MX.test.flipMs) ms = MX.test.flipMs;
    S.timers.next = setTimeout(function () {
      if (!S || S.token !== seq || S.active !== null || document.querySelector('.modal-bg')) return;
      if (!pageFull(S.pages[S.pageIdx]) || S.pageIdx >= S.pages.length - 1) return;
      goRel(1);
    }, ms);
    return true;
  }
  function armNext() {
    if (armFlip()) return;
    clearTimeout(S.timers.next);
    if (S.readOnly || settings().autoFlip || !settings().autoNext || S.pageIdx >= S.pages.length - 1) return;
    var li = lastIdx(S.pages[S.pageIdx]);
    if (li < 0 || !(S.copy.ink[li] || []).length) return;
    var seq = S.token;
    S.timers.next = setTimeout(function () {
      if (!S || S.token !== seq || S.active !== null) return;
      S.nextBtn = h('button', { class: 'nextbtn', 'data-act': 'autonext', text: '下一頁 ▶', onclick: function () { goRel(1); } });
      S.stage.appendChild(S.nextBtn);
    }, 3000);
  }
  function showTouchPrompt() {
    if (S.banner) return;
    S.banner = h('div', { class: 'banner', 'data-role': 'touch-prompt' }, [
      h('div', { text: '筆似乎以「觸控」回報。是否允許手指／觸控書寫？' }),
      h('div', { class: 'btnrow' }, [
        h('button', { text: '允許', 'data-act': 'allow-touch', onclick: function () {
          settings().acceptTouch = true; settings().touchPrompted = true; Model.saveSettings(); closeBanner(); MX.toast('已允許觸控書寫');
        } }),
        h('button', { text: '不用', 'data-act': 'deny-touch', onclick: function () {
          settings().touchPrompted = true; Model.saveSettings(); closeBanner();
        } })
      ])
    ]);
    S.stage.appendChild(S.banner);
  }
  function closeBanner() { if (S && S.banner) { if (S.banner.parentNode) S.banner.parentNode.removeChild(S.banner); S.banner = null; } }

  // ------------------------------------------------------------------ sheets
  function cp() { return MX.Export.ctx(S.copy, S.text, S.cells); }
  function openExport() {
    MX.Export.openSheet(cp(), S.pageIdx, S.g.portrait);
  }
  function openSettings() {
    if (!S) return;
    var cfgFields = MX.Form.CFG.filter(function (f) { return !f.content; });
    var body = [
      MX.Form.build(cfgFields, S.cfg, false, function (k) {
        Model.saveMeta(S.copy); Model.saveTextCfg(S.copy.textId, S.cfg);
        S.copy.pos = firstIdx(S.pages[S.pageIdx]);
        layout();
      }),
      h('h2', { text: '筆與範本' }),
      MX.Form.build(MX.Form.SETTINGS, settings(), false, function () {
        Model.saveSettings();
        layout();
      })
    ];
    MX.modal({
      title: '設定', body: body,
      buttons: [
        { label: '匯出圖片', act: 'export', onClick: function () { openExport(); } },
        { label: '新抄一遍', act: 'newcopy', onClick: function () { newCopy(); } },
        { label: '完成', act: 'done', primary: true }
      ]
    });
  }
  async function newCopy() {
    if (!S) return;
    var c = S.copy, msg = c.completedAt ? '將目前這一遍存檔，重新開始新的一遍？' : '這一遍尚未完成。仍要存檔並重新開始？';
    var ok = await MX.confirm(msg, '新抄一遍', '新抄一遍');
    if (!ok || !S) return;
    Model.archive(c);
    location.replace('#/setup/' + c.textId + '?new=1');   // replace: Back must not return to the archived copy
  }
  function complete() {
    var c = S.copy;
    c.completedAt = Date.now();
    Model.flush(c);
    Model.addDone(c);
    var n = Model.doneCount(c.textId);
    MX.modal({
      title: '圓滿完成',
      body: [h('p', { text: '這是第 ' + n + ' 遍。用時約 ' + MX.fmtDuration(c.activeMs) + '。' })],
      buttons: [
        { label: '匯出圖片', act: 'export', onClick: function () { if (S) openExport(); } },
        { label: '新抄一遍', act: 'newcopy', onClick: function () { newCopy(); } },
        { label: '繼續', act: 'continue', primary: true }
      ]
    });
  }

  // ------------------------------------------------------------------ test hooks
  MX.test = {
    info: function () {
      if (!S) return null;
      var r = S.ink.getBoundingClientRect(), g = S.g, page = S.pages[S.pageIdx], cells = [];
      page.forEach(function (idx, s) {
        var o = slotOrigin(s);
        cells.push({ slot: s, idx: idx, ch: idx >= 0 ? S.cells[idx].ch : '', punct: idx >= 0 ? S.cells[idx].punct : '',
          col: o.col, row: o.row, x: r.left + o.x, y: r.top + o.y, size: g.cell });
      });
      return { page: S.pageIdx, pages: S.pages.length, cols: g.cols, rows: g.rows, cell: g.cell, dir: g.dir, portrait: g.portrait,
        perPage: g.perPage, total: S.cells.length, filled: S.copy.filled, cells: cells, copyId: S.copy.id, completed: !!S.copy.completedAt,
        mode: S.cfg.mode, nextBtn: !!S.nextBtn, pressureSeen: S.pressureSeen, hint: S.hint };
    },
    flipMs: 0,
    relayout: function () { if (S) layout(); },
    go: go,
    cellsAll: function () { return S ? S.cells.map(function (c) { return c.ch; }).join('') : ''; },
    inkOf: function (idx) { return S ? (S.copy.ink[idx] || []) : []; },
    setPos: function (p) { if (S) { S.copy.pos = p; layout(); } }
  };
})();
