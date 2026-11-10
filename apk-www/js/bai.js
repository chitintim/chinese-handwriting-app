(function () {
  'use strict';
  // 白話 beside the text while copying (docs/SPEC.md revision 24, docs/BAIHUA.md): a reading band next to the writing page with the sentences of the current page in plain modern
  // language. This file: the device setting (baiSide:v1, device-local), the language, the mapping page -> sentences, and the band's content. The layout of the page around the band
  // (lines taken away, band size) is practice.js; the data is MX.Library.getSectionBai (library/notes/bai/<id>.json: [{start, n, zh, simp, en}] per section, start = index of the
  // sentence's first body cell).
  var MX = window.MX, h = MX.h;
  var KEY = 'baiSide:v1';        // 1 = on; absent = off (default). Device-local like notesLang:v1 (js/store.js LOCAL_ONLY)
  var ONOFF = [[true, '開'], [false, '關']];
  var B = MX.Bai = {};

  B.on = function () {
    try { return !!MX.Store.get(KEY); } catch (e) { return false; }
  };
  B.set = function (v) {
    try { if (v) MX.Store.set(KEY, 1); else MX.Store.del(KEY); } catch (e) { MX.err(e); }
  };
  B.has = function (textId) { return MX.Library.hasBai(textId); };
  // 'en' while the English notes are shown (English interface, English chosen: MX.Notes.english), else the 白話 in the script of the copy: 'simp' or 'zh' (繁)
  B.lang = function (textId, script) {
    if (MX.Notes.english(textId)) return 'en';
    return script === 'simp' ? 'simp' : 'zh';
  };
  // the switch row of the 解說 page and of the practice sheet (label + 開 / 關); onChange(on) after the choice was stored
  B.row = function (onChange) {
    var row = MX.Form.row('抄寫時並列白話', MX.Form.seg(ONOFF, B.on(), function (v) { B.set(v); if (onChange) onChange(v); }), 'baiSide');
    row.setAttribute('data-role', 'bai-toggle');
    return row;
  };

  // index of the sentence that holds body cell number k (the numeric key of a body cell), -1 when none (a cell of the legacy 迴向 verse comes after the last sentence)
  B.segOf = function (segs, k) {
    var lo = 0, hi = segs.length - 1, m;
    if (!segs.length || k < 0 || k >= segs[hi].start + segs[hi].n) return -1;
    while (lo < hi) {
      m = (lo + hi + 1) >> 1;
      if (segs[m].start <= k) lo = m; else hi = m - 1;
    }
    return lo;
  };
  // the sentences overlapping the body cells of a page (page = cell indices, -1 = empty slot; title and 落款 cells have none), in order
  B.pageSegs = function (segs, cells, page) {
    var lo = -1, hi = -1, i, s, out = [];
    for (i = 0; i < page.length; i++) {
      if (page[i] < 0 || cells[page[i]].sec !== 'body') continue;
      s = B.segOf(segs, +cells[page[i]].key);
      if (s < 0) continue;
      if (lo < 0 || s < lo) lo = s;
      if (s > hi) hi = s;
    }
    for (i = lo; lo >= 0 && i <= hi; i++) out.push(i);
    return out;
  };
  // The cell the writer is at: from the focus (the cell written last; else the first cell of the page) the first cell without ink, else the first one without ink of the page, else the
  // focus. idx of the cell in `cells`, ink(idx) -> bool, page = cell indices, focus = cell index or -1.
  B.markCell = function (page, focus, hasInk) {
    var from = focus >= 0 ? page.indexOf(focus) : -1, i, c;       // (a pad slot of a page is -1 too: no focus is not a position)
    if (from < 0) from = 0;
    for (i = from; i < page.length; i++) { c = page[i]; if (c >= 0 && !hasInk(c)) return c; }
    for (i = 0; i < from; i++) { c = page[i]; if (c >= 0 && !hasInk(c)) return c; }
    return from < page.length && page[from] >= 0 ? page[from] : -1;
  };

  // ------------------------------------------------------------------ the band
  // o = { segs, list (sentence indices of the page), cur (sentence index of the mark or -1), from (position in `list` of the first sentence shown), off (px of the first sentence
  //       already read, only for a sentence taller than the band), lang ('zh' | 'simp' | 'en'), anchor(seg) -> the first characters of the original, onMore(from, off) }.
  // Builds the band's content; returns { from, count, off } as shown. No scrolling: what does not fit is left out, and a 更多 button (>= 56 px) shows the next ones (the band is paged;
  // a sentence taller than the whole band is read in steps of one band height).
  B.fill = function (el, o) {
    var body = h('div', { class: 'bbody', 'data-role': 'bai-body' }), items = [], i, k, used, foot = null, off = 0, big = false, again = false, wrap = false;
    el.innerHTML = '';
    el.appendChild(body);
    o.list.forEach(function (si) {
      var g = o.segs[si], txt = g[o.lang] || g.zh || '';
      var it = h('div', { class: 'bseg' + (si === o.cur ? ' cur' : ''), 'data-seg': si, 'data-cur': si === o.cur ? '1' : null, lang: o.lang === 'en' ? 'en' : (o.lang === 'simp' ? 'zh-Hans' : 'zh-Hant') }, [
        h('span', { class: 'ba', 'data-role': 'bai-anchor', 'data-zh': '', text: o.anchor(g) }), h('span', o.lang === 'en' ? { class: 'bt', text: txt } : { class: 'bt', 'data-zh': '', text: txt })]);
      items.push(it);
      body.appendChild(it);
    });
    var hs = items.map(function (it) { return it.offsetHeight; }), total = hs.reduce(function (a, b) { return a + b; }, 0), room = body.clientHeight;
    var from = Math.max(0, Math.min(o.from || 0, Math.max(0, items.length - 1))), count = items.length;
    if (total > room) {
      // does not fit: a button below the sentences, the sentences from `from` on as far as they fit (at least one)
      foot = h('div', { class: 'bfoot' }, [h('button', { type: 'button', class: 'bmore', 'data-act': 'bai-more', onclick: function () {
        if (again) o.onMore(from, Math.min(off + Math.max(room - 30, 20), hs[from] - room));
        else o.onMore(wrap ? 0 : from + count, 0);
      } })]);
      el.appendChild(foot);
      room = body.clientHeight;       // what is left above the button
      used = 0; count = 0;
      for (k = from; k < items.length; k++) {
        if (count && used + hs[k] > room) break;
        used += hs[k]; count++;
      }
      if (count === 1 && hs[from] > room) {
        big = true;
        off = Math.max(0, Math.min(o.off || 0, hs[from] - room));
        items[from].style.marginTop = (-off) + 'px';
      }
    } else from = 0;
    for (i = 0; i < items.length; i++) items[i].hidden = i < from || i >= from + count;
    el.setAttribute('data-from', String(from)); el.setAttribute('data-count', String(count)); el.setAttribute('data-total', String(items.length)); el.setAttribute('data-more', foot ? '1' : '0');
    el.setAttribute('data-off', String(off));
    if (foot) {
      again = big && off + room < hs[from]; wrap = !again && from + count >= items.length;
      foot.firstChild.textContent = wrap ? MX.t('回到開頭') : MX.t('更多');
    }
    return { from: from, count: count, off: off };
  };
})();
