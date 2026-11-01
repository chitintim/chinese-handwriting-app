(function () {
  'use strict';
  // 我的作品 (SPEC revision 21): every writing on this device in one list - in progress, finished, archived - newest first, filtered by status and text, each row with a small
  // static preview of its first page (drawn lazily, one at a time, cached), and the actions 繼續 / 檢視 / 匯出 / 備份 / 刪除.
  var MX = window.MX, h = MX.h, Model = MX.Model, Lib = MX.Library, Store = MX.Store, S = MX.Screens, U = S.ui, B = MX.Backup;
  var TW = 72, TH = 96;              // thumbnail box (CSS px): a portrait page
  var MAX_CACHE = 80;
  var STR = {
    title: '我的作品', all: '全部', doing: '進行中', done: '已完成', archived: '已存檔', status: '狀態', text: '文本', allTexts: '全部文本', pageN: '{p} / {n}',
    metaDoing: '第 {no} 遍 · 進度 {pct}% · 最後書寫 {date}', metaDone: '第 {no} 遍 · 已完成 · {date}', metaArchDone: '第 {no} 遍 · 已完成 · {date} · 已存檔',
    metaArchPart: '第 {no} 遍 · 進度 {pct}% · 最後書寫 {date} · 已存檔', fpTag: '內容已更新', gone: '（文本已移除）',
    cont: '繼續', view: '檢視', exp: '匯出', backup: '備份', del: '刪除',
    empty: '還沒有作品', emptyHint: '寫完的和寫到一半的字帖都會列在這裡。', noMatch: '沒有符合的作品', noMatchHint: '換一個狀態或文本看看。',
    delTitle: '刪除這份作品？', delDone: '這份作品會從這台裝置刪除，無法復原。要保留的話，請先按「備份」或「匯出」。', delDoing: '這份作品還沒寫完，刪除後無法復原。要保留的話，請先按「備份」。',
    delOk: '刪除', deleted: '已刪除', backupText: '備份這篇文本的全部作品', total: '共 {n} 份'
  };
  MX.I18n.live(STR);       // read through MX.t each time
  var FILTERS = ['all', 'doing', 'done', 'archived'];
  var cache = {}, order = [];       // thumbnails: key -> canvas
  var queue = [], busy = false;
  var stats = { drawn: 0, cached: 0, queued: 0 };

  function pct(c) { return c.total ? Math.min(100, Math.floor(100 * c.filled / c.total)) : 0; }
  function strokesOf(c, key) {
    if (c.ink) return c.ink[key] || [];
    var v = Store.get('ink:' + c.id + ':' + key), out = [];
    if (v && v.length) v.forEach(function (s) { var d = MX.Ink.decode(s); if (d) out.push(d); });
    return out;
  }
  function hasInk(c, key) { if (c.ink) return !!(c.ink[key] && c.ink[key].length); var v = Store.get('ink:' + c.id + ':' + key); return !!(v && v.length); }

  // ---- the preview: the first page (the first one with ink) of the writing in the tablet page geometry, ink only, pure black on white. Cheap on purpose: the strokes are
  // drawn as plain round-capped polylines (a cell is only ~12 px here), not with the brush model.
  function render(c, view) {
    var cfg = c.cfg || {}, cells = MX.Layout.cellsFor(view, c), dm = MX.Layout.DIMS[cfg.size] || MX.Layout.DIMS.M, cols = dm[0], rows = dm[1], dir = cfg.dir === 'h' ? 'h' : 'v';
    var g = { dir: dir, cols: cols, rows: rows, perPage: cols * rows }, pages = MX.Layout.paginate(cells, g), pg = pages[0], i, s, idx;
    for (i = 0; i < pages.length; i++) {
      if (pages[i].some(function (x) { return x >= 0 && hasInk(c, cells[x].key); })) { pg = pages[i]; break; }
    }
    var d = Math.min(window.devicePixelRatio || 1, 2), cv = h('canvas', { class: 'wcv', width: Math.round(TW * d), height: Math.round(TH * d), style: 'width:' + TW + 'px;height:' + TH + 'px' });
    var ctx = cv.getContext('2d'), cell = Math.floor(Math.min((TW - 4) / cols, (TH - 4) / rows)), ox = Math.floor((TW - cell * cols) / 2), oy = Math.floor((TH - cell * rows) / 2), n = 0;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, TW, TH);
    ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, cell * 0.085);
    for (s = 0; s < pg.length; s++) {
      idx = pg[s];
      if (idx < 0) continue;
      var cr = MX.Layout.slotToColRow(g, s), x0 = ox + cr.col * cell, y0 = oy + cr.row * cell, k = cell / 1000;
      strokesOf(c, cells[idx].key).forEach(function (st) {
        var m = st.length / 6, step = Math.max(1, Math.floor(m / 24)), j;
        ctx.beginPath();
        ctx.moveTo(x0 + st[0] * k, y0 + st[1] * k);
        for (j = step; j < m; j += step) ctx.lineTo(x0 + st[j * 6] * k, y0 + st[j * 6 + 1] * k);
        ctx.lineTo(x0 + st[(m - 1) * 6] * k, y0 + st[(m - 1) * 6 + 1] * k);
        if (m === 1) ctx.lineTo(x0 + st[0] * k + 0.1, y0 + st[1] * k);
        ctx.stroke();
        n++;
      });
    }
    cv.setAttribute('data-strokes', String(n));
    return cv;
  }
  function cacheKey(c) { return c.id + '|' + Model.stamp(c) + '|' + (c.filled || 0) + '|' + ((c.cfg || {}).size || '') + ((c.cfg || {}).dir || ''); }
  function remember(key, cv) {
    cache[key] = cv; order.push(key);
    while (order.length > MAX_CACHE) delete cache[order.shift()];
  }
  // The previews (and the text lookups of the rows) are made one row at a time, ~12 ms apart, and only for rows that are on the screen when their turn comes: a list of
  // hundreds of writings costs the page that is shown, not the whole list. A finished preview is cached (by copy + last change) and reused.
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    setTimeout(function () {
      var job;
      while ((job = queue.shift()) && !job.row.isConnected) { /* rows of an earlier render that are gone */ }
      busy = false;
      if (job) { try { hydrate(job.row, job.c, job.e); } catch (er) { MX.err(er); } }
      if (queue.length) pump();
    }, 12);
  }
  function hydrate(r, c, e) {
    var box = r.querySelector('[data-role=thumb]'), title = r.querySelector('[data-role=title]'), meta = r.querySelector('[data-role=meta]'), key = cacheKey(c), cv = cache[key];
    if (cv) { stats.cached++; box.appendChild(cv); box.setAttribute('data-thumb', 'done'); }
    Lib.getView(c.textId, Model.sid(c)).then(function (v) {
      if (!r.isConnected) return;
      if (!cv) {
        cv = cache[key] || render(c, v);
        if (!cache[key]) { remember(key, cv); stats.drawn++; }
        box.appendChild(cv); box.setAttribute('data-thumb', 'done');
      }
      if (e && v.multi) { title.textContent = ''; title.appendChild(Lib.bi(Lib.join([e.title, v.sectionTitle], ' · '), true)); }
      if (Model.fpChanged(c, v)) { r.setAttribute('data-fp', 'changed'); meta.textContent += ' · ' + STR.fpTag; }
    }).catch(function () { if (!cv) box.setAttribute('data-thumb', 'none'); });
  }

  // ---- rows
  function metaOf(c) {
    var st = Model.workStatus(c), no = MX.Export.writingNo(c), date = MX.fmtDate(MX.Export.copyDate(c)), p = pct(c);
    var tpl = st === 'doing' ? STR.metaDoing : (st === 'done' ? STR.metaDone : (c.completedAt ? STR.metaArchDone : STR.metaArchPart));
    return MX.fmt(tpl, { no: no, pct: p, date: date });
  }
  function row(c, again) {
    var st = Model.workStatus(c), e = Lib.entry(c.textId), thumb = h('div', { class: 'wthumb', 'data-role': 'thumb' });
    var title = h('div', { class: 't', 'data-role': 'title' }, [e ? Lib.bi(e.title, true) : c.textId + STR.gone]);       // the English interface adds the English title below the Chinese one
    var meta = h('div', { class: 'm', 'data-role': 'meta', text: metaOf(c) });
    var btns = h('div', { class: 'lbtns' });
    function btn(label, act, fn, primary) { btns.appendChild(h('button', { class: primary ? 'on' : '', 'data-act': act, text: label, onclick: fn })); }
    if (st !== 'archived') btn(STR.cont, 'continue', function () { location.hash = S.hash('practice', c.id); }, true);
    btn(STR.view, 'view', function () { location.hash = S.hash('view', c.id); }, st === 'archived');
    btn(STR.exp, 'export', function () { S.exportCopy(c).catch(function (er) { MX.err(er); MX.toast(MX.t('匯出失敗')); }); });
    btn(STR.backup, 'backup', function () { B.save({ copy: c.id }).catch(function (er) { MX.err(er); MX.toast(B.STR.saveFail); }); });
    btn(STR.del, 'delete', async function () {
      var ok = await MX.confirm(st === 'doing' ? STR.delDoing : STR.delDone, STR.delOk, STR.delTitle);
      if (!ok) return;
      Model.remove(c);
      MX.toast(STR.deleted);
      again();
    });
    var r = h('div', { class: 'lrow work', 'data-role': 'work', 'data-copy': c.id, 'data-status': st, 'data-text': c.textId, 'data-completed': c.completedAt ? '1' : '0' }, [
      thumb, h('div', { class: 'lmain', onclick: function () { location.hash = S.hash(st === 'archived' ? 'view' : 'practice', c.id); } }, [title, meta]), btns
    ]);
    if (e) title.style.fontFamily = U.uiFont(c.cfg && c.cfg.script);
    thumb.setAttribute('data-thumb', 'pending');
    queue.push({ row: r, c: c, e: e });
    pump();
    return r;
  }

  // ---- the screen: #/works?f=<all|doing|done|archived>&t=<textId>&p=<page>
  S.works = function (root, query) {
    var q = U.qs(query), st = { p: parseInt(q.p, 10) || 1, f: FILTERS.indexOf(q.f) >= 0 ? q.f : 'all', t: q.t || '' }, pl;
    var el = U.screen(root, STR.title, '#/', null, [[MX.t('首頁'), '#/'], [STR.title, S.hash('works')]]);
    el.setAttribute('data-screen', 'works');
    function link(s) {
      var a = [];
      if (s.f !== 'all') a.push('f=' + s.f);
      if (s.t) a.push('t=' + encodeURIComponent(s.t));
      if (s.p > 1) a.push('p=' + s.p);
      return S.hash('works', null, null, a.join('&'));
    }
    function inText(c) { return !st.t || c.textId === st.t; }
    function inFilter(c, f) {
      var s = Model.workStatus(c);
      return f === 'all' || (f === 'doing' && s === 'doing') || (f === 'done' && !!c.completedAt) || (f === 'archived' && s === 'archived');
    }
    var all = Model.works(), texts = [];
    all.forEach(function (c) { if (texts.indexOf(c.textId) < 0) texts.push(c.textId); });
    if (st.t && texts.indexOf(st.t) < 0) st.t = '';
    var ctl = h('div', { class: 'ctl', 'data-role': 'controls' }), segHost = h('div', { class: 'seghost' }), total = h('div', { class: 'note', 'data-role': 'works-total' });
    var sel = null, bk = null;
    function drawSeg() {
      segHost.innerHTML = '';
      var opts = FILTERS.map(function (f) {
        var n = Model.works().filter(function (c) { return inText(c) && inFilter(c, f); }).length;
        return [f, STR[f] + ' ' + n];
      });
      var seg = MX.Form.seg(opts, st.f, function (v) { st.f = v; st.p = 1; drawSeg(); pl.render(); pl.sync(); }, false);
      seg.setAttribute('data-role', 'work-filter');
      segHost.appendChild(MX.Form.row(STR.status, seg, 'status'));
    }
    if (texts.length > 1) {
      sel = h('select', { 'data-role': 'text-filter', 'aria-label': STR.text, onchange: function () { st.t = sel.value; st.p = 1; drawSeg(); pl.render(); pl.sync(); drawBk(); } },
        [h('option', { value: '', text: STR.allTexts })].concat(texts.map(function (id) {
          var e = Lib.entry(id);
          return h('option', { value: id, text: e ? Lib.ts(e.title) : id, selected: id === st.t ? true : null });
        })));
    }
    var bkHost = h('div', { class: 'bkhost' });
    function drawBk() {
      bkHost.innerHTML = '';
      if (st.t) bkHost.appendChild(h('button', { text: STR.backupText, 'data-act': 'backup-text', onclick: function () { B.save({ text: st.t }).catch(function (er) { MX.err(er); MX.toast(B.STR.saveFail); }); } }));
    }
    ctl.appendChild(segHost);
    if (sel) ctl.appendChild(MX.Form.row(STR.text, sel, 'text'));
    ctl.appendChild(bkHost);
    el.appendChild(ctl);
    el.appendChild(total);
    var rowH = MX.I18n.isEn() ? (MX.Device.isPhone() ? 240 : 170) : (MX.Device.isPhone() ? 176 : 154);       // the English interface: taller rows (names in two languages, buttons on two lines)
    pl = U.pagedHost(el, {
      state: st, link: link, rowH: rowH, single: true, minPer: 1,
      rows: function () {
        var list = Model.works().filter(function (c) { return inText(c) && inFilter(c, st.f); });
        total.textContent = MX.fmt(STR.total, { n: list.length });
        return list.map(function (c) { return row(c, function () { drawSeg(); pl.render(); }); });
      },
      empty: function () { return all.length ? U.empty(STR.noMatch, STR.noMatchHint) : U.empty(STR.empty, STR.emptyHint); }
    });
    drawSeg(); drawBk();
    pl.render();
  };
  MX.Works = { STR: STR, stats: function () { return { drawn: stats.drawn, cached: stats.cached, queued: queue.length, cache: order.length }; }, clearCache: function () { cache = {}; order = []; queue = []; } };
})();
