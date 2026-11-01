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
  function inkStyle() { return MX.Ink.style(settings()); }
  var Ink = MX.Ink;
  var stats = { full: 0, region: 0, paints: 0, clears: 0 };     // instrumentation (tests): full-page ink redraws vs. region repaints

  // ------------------------------------------------------------------ show / hide
  var P = MX.Practice = {
    show: async function (root, copyId, opts) {
      P.hide();
      var seq = ++showSeq;
      var copy = Model.copies[copyId];
      if (!copy) { location.hash = '#/'; return; }
      if (copy.status === 'archived') opts = { readOnly: true };   // e.g. Back after 新抄一遍: never edit an archived copy
      var text;
      try { text = await MX.Library.getView(copy.textId, Model.sid(copy)); } catch (e) {
        // the section is gone (a copy saved before the text was split into sections): the text's section list instead of an error page; the copy is kept
        if (/^unknown section/.test(e.message || '') && (MX.Library.entry(copy.textId) || {}).sections > 1) {
          if (seq === showSeq) {
            window.addEventListener('hashchange', function () { setTimeout(function () { MX.toast('這份字帖的章節已更新，請從章節列表選擇。', 4000); }, 0); }, { once: true });     // after the route has cleared #layer
            location.replace(MX.Screens.hash('text', copy.textId));
          }
          return;
        }
        root.appendChild(h('div', { class: 'screen' }, [h('h1', { text: '無法載入文本' }), h('p', { text: String(e.message || e) }),
          h('button', { text: '返回', onclick: function () { location.hash = '#/'; } })]));
        return;
      }
      if (seq !== showSeq) return;
      Model.loadInk(copy);
      Model.upgradeKeys(copy, text);
      var cells = Layout.cellsFor(text, copy);
      Model.recount(copy, cells);
      if (!(opts && opts.readOnly) && copy.status !== 'archived') {
        // resume at the page holding the first empty cell (a finished copy keeps its last position)
        if (P.resume && P.resume.id === copy.id && P.resume.pos < cells.length) copy.pos = P.resume.pos;      // redrawn in the other layout: stay where we were
        else for (var ei = 0; ei < cells.length; ei++) if (!(copy.ink[cells[ei].key] || []).length) { copy.pos = ei; break; }
      }
      P.resume = null;
      S = {
        phone: MX.Device.isPhone(), root: h('div', { class: 'practice' }), copy: copy, text: text, cells: cells, readOnly: !!(opts && opts.readOnly),
        cfg: copy.cfg, g: null, pages: [], pageIdx: 0, slotOf: {}, dpr: 1, token: 0,
        active: null, stroke: null, erasing: null, ops: [], focus: -1, penSeen: false, lastPen: 0, tick: 0,
        cap: new Ink.Sampler(), rawOk: false, hint: -1, timers: {}, nextBtn: null, banner: null, rect: null, listeners: []
      };
      root.appendChild(S.root);
      S.bar = h('div', { class: S.phone ? 'pbtns' : 'pbar', 'data-role': S.phone ? 'phone-buttons' : null });
      S.stage = h('div', { class: 'stage' });
      S.bg = h('canvas', { id: 'bg' });
      S.ink = h('canvas', { id: 'ink' });
      S.stage.appendChild(S.bg); S.stage.appendChild(S.ink);
      if (S.phone) {
        // phone layout: context header (title, neighbouring characters, progress) / one big cell / buttons
        S.top = h('div', { class: 'ptop', 'data-role': 'phone-top' });
        S.root.appendChild(S.top); S.root.appendChild(S.stage); S.root.appendChild(S.bar);
      } else { S.root.appendChild(S.bar); S.root.appendChild(S.stage); }
      S.bgx = S.bg.getContext('2d');
      // Low-latency (desynchronized) canvas only where MX.Device.lowLatency() says so (iReader, or the 低延遲筆跡 setting): on many Android GPUs it composites the transparent ink layer as solid black.
      try { S.inkx = MX.Device.lowLatency() ? S.ink.getContext('2d', { desynchronized: true }) : S.ink.getContext('2d'); } catch (e) { S.inkx = null; }
      if (!S.inkx) S.inkx = S.ink.getContext('2d');
      attach();
      layout();
      keepOn(true);
    },
    hide: function () {
      if (!S) return;
      var s = S;
      if (MX.StrokePop) MX.StrokePop.close();
      flush();
      s.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
      Object.keys(s.timers).forEach(function (k) { clearTimeout(s.timers[k]); });
      if (s.root.parentNode) s.root.parentNode.removeChild(s.root);
      S = null;
      keepOn(false);
    },
    active: function () { return !!S; },
    busy: function () { return !!S && S.active !== null; },
    resume: null,
    rememberPos: function () { if (S) P.resume = { id: S.copy.id, pos: S.copy.pos || 0 }; },
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
    if (S.phone) {
      // no page scroll / zoom / pull-to-refresh / text selection while writing (CSS touch-action:none etc. does most; these catch the browsers that need an explicit preventDefault)
      var stop = function (e) { if (e.cancelable) e.preventDefault(); };
      on(S.stage, 'touchstart', stop, { passive: false });
      on(S.stage, 'touchmove', stop, { passive: false });
      on(S.root, 'touchmove', function (e) { if (e.target === S.stage || S.stage.contains(e.target)) stop(e); }, { passive: false });
      ['gesturestart', 'gesturechange'].forEach(function (t) { on(document, t, stop, { passive: false }); });
    }
    on(ink, 'pointerdown', onDown);
    // pointerrawupdate (Chrome 77+, secure contexts) delivers every digitizer sample as it arrives, ahead of the frame-aligned pointermove;
    // without it pointermove's coalesced events carry the same samples. Both are fed through the Sampler, which drops what it already has.
    S.rawOk = 'onpointerrawupdate' in window;
    if (S.rawOk) on(ink, 'pointerrawupdate', onMove);
    on(ink, 'pointermove', onMove);
    on(ink, 'pointerup', onUp);
    on(ink, 'pointercancel', onUp);
    on(ink, 'lostpointercapture', onUp);
    on(ink, 'contextmenu', function (e) { e.preventDefault(); });
    on(ink, 'pointerover', function (e) { if (e.pointerType === 'pen') { S.lastPen = Date.now(); S.penSeen = true; } });
    // finger double-tap -> stroke order (gesture.js). The recognizer sees every touch event first; it only ever acts in pen-only mode. Pen events anywhere on the page discard a sequence in progress.
    S.dt = new MX.Gesture.DoubleTap({ hit: hitClient, enabled: tapEnabled, onDouble: function (idx) { openStroke(idx); } });
    on(ink, 'pointerdown', function (e) { var i = hitClient(e.clientX, e.clientY); if (i >= 0) S.lastCell = i; S.dt.down(e); }, true);
    on(ink, 'pointermove', function (e) { S.dt.move(e); }, true);
    on(ink, 'pointerup', function (e) { S.dt.up(e); }, true);
    on(ink, 'pointercancel', function (e) { S.dt.cancel(e); }, true);
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerenter', 'pointerrawupdate'].forEach(function (t) {
      on(window, t, function (e) { if (S && S.dt && e.pointerType === 'pen') S.dt.pen(e); }, true);
    });
    on(window, 'resize', onResize);
    on(window, 'orientationchange', onResize);
    on(document, 'pointerdown', function (e) { if (S && S.chooser && !S.chooser.contains(e.target) && !(S.pill && S.pill.contains(e.target))) closeChooser(); }, true);
    on(document, 'keydown', onKey);
    on(window, 'mo-key', function (e) {
      var d = e.detail;
      if (MX.StrokePop && MX.StrokePop.isOpen()) return;       // the stroke-order popup uses them to step characters
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

  // ink is stored per cell KEY (body '12', title 't0', 落款 's3'); pages, focus and `pos` use the position in S.cells
  function KY(idx) { return S.cells[idx].key; }
  function dirty(idx) { Model.markDirty(S.copy, KY(idx)); }

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
  // ---- phone layout. Top bar: [返回 ... 自動 筆順 解說 設定] / section title + n / total / context strip / progress. Bottom bar (thumb): [撤銷 清除 (提示) 上一字 下一字].
  // 自動 = the auto-advance pill (settings.phoneAuto, tap = on / off, long press = the delay chooser); the delay itself is settings.flipDelay.
  function autoOn() { return settings().phoneAuto !== false; }
  function delayMs() {
    var ms = (parseFloat(settings().flipDelay) || 2) * 1000;
    if (MX.test && MX.test.flipMs) ms = MX.test.flipMs;
    return ms;
  }
  function secText(ms) { return String(Math.round(ms / 100) / 10); }
  // 電子紙 (and reduced motion): no animation, the button shows static text instead of a progress fill
  function staticPending() {
    if (settings().screenType === 'eink') return true;
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function syncPill() {
    if (!S || !S.pill) return;
    var on = autoOn();
    S.pill.setAttribute('aria-pressed', on ? 'true' : 'false');
    S.pill.firstChild.textContent = '自動 ' + (on ? '開' : '關');
  }
  function toggleAuto() {
    if (!S) return;
    settings().phoneAuto = !autoOn();
    Model.saveSettings();
    hideNext();
    syncPill();
    if (S.status) S.status.textContent = '自動下一字：' + (autoOn() ? '開' : '關');
  }
  function openChooser() {
    if (!S || S.chooser || !S.top) return;
    hideNext();
    var cur = parseFloat(settings().flipDelay) || 2;
    var row = h('div', { class: 'achoose', 'data-role': 'auto-chooser', role: 'group', 'aria-label': '自動下一字的等待時間' }, [h('span', { class: 'al', text: '等待' })]);
    [['1', '1 秒'], ['1.5', '1.5 秒'], ['2', '2 秒'], ['3', '3 秒']].forEach(function (o) {
      var sel = parseFloat(o[0]) === cur;
      row.appendChild(h('button', { type: 'button', 'data-v': o[0], class: sel ? 'on' : null, 'aria-pressed': sel ? 'true' : 'false', text: o[1], onclick: function () {
        settings().flipDelay = o[0]; Model.saveSettings(); closeChooser();
      } }));
    });
    S.top.appendChild(row);
    S.chooser = row;
  }
  function closeChooser() {
    if (!S || !S.chooser) return;
    if (S.chooser.parentNode) S.chooser.parentNode.removeChild(S.chooser);
    S.chooser = null;
  }
  // The pill sits in the top bar, outside the cell: a press on it never reaches the ink canvas, so a long press can not be a stroke.
  function buildPill() {
    var b = h('button', { type: 'button', class: 'autopill', 'data-act': 'auto', 'aria-label': '自動下一字', 'aria-haspopup': 'true', title: '點一下開關；長按設定等待時間' }, [h('span', { class: 't' })]);
    var sx = 0, sy = 0;
    function stop() { clearTimeout(S.timers.pill); }
    b.addEventListener('pointerdown', function (e) {
      S.pillLong = false; sx = e.clientX; sy = e.clientY;
      stop();
      S.timers.pill = setTimeout(function () { if (!S) return; S.pillLong = true; openChooser(); }, 500);
    });
    b.addEventListener('pointermove', function (e) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { b.addEventListener(t, stop); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); stop(); S.pillLong = true; openChooser(); });
    b.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openChooser(); } });
    b.addEventListener('click', function () {
      if (S.pillLong) { S.pillLong = false; return; }       // the long press already opened the chooser
      closeChooser();
      toggleAuto();
    });
    S.pill = b;
    syncPill();
    return b;
  }
  function buildPhoneBar() {
    var bar = S.bar, top = S.top;
    closeChooser();
    bar.innerHTML = ''; top.innerHTML = '';
    var notes = MX.Library.hasNotes(S.copy.textId, Model.sid(S.copy));
    var sc = S.cfg.script === 'simp' ? 'simp' : 'trad', tt = S.text.textTitle || S.text.title, st = S.text.sectionTitle || S.text.title;
    var title = S.text.multi ? tt[sc] + ' · ' + st[sc] : S.text.title[sc];
    S.counter = h('div', { class: 'ctr', 'data-role': 'counter' });
    S.progress = h('i', { style: 'width:0%' });
    S.progBar = h('div', { class: 'bar', 'data-role': 'phone-progress', role: 'progressbar', 'aria-label': '進度', 'aria-valuemin': '1' }, [S.progress]);
    S.ctx = h('div', { class: 'pctx', 'data-role': 'ctx-strip', style: 'font-family:' + MX.Draw.uiFam(S.cfg.script) });
    var head = h('div', { class: 'prow head' }, [
      h('button', { type: 'button', text: '返回', 'data-act': 'back', onclick: function () { flush(); if (S.readOnly) history.back(); else location.hash = MX.Screens.backFor(S.copy.textId); } }),
      h('div', { class: 'sp' })
    ]);
    S.pill = null;
    if (!S.readOnly) head.appendChild(buildPill());
    head.appendChild(h('button', { type: 'button', text: '筆順', 'data-act': 'stroke', onclick: strokeButton }));
    if (notes) head.appendChild(h('button', { type: 'button', text: '解說', 'data-act': 'notes', onclick: openNotes }));
    head.appendChild(h('button', { type: 'button', text: '匯出', 'data-act': 'export', onclick: function () { openExport(); } }));
    if (!S.readOnly) head.appendChild(h('button', { type: 'button', text: '設定', 'data-act': 'settings', onclick: openSettings }));
    top.appendChild(head);
    top.appendChild(h('div', { class: 'ptrow' }, [h('div', { class: 'ptitle', 'data-role': 'phone-title', text: title || '', style: 'font-family:' + MX.Draw.uiFam(S.cfg.script) }), S.counter]));
    top.appendChild(S.ctx);
    top.appendChild(h('div', { class: 'pprog' }, [S.progBar]));
    S.btnPrev = h('button', { type: 'button', text: '上一字', 'data-act': 'prev', onclick: function () { goRel(-1); } });
    S.nextWord = '下一字';
    S.nextLabel = h('span', { class: 'lbl', text: S.nextWord });
    S.btnNext = h('button', { type: 'button', class: 'withico', 'data-act': 'next', onclick: phoneNext }, [S.nextLabel, MX.icon('tri-r', 18)]);
    S.status = h('span', { class: 'sr', role: 'status', 'aria-live': 'polite', 'data-role': 'auto-status' });
    var row = h('div', { class: 'prow main' });
    if (!S.readOnly) {
      row.appendChild(h('button', { type: 'button', text: '撤銷', 'data-act': 'undo', onclick: undo }));
      row.appendChild(h('button', { type: 'button', text: '清除', 'data-act': 'clear', onclick: clearPage }));
      if (S.cfg.mode === 'recall') row.appendChild(h('button', { type: 'button', text: '提示', 'data-act': 'hint', onclick: hint }));
    }
    row.appendChild(S.btnPrev);
    row.appendChild(S.btnNext);
    bar.appendChild(row);
    bar.appendChild(S.status);
  }
  // the characters around the current one, in sequence (reading) order, left to right whatever the writing direction; 默 hides the current and the following ones
  function fillCtx() {
    var cur = S.pages[S.pageIdx][0], n = S.cells.length, i, c, masked, b;
    S.ctx.innerHTML = '';
    for (i = Math.max(0, cur - 3); i <= Math.min(n - 1, cur + 3); i++) {
      c = S.cells[i]; masked = S.cfg.mode === 'recall' && i >= cur;
      b = h('button', { type: 'button', class: 'cx' + (i === cur ? ' cur' : '') + (c.sec !== S.cells[cur].sec ? ' other' : ''), 'data-idx': i, 'data-cur': i === cur ? '1' : null,
        'aria-current': i === cur ? 'true' : null, 'aria-label': masked ? '第 ' + (i + 1) + ' 字（尚未顯示）' : '跳到第 ' + (i + 1) + ' 字 ' + c.ch, onclick: (function (k) { return function () { go(pageOf(k)); }; })(i) }, [h('span', { class: 'ch', text: masked ? '○' : c.ch })]);
      S.ctx.appendChild(b);
    }
  }
  function phoneNext() {
    if (!S) return;
    hideNext();
    if (S.pageIdx < S.pages.length - 1) { goRel(1); return; }
    if (!S.readOnly && !S.copy.completedAt && S.active === null && S.copy.filled >= S.copy.total && S.copy.total > 0) complete();
  }
  // ---- the pending auto-advance: LCD = the button fills over the delay (a black copy of its content is uncovered by CSS); 電子紙 = static text on the button ("1.5 秒後下一字").
  // The button keeps its size either way (flex-basis 0, fixed height), so nothing moves.
  function showPending(ms, kind) {
    if (!S || !S.phone || !S.btnNext) return;
    var word = kind === 'finish' ? '完成' : '下一字', sec = secText(ms);
    S.pend = { ms: ms, kind: kind };
    S.status.textContent = sec + ' 秒後' + word;
    if (staticPending()) {
      S.btnNext.setAttribute('data-pending', 'static');
      S.nextLabel.textContent = '';
      S.nextLabel.appendChild(h('span', { class: 'l1', text: sec + ' 秒後' }));
      S.nextLabel.appendChild(h('span', { class: 'l2', text: word }));
    } else {
      S.btnNext.setAttribute('data-pending', 'fill');
      S.btnNext.appendChild(h('i', { class: 'afill', 'data-role': 'auto-progress', 'aria-hidden': 'true', style: 'animation-duration:' + ms + 'ms' }, [h('span', { class: 'lbl', text: word }), MX.icon('tri-r', 18)]));
    }
  }
  function clearPending() {
    if (!S || !S.pend) return;
    S.pend = null;
    if (S.btnNext) {
      S.btnNext.removeAttribute('data-pending');
      var f = S.btnNext.querySelector('.afill');
      if (f) S.btnNext.removeChild(f);
      S.nextLabel.textContent = S.nextWord;
    }
    if (S.status) S.status.textContent = '';
  }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* not available (iOS Safari) */ } }
  function buildBar() {
    if (S.phone) { buildPhoneBar(); return; }
    var land = S.root.className.indexOf('land') >= 0;
    var vert = S.cfg.dir === 'v';
    var bar = S.bar;
    bar.innerHTML = '';
    function btn(label, act, fn, extra) {
      var b = h('button', { type: 'button', text: label, 'data-act': act, onclick: fn, class: extra || '' });
      return b;
    }
    function nav(label, act, fn, icon, right) { return MX.btn({ label: label, icon: icon, iconRight: right, act: act, onclick: fn, iconSize: 18 }); }
    // 返回 first (top left of the bar; never at the bottom edge), then the page buttons. Arrows are inline SVG (the UI font has no ◀ ▶).
    bar.appendChild(btn('返回', 'back', function () { flush(); if (S.readOnly) history.back(); else location.hash = MX.Screens.backFor(S.copy.textId); }));
    S.btnPrev = land ? nav('上一頁', 'prev', function () { goRel(-1); }, 'tri-u') : (vert ? nav('上一頁', 'prev', function () { goRel(-1); }, 'tri-r', true) : nav('上一頁', 'prev', function () { goRel(-1); }, 'tri-l'));
    S.btnNext = land ? nav('下一頁', 'next', function () { goRel(1); }, 'tri-d') : (vert ? nav('下一頁', 'next', function () { goRel(1); }, 'tri-l') : nav('下一頁', 'next', function () { goRel(1); }, 'tri-r', true));
    S.counter = h('div', { class: 'ctr', 'data-role': 'counter' });
    var first, second;
    if (!land && vert) { first = S.btnNext; second = S.btnPrev; } else { first = S.btnPrev; second = S.btnNext; }
    bar.appendChild(first); bar.appendChild(S.counter); bar.appendChild(second);
    var notes = MX.Library.hasNotes(S.copy.textId, Model.sid(S.copy));
    if (S.readOnly) {
      bar.appendChild(nav('匯出', 'export', function () { openExport(); }, 'dl'));
      bar.appendChild(btn('筆順', 'stroke', strokeButton));
      if (notes) bar.appendChild(btn('解說', 'notes', openNotes));
      return;
    }
    bar.appendChild(btn('撤銷', 'undo', undo));
    bar.appendChild(btn('清頁', 'clear', clearPage));
    if (S.cfg.mode === 'recall') bar.appendChild(btn('提示', 'hint', hint));
    bar.appendChild(btn('筆順', 'stroke', strokeButton));
    bar.appendChild(btn('刷新', 'refresh', function () { refresh(); }));
    bar.appendChild(nav('匯出', 'export', function () { openExport(); }, 'dl'));
    if (notes) bar.appendChild(btn('解說', 'notes', openNotes));
    bar.appendChild(btn('設定', 'settings', openSettings));
  }
  function openNotes() {
    if (!S) return;
    flush();
    location.hash = MX.Screens.hash('notes', S.copy.textId, Model.sid(S.copy), 'copy=' + S.copy.id);
  }
  // 對照模式: a strip beside (landscape) / below (portrait, above the edge margin) the stage with the 要旨 and glossary of this section. It exists only when the setting is on
  // and the section has notes; the stage gets what is left (the cells are laid out in the stage only).
  function syncStrip() {
    var want = !S.phone && !!(settings().sideNotes && MX.Library.hasNotes(S.copy.textId, Model.sid(S.copy)));
    if (!want) {
      if (S.pnotes) { if (S.pnotes.parentNode) S.pnotes.parentNode.removeChild(S.pnotes); S.pnotes = null; S.nsec = null; }
      return;
    }
    if (!S.pnotes) {
      S.pnotes = h('div', { class: 'pnotes', 'data-role': 'notes-strip' });
      S.root.appendChild(S.pnotes);
      var box = S.pnotes;
      MX.Library.getSectionNotes(S.copy.textId, Model.sid(S.copy)).then(function (n) {
        if (!S || S.pnotes !== box) return;
        S.nsec = n || false;
        fillStrip();
      }).catch(function (e) { MX.err(e); if (S && S.pnotes === box) { S.nsec = false; fillStrip(); } });
    }
    if (S.nsec !== undefined && S.nsec !== null) fillStrip();
  }
  function fillStrip() {
    if (!S || !S.pnotes) return;
    MX.Notes.fillStrip(S.pnotes, S.nsec || null, S.cfg.script === 'simp' ? 'simp' : 'trad', openNotes);
  }

  function layout() {
    if (!S) return;
    if (S.phone !== MX.Device.isPhone()) {      // the layout mode flipped (版面 setting, window resized across 520 px): rebuild the view in the other layout
      var cur = S;
      P.rememberPos();
      setTimeout(function () { if (S === cur) MX.route(); }, 0);
      return;
    }
    var land = window.innerWidth >= window.innerHeight;
    S.root.className = 'practice ' + (land ? 'land' : 'port') + (S.phone ? ' phone' : '');
    buildBar();
    syncStrip();
    var r = S.stage.getBoundingClientRect();
    var W = Math.floor(r.width), H = Math.floor(r.height);
    if (W < 40 || H < 40) return;
    // keep every cell clear of the screen-edge dead zone (pen digitizer / system gestures): margins only where the stage touches the viewport edge
    var vw = window.innerWidth, vh = window.innerHeight;
    if (S.phone) {
      S.inset = { l: 0, t: 0, r: 0, b: 0 };
      S.g = Layout.gridOne(W, H, S.cfg, S.inset, 8);      // one cell, as big as the stage allows
    } else {
      S.inset = Layout.insets(settings(), vw, vh, { left: r.left < 2, top: r.top < 2, right: r.right > vw - 2, bottom: r.bottom > vh - 2 });
      S.g = Layout.grid(W, H, S.cfg, S.inset);
    }
    S.pages = Layout.paginate(S.cells, S.g);
    // Both canvases use the real device pixel ratio (up to 3; 2.625 on the iReader) so one canvas pixel is one screen pixel: the 1-device-pixel
    // dots of the grid stay black (resampling would turn them grey and a fast e-ink mode would drop them) and ink edges are not blurred by a
    // 1.31x upscale. Performance mode renders at 1x. The ink transform uses the exact canvas/CSS ratio (Math.round of W * dpr is not exact).
    S.dpr = S.bdpr = Math.min(window.devicePixelRatio || 1, settings().perf ? 1 : 3);
    [S.bg, S.ink].forEach(function (c) {
      c.style.width = W + 'px'; c.style.height = H + 'px';
      c.width = Math.round(W * S.dpr); c.height = Math.round(H * S.dpr);
    });
    S.kx = S.ink.width / W; S.ky = S.ink.height / H;
    S.bgx.setTransform(S.bdpr, 0, 0, S.bdpr, 0, 0);
    S.inkx.setTransform(S.kx, 0, 0, S.ky, 0, 0);
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
    // the fonts are unicode-range chunks: what has to be loaded depends on the characters of this page
    var chars = page.map(function (i) { return i >= 0 ? S.cells[i].ch + S.cells[i].punct : ''; }).join(''), all = !!S.text.custom;
    if (Draw.fontsLoaded(S.cfg.script, settings().tplFont, chars, all)) drawBg(true);
    else Draw.fontsReady(S.cfg.script, chars, settings().tplFont, all).then(function () { if (S && tk === S.token) drawBg(true); });
    redrawInk();
    updateUi();
    S.root.setAttribute('data-page', S.pageIdx);
  }
  function redrawInk() {
    var g = S.g, ctx = S.inkx, style = inkStyle();
    stats.full++;
    ctx.clearRect(0, 0, g.W, g.H);
    var page = S.pages[S.pageIdx];
    for (var s = 0; s < page.length; s++) {
      var idx = page[s];
      if (idx < 0) continue;
      var strokes = S.copy.ink[KY(idx)];
      if (!strokes) continue;
      var o = slotOrigin(s);
      for (var i = 0; i < strokes.length; i++) Ink.paintStroke(ctx, strokes[i], o.x, o.y, g.cell / 1000, style, '#000', { px: S.kx });
    }
  }
  function updateUi() {
    S.counter.textContent = (S.pageIdx + 1) + ' / ' + S.pages.length;
    S.btnPrev.disabled = S.pageIdx <= 0;
    S.btnNext.disabled = S.pageIdx >= S.pages.length - 1;
    if (S.phone) {
      var last = S.pageIdx >= S.pages.length - 1, fin = last && !S.readOnly && !S.copy.completedAt && S.copy.total > 0 && S.copy.filled >= S.copy.total;
      S.btnNext.disabled = last && !fin;
      S.btnNext.setAttribute('data-act', fin ? 'finish' : 'next');
      S.nextWord = fin ? '完成' : '下一字';
      if (!S.pend) S.nextLabel.textContent = S.nextWord;
      S.progBar.setAttribute('aria-valuemax', String(S.pages.length)); S.progBar.setAttribute('aria-valuenow', String(S.pageIdx + 1)); S.progBar.setAttribute('aria-valuetext', S.counter.textContent);
      S.progress.style.width = (100 * (S.pageIdx + 1) / Math.max(1, S.pages.length)) + '%';
      S.root.setAttribute('data-cell', S.pages[S.pageIdx][0]);
      fillCtx();
    }
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
    if (k === 'Escape' && S.chooser) { closeChooser(); return; }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (k === 'z' || k === 'Z') && !S.readOnly && !(e.target.closest && e.target.closest('input,textarea'))) { e.preventDefault(); undo(); return; }      // ⌘Z / Ctrl+Z
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

  // ------------------------------------------------------------------ stroke order (筆順): finger double-tap on a cell, or the toolbar button
  function hitClient(cx, cy) {
    if (!S || !S.g) return -1;
    var r = S.ink.getBoundingClientRect();
    return hit(cx - r.left, cy - r.top);
  }
  // the double-tap exists only on the tablet layout, while the finger never inks (書寫工具 觸控筆, or 自動 there) and the setting 雙擊看筆順 is on (the phone layout has the 筆順 button)
  function tapEnabled() { return !!S && !S.phone && settings().strokeTap !== false && !fingerOk(); }
  // the popup steps through the whole reading order (S.cells: title, body, 落款), starting at idx
  function openStroke(idx) {
    if (!S || !S.cells[idx]) return;
    S.lastCell = idx;
    MX.StrokePop.open({ ch: S.cells[idx].ch, script: S.cfg.script, nav: { cells: S.cells, idx: idx } });
  }
  function isEmpty(i) { return !(S.copy.ink[KY(i)] || []).length; }
  // the toolbar button: the next character that is not written yet, starting at the current one (phone: the character on the screen; tablet: the cell touched last when it is on this
  // page, else the cell written last, else the first cell of the page). Everything written: the current one. A finger double-tap opens the tapped cell itself (openStroke).
  function strokeButton() {
    if (!S) return;
    var cur = S.phone ? S.pages[S.pageIdx][0]
      : (S.lastCell !== undefined && S.slotOf[S.lastCell] !== undefined ? S.lastCell : (S.focus >= 0 && S.slotOf[S.focus] !== undefined ? S.focus : firstIdx(S.pages[S.pageIdx]))), i;
    for (i = cur; i < S.cells.length; i++) if (isEmpty(i)) { openStroke(i); return; }
    openStroke(cur);
  }

  // ------------------------------------------------------------------ pointer input
  function hit(x, y) {
    if (S.phone) return S.pages[S.pageIdx][0];      // the whole stage is the one cell's writing area
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
  // ---- samples -> ink. The Sampler turns events (coalesced, de-duplicated, never predicted) into stored integer samples
  // [x, y, p, tx, ty, t]; the Ink.Builder of the stroke paints each new sample incrementally.
  function mapFor(st) {
    return function (ev) {
      var g = S.g;
      return [Math.round((ev.clientX - S.rect.left - st.cx) / g.cell * 1000), Math.round((ev.clientY - S.rect.top - st.cy) / g.cell * 1000)];
    };
  }
  function feed() {
    var st = S.stroke, pts = S.cap.pts, n = pts.length / 6, k;
    for (k = st.fed; k < n; k++) st.pen.add(pts[k * 6], pts[k * 6 + 1], pts[k * 6 + 2], pts[k * 6 + 3], pts[k * 6 + 4], pts[k * 6 + 5]);
    if (n > st.fed) { st.fed = n; st.pen.draw(); stats.paints++; }
  }
  // Does a finger (or a mouse standing in for one) ink? 書寫工具 (settings.inputMode, MX.Device.input): 手指 yes, 觸控筆 never (a pen still inks), 自動 = the phone layout yes, the tablet layout no.
  // A laptop (no touch screen) never meets a finger; in the phone layout (版面 手機) its mouse stands in for one (allowed()).
  function fingerOk() {
    return MX.Device.input(settings()).mode === 'touch';
  }
  function allowed(e) {
    if (e.pointerType === 'pen') return true;
    if (e.pointerType === 'mouse' && !S.phone && MX.Device.env().desktop) {       // desktop without touch or pen: the mouse writes (else the app is unusable); a one-time hint says a tablet or pen is best
      if (!settings().mouseTip) { settings().mouseTip = true; Model.saveSettings(); MX.toast('用滑鼠也能書寫；用平板或手寫筆效果最好。', 4000); }
      return true;
    }
    if (!fingerOk()) return false;
    if (Math.max(e.width || 0, e.height || 0) > (S.phone ? 120 : 45)) return false;   // big contact area = palm
    return Date.now() - S.lastPen > 1500;   // palm rejection while a pen is around
  }
  function onDown(e) {
    if (!S || S.readOnly) return;
    var isPen = e.pointerType === 'pen';
    if (isPen) { S.lastPen = Date.now(); S.penSeen = true; }
    if (S.active !== null) {
      // a new pointer while one is down: ignore (palm / second finger), unless the pen arrives or the old pointer went silent (lost pointerup). A touch NEVER cancels a pen stroke
      // (a pen held still for a moment is not "silent"; only a pen that has sent nothing for 8 s is treated as lost)
      if (!isPen && Date.now() - S.lastEv < (S.activeType === 'pen' ? 8000 : 1500)) return;
      finish(true);
    }
    if (!allowed(e)) {
      var inp = MX.Device.input(settings());
      if (!isPen && !S.penSeen && !settings().touchPrompted && (inp.auto ? !S.phone : (inp.mode === 'pen' && e.pointerType === 'touch' && Math.max(e.width || 0, e.height || 0) <= 45))) {
        // with 雙擊看筆順 on, a plain tap must not pop the banner up over the cells (it would eat the second tap): the banner waits until the touch moves
        // 自動 on the tablet layout: the first finger touch asks once whether the pen reports as touch (顯示 可允許手指). 觸控筆 chosen: only a finger that keeps trying (2 attempts) gets the one-time hint.
        if (tapEnabled()) S.promptFor = { id: e.pointerId, x: e.clientX, y: e.clientY }; else touchAttempt();
      }
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
    S.cap.reset();
    S.stroke = { idx: idx, cx: o.x, cy: o.y, fed: 0, style: inkStyle() };
    // finger / mouse: no real pressure -> width from the writing speed (touch always; a mouse only in the phone layout, where it stands in for a finger)
    if (e.pointerType === 'touch' || e.pointerType === 'mouse') { var sty = S.stroke.style; S.cap.synth = function (n) { return Ink.rawFor(sty, n); }; }
    S.stroke.map = mapFor(S.stroke);
    S.stroke.pen = Ink.pen(S.inkx, o.x, o.y, S.g.cell / 1000, S.stroke.style, { px: S.kx });
    S.cap.take(e, S.stroke.map);
    feed();
  }
  function onMove(e) {
    if (!S) return;
    if (e.pointerType === 'pen') { S.lastPen = Date.now(); S.penSeen = true; }
    if (S.promptFor && e.pointerId === S.promptFor.id && Math.hypot(e.clientX - S.promptFor.x, e.clientY - S.promptFor.y) > 10) { S.promptFor = null; if (!settings().touchPrompted) touchAttempt(); }
    if (S.active === null || e.pointerId !== S.active) return;
    S.lastEv = Date.now();
    tickTime(false);
    var evs = Ink.Sampler.events(e), i;
    if (S.erasing) {
      for (i = 0; i < evs.length; i++) eraseAt(evs[i].clientX - S.rect.left, evs[i].clientY - S.rect.top);
      return;
    }
    if (S.cap.take(e, S.stroke.map)) feed();
  }
  function onUp(e) {
    if (S && S.promptFor && e.pointerId === S.promptFor.id) S.promptFor = null;
    if (!S || S.active === null || e.pointerId !== S.active) return;
    if (e.type === 'pointerup' && S.stroke) {
      tickTime(false);
      S.cap.end(e, S.stroke.map);       // the final position is always kept: pen-up flushes the stroke to where the pen really stopped
      feed();
      S.stroke.pen.end();               // ... and adds the 出鋒 tail (the only thing painted at pen-up; the region repaint below reproduces it exactly)
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
    var pts = S.cap.pts.slice();      // flat samples [x, y, p, tx, ty, t, ...] (absolute, integers)
    if (!pts.length) return;
    if (cancelled && wasType !== 'pen') { repaintRect(strokeRect(st, pts)); return; }   // a pen took over from a touch/palm stroke: drop it
    var arr = S.copy.ink[KY(st.idx)] || (S.copy.ink[KY(st.idx)] = []);
    arr.push(pts);
    // pen-up polish: re-render just this stroke's bounding box from the stored samples (clean taper, full-lookahead smoothing); never the page
    repaintRect(strokeRect(st, pts));
    // learn the pen's pressure floor and working range (settings.pressFloor / pressLo / pressHi) only now: the stroke on screen was drawn with the old values,
    // so the repaint above gives the same pixels (a later full redraw uses the updated range)
    if (wasType === 'pen' && S.cap.pressureSeen && settings().pressure !== 'off' && pts.length >= 24 && Ink.learn(settings(), S.cap.minP, pts)) Model.saveSettings();
    pushOp({ k: 'add', cell: st.idx, stroke: pts });
    dirty(st.idx);
    scheduleSave();
    afterChange();
    armNext();
  }
  // ---- region repaint: clear a rectangle of the ink canvas and repaint the strokes that reach into it (no full-page redraw)
  function strokeRect(st, pts) {
    return Ink.bounds(pts, st.cx, st.cy, S.g.cell / 1000, inkStyle(), S.kx);
  }
  function repaintRect(rect) {
    var g = S.g, page = S.pages[S.pageIdx], items = [], s, idx, strokes, i, o;
    for (s = 0; s < page.length; s++) {
      idx = page[s];
      if (idx < 0) continue;
      strokes = S.copy.ink[KY(idx)];
      if (!strokes || !strokes.length) continue;
      o = slotOrigin(s);
      if (o.x + g.cell * 1.4 < rect.x0 || o.x - g.cell * 0.4 > rect.x1 || o.y + g.cell * 1.4 < rect.y0 || o.y - g.cell * 0.4 > rect.y1) continue;
      for (i = 0; i < strokes.length; i++) items.push({ st: strokes[i], ox: o.x, oy: o.y, sc: g.cell / 1000 });
    }
    stats.region++;
    return Ink.repaintRegion(S.inkx, S.kx, S.ky, rect, items, inkStyle(), S.kx);
  }
  function pushOp(op) { S.ops.push(op); if (S.ops.length > 400) S.ops.shift(); }
  function afterChange() {
    Model.recount(S.copy, S.cells);
    if (S.phone) { updateUi(); return; }       // phone: completion waits for the idle delay (armFlip) or the 完成 button
    if (!S.copy.completedAt && S.copy.total > 0 && S.copy.filled >= S.copy.total) complete();
  }

  // ------------------------------------------------------------------ erasing
  function strokeHit(pts, ox, oy, sc, x, y, r) {
    var n = pts.length / 6, i;
    var px = ox + pts[0] * sc, py = oy + pts[1] * sc;
    if (n === 1) return Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) <= r;
    for (i = 1; i < n; i++) {
      var qx = ox + pts[i * 6] * sc, qy = oy + pts[i * 6 + 1] * sc;
      var dx = qx - px, dy = qy - py, l2 = dx * dx + dy * dy, t = l2 ? ((x - px) * dx + (y - py) * dy) / l2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var cx = px + t * dx - x, cy = py + t * dy - y;
      if (cx * cx + cy * cy <= r * r) return true;
      px = qx; py = qy;
    }
    return false;
  }
  function eraseAt(x, y) {
    var g = S.g, page = S.pages[S.pageIdx], r = Math.max(10, g.cell * 0.05), removed = null, style = inkStyle();
    for (var s = 0; s < page.length; s++) {
      var idx = page[s];
      if (idx < 0) continue;
      var strokes = S.copy.ink[KY(idx)];
      if (!strokes || !strokes.length) continue;
      var o = slotOrigin(s);
      if (x < o.x - g.cell * 0.3 || x > o.x + g.cell * 1.3 || y < o.y - g.cell * 0.3 || y > o.y + g.cell * 1.3) continue;
      for (var i = strokes.length - 1; i >= 0; i--) {
        if (strokeHit(strokes[i], o.x, o.y, g.cell / 1000, x, y, r)) {
          S.erasing.items.push({ cell: idx, index: i, stroke: strokes[i] });
          removed = Ink.union(removed, Ink.bounds(strokes[i], o.x, o.y, g.cell / 1000, style, S.kx));
          strokes.splice(i, 1);
          dirty(idx);
        }
      }
    }
    if (removed) repaintRect(removed);
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
        var arr = S.copy.ink[KY(op.cell)] || [], at = arr.indexOf(op.stroke);
        if (at < 0) { i = S.ops.length; continue; }
        arr.splice(at, 1);
        dirty(op.cell);
      } else {
        for (k = op.items.length - 1; k >= 0; k--) {
          var it = op.items[k], a = S.copy.ink[KY(it.cell)] || (S.copy.ink[KY(it.cell)] = []);
          a.splice(Math.min(it.index, a.length), 0, it.stroke);
          dirty(it.cell);
        }
      }
      return undone();
    }
    // fallback after a reload: drop the last stroke of the focus cell / last inked cell on this page
    var page = S.pages[S.pageIdx], target = -1;
    if (S.focus >= 0 && pageHas(S.focus) && (S.copy.ink[KY(S.focus)] || []).length) target = S.focus;
    else for (k = page.length - 1; k >= 0; k--) if (page[k] >= 0 && (S.copy.ink[KY(page[k])] || []).length) { target = page[k]; break; }
    if (target < 0) { MX.toast('沒有可撤銷的筆畫'); return; }
    S.copy.ink[KY(target)].pop();
    dirty(target);
    undone();
  }
  function undone() {
    Model.recount(S.copy, S.cells);
    redrawInk(); scheduleSave(); hideNext();
    if (S.phone) updateUi();
  }
  async function clearPage() {
    if (!S || S.active !== null) return;
    var page = S.pages[S.pageIdx], items = [];
    page.forEach(function (idx) {
      if (idx < 0) return;
      (S.copy.ink[KY(idx)] || []).forEach(function (st, i) { items.push({ cell: idx, index: i, stroke: st }); });
    });
    if (!items.length) { MX.toast(S.phone ? '這個字還沒有字跡' : '此頁沒有字跡'); return; }
    var ok = S.phone ? true : await MX.confirm('清除此頁所有字跡？（可用「撤銷」還原）', '清除', '清頁');      // phone: one character, 撤銷 brings it back
    if (!ok || !S) return;
    page.forEach(function (idx) {
      if (idx >= 0 && S.copy.ink[KY(idx)] && S.copy.ink[KY(idx)].length) { S.copy.ink[KY(idx)] = []; dirty(idx); }
    });
    pushOp({ k: 'del', items: items });
    Model.recount(S.copy, S.cells);
    redrawInk(); scheduleSave(); hideNext();
    if (S.phone) updateUi();
  }
  function hint() {
    if (!S || S.cfg.mode !== 'recall') return;
    var page = S.pages[S.pageIdx], t = -1, i;
    for (i = 0; i < page.length; i++) if (page[i] >= 0 && !(S.copy.ink[KY(page[i])] || []).length) { t = page[i]; break; }
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
    clearPending();
    if (S.nextBtn && S.nextBtn.parentNode) S.nextBtn.parentNode.removeChild(S.nextBtn);
    S.nextBtn = null;
  }
  // Page complete = every cell of the page has ink.
  function pageFull(page) {
    var n = 0;
    for (var i = 0; i < page.length; i++) {
      if (page[i] < 0) continue;
      n++;
      if (!(S.copy.ink[KY(page[i])] || []).length) return false;
    }
    return n > 0;
  }
  // Called after a stroke: if the page is now full, turn to the next page after the idle delay (one instant step, no animation).
  // Any new pen-down (hideNext), page change, undo or clear cancels it. Never from the last page; only after writing on this page.
  function armFlip() {
    clearTimeout(S.timers.next);
    var st = settings();
    if (S.readOnly) return false;
    // phone: the copy is complete when every character has ink; that is announced after the same idle delay as a page turn (never at the first stroke of the last character)
    var phoneOn = S.phone && autoOn();       // phone: its own 自動下一字 (the pill); the tablet's 自動翻頁 is a separate setting
    var allDone = function () { return phoneOn && !S.copy.completedAt && S.copy.total > 0 && S.copy.filled >= S.copy.total; };
    var flips = function () { return (S.phone ? phoneOn : st.autoFlip) && S.pageIdx < S.pages.length - 1 && pageFull(S.pages[S.pageIdx]); };
    if (!allDone() && !flips()) return false;
    var seq = S.token, ms = delayMs();
    if (S.phone) showPending(ms, allDone() ? 'finish' : 'next');
    S.timers.next = setTimeout(function () {
      if (!S || S.token !== seq) return;
      if (S.active !== null || document.querySelector('.modal-bg')) { clearPending(); return; }
      if (allDone()) { clearPending(); buzz(); complete(); return; }
      if (flips()) { buzz(); goRel(1); }       // one page change = one redraw (renderPage); hideNext there clears the countdown
    }, ms);
    return true;
  }
  function armNext() {
    if (armFlip()) return;
    clearTimeout(S.timers.next);
    if (S.phone) return;      // the buttons are always on the screen
    if (S.readOnly || settings().autoFlip || !settings().autoNext || S.pageIdx >= S.pages.length - 1) return;
    var li = lastIdx(S.pages[S.pageIdx]);
    if (li < 0 || !(S.copy.ink[KY(li)] || []).length) return;
    var seq = S.token;
    S.timers.next = setTimeout(function () {
      if (!S || S.token !== seq || S.active !== null) return;
      S.nextBtn = MX.btn({ cls: 'nextbtn', act: 'autonext', label: '下一頁', icon: S.cfg.dir === 'v' && !S.root.className.match(/land/) ? 'tri-l' : 'tri-r', iconRight: !(S.cfg.dir === 'v' && !S.root.className.match(/land/)), onclick: function () { goRel(1); } });
      S.nextBtn.style.bottom = (12 + ((S.inset && S.inset.b) || 0)) + 'px';
      S.stage.appendChild(S.nextBtn);
    }, 3000);
  }
  // A finger touched the cells and did not ink. 自動 on the tablet layout: ask once at the first touch whether the pen reports as touch (and the finger may write). 觸控筆 chosen on purpose:
  // only a finger that keeps trying (the second attempt) gets a one-time hint that says why nothing is drawn and where to change it. Either way `touchPrompted` makes it a one-time thing.
  function touchAttempt() {
    if (!S || settings().touchPrompted) return;
    if (MX.Device.input(settings()).auto) { showTouchPrompt(); return; }
    S.refused = (S.refused || 0) + 1;
    if (S.refused >= 2) showTouchPrompt();
  }
  function showTouchPrompt() {
    if (S.banner) return;
    var penOnly = !MX.Device.input(settings()).auto;
    S.banner = h('div', { class: 'banner', 'data-role': penOnly ? 'pen-hint' : 'touch-prompt' }, [
      h('div', { text: penOnly ? '目前只用觸控筆書寫，手指不會留下筆跡。可在設定改為手指。' : '筆似乎以「觸控」回報。是否允許手指或觸控書寫？' }),
      h('div', { class: 'btnrow' }, [
        h('button', { text: penOnly ? '改用手指' : '允許', 'data-act': 'allow-touch', onclick: function () {
          MX.Device.setInput(settings(), 'touch'); settings().touchPrompted = true; Model.saveSettings(); closeBanner(); MX.toast(penOnly ? '已改為手指書寫' : '已允許觸控書寫');
        } }),
        h('button', { text: penOnly ? '知道了' : '不用', 'data-act': 'deny-touch', onclick: function () {
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
    MX.Export.openSheet(cp());
  }
  // The cells changed (title / 落款 switched, name or date style edited): rebuild the list. Ink is keyed by cell key, so what was written stays where it was, whatever the
  // template under it now says; totals and progress follow the cells that exist.
  var rebuildLater = MX.debounce(function () { rebuildCells(); }, 350);
  function rebuildCells() {
    if (!S) return;
    var keep = S.cells[S.copy.pos] ? S.cells[S.copy.pos].key : null, i;
    S.cells = Layout.cellsFor(S.text, S.copy);
    Model.recount(S.copy, S.cells);
    S.ops = []; S.focus = -1;
    S.copy.pos = 0;
    for (i = 0; i < S.cells.length; i++) if (S.cells[i].key === keep) { S.copy.pos = i; break; }
    Model.saveMeta(S.copy);
    layout();
  }
  function openSettings() {
    if (!S) return;
    var api;
    // The same groups, in the same order, as the settings screen (Form.GROUPS): the sample and the options of each. 這一遍 = the choices of this 字帖; 所有字帖 = app settings.
    var ctx = {
      st: settings(), cfg: S.cfg, scope: '這一遍', noContent: true, samples: [], boxes: [],
      onCfg: function (k) {
        Model.saveMeta(S.copy); Model.saveTextCfg(S.copy.textId, S.cfg);
        if (k === 'title') { rebuildCells(); return; }
        S.copy.pos = firstIdx(S.pages[S.pageIdx]);
        layout();
      },
      onSet: function () { Model.saveSettings(); layout(); },
      custom: { sign: function () {
        var sb = MX.Form.signBlock(settings(), S.cfg, S.text.category === 'buddhist', function (k) {
          if (k === 'sign') { Model.saveMeta(S.copy); Model.saveTextCfg(S.copy.textId, S.cfg); }
          else Model.saveSettings();
          if (k === 'name') rebuildLater(); else rebuildCells();
        });
        ctx.boxes.push(sb);
        return sb;
      } }
    };
    // 完成 sticks to the top right of the sheet (no button at the bottom edge); everything applies and is saved at once
    var head = h('div', { class: 'sheethead' }, [h('h2', { text: '設定', class: 'grow' }), h('button', { class: 'on', text: '完成', 'data-act': 'done', onclick: function () { api.close(); } })]);
    var body = [
      head,
      h('div', { class: 'btnrow' }, [
        h('button', { text: '新抄一遍', 'data-act': 'newcopy', onclick: function () { api.close(); newCopy(); } })
      ]),
      h('div', { class: 'note', 'data-role': 'scope-note', text: '標「這一遍」的選項只改目前這份字帖；標「所有字帖」的選項套用到全部字帖。' })
    ];
    MX.Form.GROUPS.forEach(function (g) {
      if (g.id === 'data' || g.id === 'about') return;
      var nodes = MX.Form.groupBody(g, ctx);
      if (!nodes.length) return;
      body.push(h('h2', { text: g.title, 'data-group': g.id }));
      nodes.forEach(function (n) { body.push(n); });
    });
    api = MX.modal({ body: body });
    api.el.className += ' sheet';
  }
  async function newCopy() {
    if (!S) return;
    var c = S.copy, msg = c.completedAt ? '將目前這一遍存檔，重新開始新的一遍？' : '這一遍尚未完成。仍要存檔並重新開始？';
    var ok = await MX.confirm(msg, '新抄一遍', '新抄一遍');
    if (!ok || !S) return;
    Model.archive(c);
    location.replace(MX.Screens.hash('setup', c.textId, Model.sid(c), 'new=1'));   // replace: Back must not return to the archived copy
  }
  function complete() {
    var c = S.copy;
    c.completedAt = Date.now();
    Model.flush(c);
    Model.addDone(c);
    var sid = Model.sid(c), n = Model.doneCount(c.textId, sid);       // of this section
    var hasNotes = MX.Library.hasNotes(c.textId, sid);
    if (hasNotes && settings().autoNotes !== false && !(MX.test && MX.test.noAutoNotes)) {
      // 完成後顯示解說: the explanation page is the completion screen (it carries 下一章 / 匯出作品 / 新抄一遍)
      location.hash = MX.Screens.hash('notes', c.textId, sid, 'done=' + c.id);
      return;
    }
    var secs = S.text.sections || [], at = secs.indexOf(sid), nextSec = at >= 0 && at < secs.length - 1 ? secs[at + 1] : null;
    var buttons = [
      { label: '匯出作品', act: 'export', onClick: function () { if (S) openExport(); } },
      { label: '新抄一遍', act: 'newcopy', onClick: function () { newCopy(); } }
    ];
    if (hasNotes) buttons.push({ label: '解說', act: 'notes', onClick: function () { openNotes(); } });
    if (nextSec) {
      buttons.push({ label: '下一章', act: 'nextsec', onClick: function () {
        var nc = Model.activeCopy(c.textId, nextSec);
        flush();
        location.hash = nc ? MX.Screens.hash('practice', nc.id) : MX.Screens.hash('setup', c.textId, nextSec);
      } });
    }
    buttons.push({ label: '繼續', act: 'continue', primary: true });
    MX.modal({
      title: '圓滿完成',
      body: [h('p', { text: '這是第 ' + n + ' 遍。用時約 ' + MX.fmtDuration(c.activeMs) + '。' })],
      buttons: buttons
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
      return { phone: S.phone, page: S.pageIdx, pages: S.pages.length, inset: g.inset, stage: [g.W, g.H], gx: g.ox, gy: g.oy, cols: g.cols, rows: g.rows, cell: g.cell, dir: g.dir, portrait: g.portrait,
        perPage: g.perPage, total: S.cells.length, filled: S.copy.filled, cells: cells, copyId: S.copy.id, completed: !!S.copy.completedAt,
        mode: S.cfg.mode, nextBtn: !!S.nextBtn, pending: S.pend ? S.pend.kind : null, chooser: !!S.chooser, pressureSeen: S.cap.pressureSeen, hint: S.hint, rawOk: S.rawOk, kx: S.kx, ky: S.ky, dpr: S.dpr,
        inkSize: [S.ink.width, S.ink.height], inkCss: [S.ink.style.width, S.ink.style.height] };
    },
    flipMs: 0,
    stats: function () { return { full: stats.full, region: stats.region, paints: stats.paints }; },
    style: function () { return inkStyle(); },
    relayout: function () { if (S) layout(); },
    go: go,
    cells: function () { return S ? S.cells : []; },
    keys: function () { return S ? S.cells.map(function (c) { return c.key; }).join() : ''; },
    cellsAll: function () { return S ? S.cells.map(function (c) { return c.ch; }).join('') : ''; },
    inkOf: function (idx) { return S && S.cells[idx] ? (S.copy.ink[S.cells[idx].key] || []) : []; },
    setPos: function (p) { if (S) { S.copy.pos = p; layout(); } },
    strokeMs: 0,
    lastCell: function () { return S ? S.lastCell : undefined; },
    clearLast: function () { if (S) { S.lastCell = undefined; S.focus = -1; } }
  };
})();
