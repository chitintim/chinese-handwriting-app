(function () {
  'use strict';
  var MX = window.MX, h = MX.h;
  var CELL = 200, MARGIN = 24, MAXPX = 15000;

  function exportGrid(cfg, portrait, cell) {
    var g = MX.Layout.grid(portrait ? 3 : 4, portrait ? 4 : 3, cfg);
    g.cell = cell; g.ox = MARGIN; g.oy = MARGIN;
    g.W = g.cols * cell + 2 * MARGIN; g.H = g.rows * cell + 2 * MARGIN;
    return g;
  }
  function paintPage(ctx2d, g, pages, pageIdx, cp, opts, yOff) {
    var cfg = cp.copy.cfg, st = MX.Model.settings;
    var color = MX.Draw.TONE[st.tplTone] || MX.Draw.TONE.mid;
    var base = MX.Draw.INK_W[st.inkWidth] || 22;
    ctx2d.fillStyle = '#fff';
    ctx2d.fillRect(0, yOff, g.W, g.H);
    var page = pages[pageIdx];
    for (var s = 0; s < page.length; s++) {
      var idx = page[s];
      if (idx < 0) continue;
      var cr = MX.Layout.slotToColRow(g, s), x = g.ox + cr.col * g.cell, y = yOff + g.oy + cr.row * g.cell;
      MX.Draw.cell(ctx2d, x, y, g.cell, cp.cells[idx], {
        grid: opts.grid ? (cfg.grid === 'none' ? 'tian' : cfg.grid) : 'none',
        mode: opts.tpl ? cfg.mode : 'x', script: cfg.script, tplStyle: st.tplStyle, tplColor: color,
        punct: opts.tpl && cfg.punct === 'show', tpl: opts.tpl
      });
      var strokes = cp.copy.ink[idx] || [];
      for (var i = 0; i < strokes.length; i++) MX.Draw.paintFull(ctx2d, strokes[i], x, y, g.cell / 1000, base);
    }
  }
  function mk(w, hgt) {
    var c = document.createElement('canvas'); c.width = w; c.height = hgt;
    return c;
  }
  function stamp(cp) {
    return MX.fmtDate(Date.now());
  }

  var E = MX.Export = {
    // cp = {copy, text, cells}
    ctx: function (copy, text, cells) { return { copy: copy, text: text, cells: cells }; },
    pageCount: function (cp, portrait) {
      var g = exportGrid(cp.copy.cfg, portrait, CELL);
      return MX.Layout.paginate(cp.cells, g.perPage).length;
    },
    // scope: 'page' | 'all' | 'each'; returns [{name, dataUrl, w, h}]
    build: async function (cp, scope, o) {
      o = o || {};
      var opts = { grid: o.grid !== false, tpl: !!o.tpl };
      var portrait = o.portrait !== false;
      var cfg = cp.copy.cfg;
      if (opts.tpl) await MX.Draw.fontsReady(cfg.script, cp.cells.map(function (c) { return c.ch; }).join('').slice(0, 400));
      var cell = CELL;
      var g = exportGrid(cfg, portrait, cell);
      var pages = MX.Layout.paginate(cp.cells, g.perPage);
      var prefix = 'moxie-' + cp.copy.textId + '-' + stamp(cp);
      var out = [], ctx2d, c, i;
      if (scope === 'page') {
        var pi = MX.clamp(o.page || 0, 0, pages.length - 1);
        c = mk(g.W, g.H); ctx2d = c.getContext('2d');
        paintPage(ctx2d, g, pages, pi, cp, opts, 0);
        out.push({ name: prefix + '-p' + (pi + 1) + '.png', dataUrl: c.toDataURL('image/png'), w: g.W, h: g.H });
      } else if (scope === 'each') {
        for (i = 0; i < pages.length; i++) {
          c = mk(g.W, g.H); ctx2d = c.getContext('2d');
          paintPage(ctx2d, g, pages, i, cp, opts, 0);
          out.push({ name: prefix + '-p' + (i + 1) + '.png', dataUrl: c.toDataURL('image/png'), w: g.W, h: g.H });
        }
      } else {
        // stack all pages vertically; shrink cells if the result would be too tall
        var total = g.H * pages.length;
        if (total > MAXPX) {
          cell = Math.max(40, Math.floor((MAXPX / pages.length - 2 * MARGIN) / g.rows));
          g = exportGrid(cfg, portrait, cell);
        }
        c = mk(g.W, g.H * pages.length); ctx2d = c.getContext('2d');
        ctx2d.fillStyle = '#fff'; ctx2d.fillRect(0, 0, c.width, c.height);
        for (i = 0; i < pages.length; i++) {
          paintPage(ctx2d, g, pages, i, cp, opts, i * g.H);
          if (i) { ctx2d.fillStyle = '#ccc'; ctx2d.fillRect(0, i * g.H, g.W, 1); }
        }
        out.push({ name: prefix + '-all.png', dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height });
      }
      return out;
    },
    run: async function (cp, scope, o) {
      var files = await E.build(cp, scope, o), st = '';
      for (var i = 0; i < files.length; i++) st = await MX.saveFile(files[i].name, files[i].dataUrl, 'image/png');
      MX.toast(st);
      return files;
    },
    openSheet: function (cp, curPage, portrait) {
      var o = { scope: 'page', grid: true, tpl: false };
      var scopeSeg = MX.Form.seg([['page', '本頁'], ['all', '整份 (疊成一張)'], ['each', '逐頁下載']], o.scope, function (v) { o.scope = v; });
      var gridSeg = MX.Form.seg([[true, '有'], [false, '無']], o.grid, function (v) { o.grid = v; });
      var tplSeg = MX.Form.seg([[true, '有'], [false, '無']], o.tpl, function (v) { o.tpl = v; });
      MX.modal({
        title: '匯出圖片 (PNG)',
        body: [
          MX.Form.row('範圍', scopeSeg), MX.Form.row('格線', gridSeg), MX.Form.row('範本字', tplSeg),
          h('div', { class: 'note', text: '預設只輸出您的字跡與淡格線。' })
        ],
        buttons: [
          { label: '取消', act: 'cancel' },
          { label: '匯出', act: 'export', primary: true, onClick: function () {
            E.run(cp, o.scope, { grid: o.grid, tpl: o.tpl, page: curPage, portrait: portrait }).catch(function (e) { MX.err(e); MX.toast('匯出失敗'); });
          } }
        ]
      });
    },

    // ---- whole-app data backup ----
    json: function () {
      MX.Model.flushAll();
      return JSON.stringify({ app: 'moxie', version: 1, exportedAt: new Date().toISOString(), entries: MX.Store.exportAll() });
    },
    saveJson: async function () {
      var st = await MX.saveFile('moxie-backup-' + MX.fmtDate(Date.now()) + '.json', new Blob([E.json()], { type: 'application/json' }), 'application/json');
      MX.toast(st);
    },
    importText: function (text) {
      var o;
      try { o = JSON.parse(text); } catch (e) { throw new Error('不是有效的 JSON'); }
      if (!o || o.app !== 'moxie' || !o.entries || typeof o.entries !== 'object') throw new Error('不是墨的備份檔');
      MX.Store.importAll(o.entries);
      MX.Model.init();
      return Object.keys(o.entries).length;
    }
  };
})();
