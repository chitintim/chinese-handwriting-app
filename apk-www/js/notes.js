(function () {
  'use strict';
  // 解說 (section explanations): the reading page (paginated with CSS columns: 上一頁 / 下一頁, no scrolling) and the 對照模式 strip of the practice view.
  // Content: library/notes/<textId>.json (see docs/LIBRARY.md), loaded through MX.Library.getSectionNotes; shown in the script of the copy (繁 / 简).
  var MX = window.MX, h = MX.h, Model = MX.Model, Lib = MX.Library;
  var N = MX.Notes = {};
  var cur = null;            // the open reading page: {el, listeners, ...}
  var GAP = 40;              // px between two columns (pages)

  function pick(v, script) { return v ? (v[script] || v.trad || v.simp || '') : ''; }
  function libScript() { return Model.settings.libScript === 'simp' ? 'simp' : 'trad'; }
  function scriptFor(textId, sectionId, copy) {
    if (copy) return copy.cfg.script === 'simp' ? 'simp' : 'trad';
    var c = Model.activeCopy(textId, sectionId);
    return c ? (c.cfg.script === 'simp' ? 'simp' : 'trad') : libScript();
  }
  function qs(query) {
    var o = {};
    String(query || '').split('&').forEach(function (p) { if (p) { var i = p.indexOf('='); o[decodeURIComponent(i < 0 ? p : p.slice(0, i))] = i < 0 ? '' : decodeURIComponent(p.slice(i + 1)); } });
    return o;
  }
  // The parts in reading order. Each returns a list of nodes (or none when the notes lack it).
  var PARTS = [
    ['summary', '要旨'], ['translation', '白話'], ['keyLines', '重點句'], ['glossary', '字詞'], ['background', '背景']
  ];
  function buildBlocks(nt, script) {
    var out = [];
    PARTS.forEach(function (p) {
      var k = p[0], kids = [];
      if (k === 'summary' || k === 'translation' || k === 'background') {
        var t = pick(nt[k], script);
        if (t) kids.push(h('p', { class: 'ntext', text: t }));
      } else if (k === 'keyLines') {
        (nt.keyLines || []).forEach(function (kl) {
          kids.push(h('div', { class: 'nitem' }, [h('div', { class: 'nline', text: pick(kl.line, script) }), pick(kl.note, script) ? h('div', { class: 'nnote', text: pick(kl.note, script) }) : null]));
        });
      } else if (k === 'glossary') {
        (nt.glossary || []).forEach(function (g) {
          kids.push(h('div', { class: 'nitem gl' }, [h('span', { class: 'nterm', text: pick(g.term, script) }), h('span', { class: 'nnote', text: '　' + pick(g.note, script) })]));
        });
      }
      if (kids.length) out.push(h('div', { class: 'npart', 'data-part': k }, [h('h2', { text: p[1] })].concat(kids)));
    });
    return out;
  }

  // ------------------------------------------------------------------ the reading page: #/notes/<textId>/<sectionId>?done=<copyId>
  N.hide = function () {
    if (!cur) return;
    cur.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
    clearTimeout(cur.timer);
    cur = null;
  };
  N.show = async function (root, textId, sectionId, query) {
    N.hide();
    sectionId = sectionId || 'main';
    var q = qs(query), copy = q.done || q.copy ? Model.copies[q.done || q.copy] : null, done = !!q.done && !!copy;
    var script = scriptFor(textId, sectionId, copy);
    var entry = Lib.entry(textId);
    if (!entry) { location.hash = '#/'; return; }
    var el = h('div', { class: 'screen nread', 'data-screen': 'notes', 'data-text-id': textId, 'data-section': sectionId, style: 'font-family:' + MX.Draw.uiFam(script) });
    root.appendChild(el);
    var C = { el: el, listeners: [], page: 0, pages: 1, timer: null };
    cur = C;
    function back() { if (history.length > 1) history.back(); else location.hash = MX.Screens.backFor(textId); }
    var title = h('h1', { class: 'grow', text: '解說', 'data-role': 'notes-title' });
    el.appendChild(h('div', { class: 'topbar' }, [h('button', { text: done ? '返回書寫' : '返回', class: 'backbtn', 'data-act': 'back', onclick: function () {
      if (done && copy) location.hash = MX.Screens.hash('practice', copy.id); else back();
    } }), title]));
    var view = h('div', { class: 'nview', 'data-role': 'notes-view' });
    var cols = h('div', { class: 'ncols', 'data-role': 'notes-cols' });
    view.appendChild(cols);
    el.appendChild(view);
    var prev = h('button', { 'data-act': 'npage-prev', onclick: function () { go(C.page - 1); } }, [MX.icon('tri-u', 18), '上一頁']);
    var next = h('button', { 'data-act': 'npage-next', onclick: function () { go(C.page + 1); } }, ['下一頁', MX.icon('tri-d', 18)]);
    var ctr = h('div', { class: 'ctr', 'data-role': 'npage-ctr', text: '1 / 1' });
    var pager = h('div', { class: 'pager npager', 'data-role': 'notes-pager' }, [prev, ctr, next]);
    el.appendChild(pager);

    function go(p) {
      C.page = MX.clamp(p, 0, C.pages - 1);
      cols.scrollLeft = C.page * (cols.clientWidth + GAP);
      ctr.textContent = (C.page + 1) + ' / ' + C.pages;
      prev.disabled = C.page <= 0;
      next.disabled = C.page >= C.pages - 1;
      el.setAttribute('data-page', String(C.page));
    }
    function repage() {
      if (cur !== C) return;
      var vw = view.clientWidth, vh = view.clientHeight;
      if (vw < 50 || vh < 50) return;
      cols.style.width = vw + 'px'; cols.style.height = vh + 'px';
      cols.style.columnWidth = vw + 'px'; cols.style.columnGap = GAP + 'px';
      C.pages = Math.max(1, Math.round((cols.scrollWidth + GAP) / (vw + GAP)));
      go(C.page);
    }
    function on(target, type, fn) { target.addEventListener(type, fn); C.listeners.push([target, type, fn]); }
    on(window, 'resize', function () { clearTimeout(C.timer); C.timer = setTimeout(repage, 120); });
    if (document.fonts && document.fonts.addEventListener) on(document.fonts, 'loadingdone', function () { clearTimeout(C.timer); C.timer = setTimeout(repage, 30); });
    on(window, 'mo-key', function (e) { if (e.detail === 'next') go(C.page + 1); else if (e.detail === 'prev') go(C.page - 1); });
    on(document, 'keydown', function (e) {
      if (document.querySelector('.modal-bg')) return;
      if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'AudioVolumeDown' || e.keyCode === 25) { e.preventDefault(); go(C.page + 1); }
      else if (e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'AudioVolumeUp' || e.keyCode === 24) { e.preventDefault(); go(C.page - 1); }
    });

    var nt = null, text = null, failure = '';
    try { text = await Lib.getText(textId); nt = await Lib.getSectionNotes(textId, sectionId); } catch (e) { MX.err(e); failure = String(e && e.message || e); }
    if (cur !== C) return;
    var sec = text ? text.sections.filter(function (s) { return s.id === sectionId; })[0] : null;
    var ttl = text ? pick(text.title, script) + (sec && text.sections.length > 1 ? ' · ' + pick(sec.title, script) : '') : pick(entry.title, script);
    title.textContent = '解說 · ' + ttl;
    cols.appendChild(h('h1', { class: 'ntitle', text: ttl }));
    if (done) {
      var n = Model.doneCount(textId, Model.sid(copy));
      cols.appendChild(h('div', { class: 'ndone', 'data-role': 'notes-done', text: '圓滿完成！這是第 ' + n + ' 遍，用時約 ' + MX.fmtDuration(copy.activeMs) + '。' }));
    }
    if (!nt) {
      cols.appendChild(h('p', { class: 'ntext', 'data-role': 'notes-empty', text: failure ? '無法載入解說：' + failure : '這一章還沒有解說。' }));
    } else {
      buildBlocks(nt, script).forEach(function (b) { cols.appendChild(b); });
    }
    if (done) {
      var secs = text ? text.sections.map(function (s) { return s.id; }) : [], at = secs.indexOf(Model.sid(copy)), nextSec = at >= 0 && at < secs.length - 1 ? secs[at + 1] : null;
      var acts = h('div', { class: 'btnrow nacts', 'data-role': 'notes-actions' });
      if (nextSec) acts.appendChild(h('button', { class: 'on', text: '下一章', 'data-act': 'nextsec', onclick: function () {
        var nc = Model.activeCopy(textId, nextSec);
        location.hash = nc ? MX.Screens.hash('practice', nc.id) : MX.Screens.hash('setup', textId, nextSec);
      } }));
      acts.appendChild(h('button', { text: '匯出作品', 'data-act': 'export', onclick: async function () {
        var v = await Lib.getView(textId, Model.sid(copy));
        Model.loadInk(copy); Model.upgradeKeys(copy, v);
        MX.Export.openSheet(MX.Export.ctx(copy, v, MX.Layout.cellsFor(v, copy)));
      } }));
      acts.appendChild(h('button', { text: '新抄一遍', 'data-act': 'newcopy', onclick: async function () {
        var ok = await MX.confirm('將目前這一遍存檔，重新開始新的一遍？', '新抄一遍', '新抄一遍');
        if (!ok) return;
        Model.archive(copy);
        location.replace(MX.Screens.hash('setup', textId, Model.sid(copy), 'new=1'));
      } }));
      cols.appendChild(acts);
    }
    if (nt && nt.disclaimer) cols.appendChild(h('p', { class: 'ndisc', 'data-role': 'notes-disclaimer', text: pick(nt.disclaimer, script) }));
    C.script = script;
    repage();
    go(Math.max(0, parseInt(q.p, 10) - 1 || 0));
    // layout settles after the fonts of this page load (loadingdone) and after the first paint
    setTimeout(repage, 60);
  };

  // ------------------------------------------------------------------ 對照模式 strip (practice view): 要旨 + glossary of the current section, as much as fits
  // box = the strip element (flex column, fixed size by CSS). more() opens the full page.
  N.fillStrip = function (box, nsec, script, more) {
    box.innerHTML = '';
    var head = h('div', { class: 'shead2' }, [h('span', { class: 'sh', text: '對照 · 解說' }), h('button', { text: '全文', 'data-act': 'notes-open', onclick: more })]);
    var body = h('div', { class: 'sbody', 'data-role': 'strip-body', style: 'font-family:' + MX.Draw.uiFam(script) });
    box.appendChild(head); box.appendChild(body);
    if (!nsec) { body.appendChild(h('p', { class: 'ntext', text: '沒有解說。' })); return; }
    var sum = pick(nsec.summary, script);
    if (sum) body.appendChild(h('div', { class: 'ssum', text: sum }));
    var items = [];
    (nsec.glossary || []).forEach(function (g) {
      var it = h('div', { class: 'sgl' }, [h('span', { class: 'nterm', text: pick(g.term, script) }), h('span', { text: '　' + pick(g.note, script) })]);
      body.appendChild(it); items.push(it);
    });
    // no scrolling: drop glossary entries from the end until everything fits, then the summary is shortened
    var trimmed = false;
    while (items.length && body.scrollHeight > body.clientHeight + 1) { body.removeChild(items.pop()); trimmed = true; }
    if (trimmed) body.appendChild(h('div', { class: 'smore', text: '…' }));
    body.setAttribute('data-glossary', String(items.length));
  };
})();
