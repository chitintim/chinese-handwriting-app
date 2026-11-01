(function () {
  'use strict';
  var MX = window.MX, h = MX.h, E = MX.Export, I = E.int, Draw = MX.Draw, Layout = MX.Layout, Closing = MX.Closing, PAPER = MX.Pdf.PAPER;

  // ---------------------------------------------------------------------------------------------------------------------------------
  // 列印用 PDF and 描紅練習紙 (docs/EXPORT.md "Print PDF", "Practice sheets").
  //  * printPlan(L, dpi): where every sheet of PAPER goes: the pixel size of the paper is paper mm x dpi (A4 at 300 dpi = 2480 x 3508 px, never the 16 MP canvas cap), the page of
  //    the composition (or one cut of a 手卷) is placed in the printable area (paper minus margin) and clipped to it.
  //  * every sheet is painted tile by tile on one reused canvas (encodeRegion of export.js, bands of whole rows) and written by the streaming zlib encoder of pngstream.js as a
  //    lossless Flate image (8-bit grey, or RGB when the sheet has vermilion rules / a seal); pdf.js wraps the sheets.
  //  * practice sheets (composePractice): the tracing template of a text on paper, no user ink.
  // ---------------------------------------------------------------------------------------------------------------------------------
  var GREY = '#cfcfcf';          // template glyphs of an exported 作品 on paper: a real, neutral grey (the on-screen TPL_COL is a warm ivory tone)
  var TXT = '#666666';           // header / page numbers: dark grey, never the black of ink

  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  // ------------------------------------------------------------------ paper geometry
  // px of the paper at dpi: W x H, margin m, printable area (ax, ay, aw, ah); pt = the PDF page size
  function paperPx(d, dpi) {
    var P = PAPER[d.paperSize], l = d.orient === 'l', k = dpi / 25.4;
    var wmm = l ? P.mm[1] : P.mm[0], hmm = l ? P.mm[0] : P.mm[1], W = Math.round(wmm * k), H = Math.round(hmm * k), m = Math.round(d.margin * k);
    return { W: W, H: H, m: m, ax: m, ay: m, aw: W - 2 * m, ah: H - 2 * m, k: k, wmm: wmm, hmm: hmm, pw: l ? P.pt[1] : P.pt[0], ph: l ? P.pt[0] : P.pt[1] };
  }
  // does a page of a composition need colour? (vermilion rules, 米字格, the seal; everything else is black or grey)
  function pageColor(pg) {
    return pg.items.some(function (it) { return it.t === 'seal' || it.t === 'mi' || (it.t === 'line' && it.col === I.RULE_ZHU); });
  }
  // x centres (cell units) of the free gaps between the characters / seals of a page, in increasing order
  function gapsOf(pg) {
    var iv = [], gaps = [], end = -Infinity, i;
    pg.items.forEach(function (it) {
      var w;
      if (it.t === 'cell' || it.t === 'glyph' || it.t === 'punct') w = it.s; else if (it.t === 'seal') w = it.w; else return;
      iv.push([it.x, it.x + w]);
    });
    iv.sort(function (a, b) { return a[0] - b[0]; });
    for (i = 0; i < iv.length; i++) {
      if (end > -Infinity && iv[i][0] - end >= 0.02) gaps.push((end + iv[i][0]) / 2);
      if (iv[i][1] > end) end = iv[i][1];
    }
    return gaps;
  }
  // The cuts of a 手卷 over paper pages: [[x0, x1] ...] in cell units, first = the right end (the part read first). A cut always goes through the middle of the gap between
  // two columns (the 朱絲欄 rule that lies there is drawn on both sheets, see RULE_EXT), the page takes as many columns as fit the printable width (capX cells).
  function scrollCuts(pg, capX) {
    var gaps = gapsOf(pg), out = [], R = pg.w, i, c, Lm;
    capX = Math.max(1, capX);
    for (;;) {
      Lm = R - capX;
      if (Lm <= 1e-6) { out.push([0, R]); break; }
      c = null;
      for (i = 0; i < gaps.length; i++) if (gaps[i] >= Lm - 1e-9 && gaps[i] < R - 0.5) { c = gaps[i]; break; }
      if (c === null) c = Lm;
      out.push([c, R]);
      R = c;
    }
    return out;
  }
  var RULE_EXT = 0.012;        // cells of paper each sheet of a cut 手卷 keeps beyond its cut: the rule lying in the gap (<= 0.008 cell wide) stays whole on both sheets

  // The plan of a printed document: {dpi, g (paperPx), pages: [{src, u, shiftX, shiftY, clip: [x0, y0, x1, y1], color, no, of}]}. A paper pixel (X, Y) shows the page pixel
  // (X - shiftX, Y - shiftY) of page `src` at u px per cell; only inside `clip`; the rest of the paper is white.
  function printPlan(L, dpi) {
    var d = L.d, g = paperPx(d, dpi), pages = [];
    if (L.kind === 'practice') {
      var u0 = d.cellMm * g.k;
      L.pages.forEach(function (pg, i) { pages.push({ src: i, u: u0, shiftX: 0, shiftY: 0, clip: [0, 0, g.W, g.H], color: d.gridColor === 'red' }); });
    } else if (d.format === 'scroll') {
      var pg = L.pages[0], u = g.ah / pg.h, regs = scrollCuts(pg, g.aw / u), col = pageColor(pg), hh = Math.round(pg.h * u), e = Math.ceil(RULE_EXT * u);
      regs.forEach(function (r, i) {
        var wpx = Math.round((r[1] - r[0]) * u), x0 = g.ax + Math.round((g.aw - wpx) / 2);
        pages.push({ src: 0, u: u, shiftX: x0 - Math.round(r[0] * u), shiftY: g.ay, clip: [x0 - (r[0] > 0 ? e : 0), g.ay, x0 + wpx + (r[1] < pg.w ? e : 0), g.ay + hh],
          color: col, no: regs.length > 1 ? i + 1 : 0, of: regs.length, region: r });
      });
    } else {
      L.pages.forEach(function (pg, i) {
        var u = Math.min(g.aw / pg.w, g.ah / pg.h), w = Math.floor(pg.w * u), hh = Math.floor(pg.h * u), ox = g.ax + Math.floor((g.aw - w) / 2), oy = g.ay + Math.floor((g.ah - hh) / 2);
        pages.push({ src: i, u: u, shiftX: ox, shiftY: oy, clip: [ox, oy, ox + w, oy + hh], color: pageColor(pg) });
      });
    }
    return { dpi: dpi, g: g, pages: pages };
  }

  // ------------------------------------------------------------------ painting one sheet of paper (a tile of it)
  // Paint the tile (tx, ty, tw x th) of paper page `pp` of plan `pl` on ctx (origin = the tile's top-left): white paper, then the composition inside the clip, then the page number.
  function paintPaperTile(ctx, cp, L, pl, pp, tx, ty, tw, th) {
    var g = pl.g, cx0 = Math.max(0, pp.clip[0] - tx), cy0 = Math.max(0, pp.clip[1] - ty), cx1 = Math.min(tw, pp.clip[2] - tx), cy1 = Math.min(th, pp.clip[3] - ty);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
    if (cx1 > cx0 && cy1 > cy0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(cx0, cy0, cx1 - cx0, cy1 - cy0); ctx.clip();
      ctx.setTransform(1, 0, 0, 1, pp.shiftX - tx, pp.shiftY - ty);
      var cull = { x0: tx - pp.shiftX, y0: ty - pp.shiftY, x1: tx + tw - pp.shiftX, y1: ty + th - pp.shiftY };
      if (L.kind === 'practice') paintPractice(ctx, L, L.pages[pp.src], pp.u, cull);
      else I.paintItems(ctx, cp, L, L.pages[pp.src], pp.u, cull);
      ctx.restore();
    }
    if (pp.no) {      // 手卷 cut over several sheets: "2 / 5" small, grey, centred in the bottom margin
      var sz = Math.max(8, Math.round(3.4 * g.k));
      ctx.setTransform(1, 0, 0, 1, -tx, -ty);
      ctx.fillStyle = TXT; ctx.font = sz + 'px ' + Draw.fam(L.d.script, L.d.font); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pp.no + ' / ' + pp.of, g.W / 2, g.H - Math.max(g.m, sz) / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  // the zlib stream of one sheet (grey or RGB): rows of the paper, band by band
  async function encodeSheet(cp, L, pl, pp, ctl, tick) {
    var g = pl.g, lim = I.limits(ctl), reg = { x0: 0, y0: 0, w: g.W, h: g.H };
    function run(color) {
      return I.encodeRegion(cp, L, null, pp.u, reg, lim, ctl || {}, tick, 'print', {
        paint: function (ctx, tx, ty, tw, th) { paintPaperTile(ctx, cp, L, pl, pp, tx, ty, tw, th); }, channels: color ? 3 : 1, zlib: true
      });
    }
    try { return { z: await run(pp.color), color: pp.color }; } catch (e) {
      if (!pp.color && /colour in a grey page/.test(String(e && e.message))) { MX.err(e); return { z: await run(true), color: true }; }      // a coloured pixel the plan did not expect
      throw e;
    }
  }

  function paperLabel(d) { return d.paperSize + (d.orient === 'l' ? '橫' : '直'); }
  // ------------------------------------------------------------------ the print PDF of a copy
  // o: the export options (format, perLine, rules, ... and paperSize, orient, margin, dpi). The composition fills the printable area (resolve() sets the ratio to it); 單張 and
  // 分頁 sheets are placed 1 : 1 on paper pages, a 手卷 is cut between columns over as many sheets as it needs.
  E.buildPrint = async function (cp, o, ctl) {
    ctl = ctl || {};
    var L = E.compose(cp, Object.assign({}, o, { out: 'print', paper: 'white', merge: false })), d = L.d, out = [], notes = [];
    out.notes = notes;
    L.pages.forEach(function (pg) { pg.items.forEach(function (it) { if (it.role === 'tpl') it.col = GREY; }); });
    await E.prepare(cp, L);
    await Draw.fontsReady(d.script, '0123456789/ ', d.font);
    var pl = printPlan(L, d.dpi), total = Math.max(1, pl.pages.length * pl.g.W * pl.g.H), done = 0, docs = [], i;
    async function tick(px) {
      done += px;
      if (ctl.progress) ctl.progress(Math.min(1, done / total));
      await I.yieldUi();
    }
    for (i = 0; i < pl.pages.length; i++) {
      var r = await encodeSheet(cp, L, pl, pl.pages[i], ctl, tick);
      docs.push({ w: pl.g.W, h: pl.g.H, pw: pl.g.pw, ph: pl.g.ph, color: r.color, z: r.z });
    }
    var base = E.baseName(cp, d), blob = MX.Pdf.build(docs, { title: base });
    var f = { name: base + '-列印' + paperLabel(d) + '.pdf', blob: blob, mime: 'application/pdf', w: pl.g.W, h: pl.g.H, pages: docs.length, size: blob.size, dpi: d.dpi, sheets: docs.map(function (x) { return x.color ? 'rgb' : 'gray'; }) };
    if (ctl.sink) { f.status = await ctl.sink(f); f.blob = null; }
    out.push(f);
    return out;
  };
  // Size estimate of a sheet (bytes), fitted to measurements (A4, 心經, lossless Flate): the paper with its text and rules costs 14 KB (grey) / 27 KB (RGB) at 150 dpi, 33 / 68 KB at 300 dpi;
  // the ink costs about 3 (grey) / 5 (RGB) bytes per stroke and pixel of cell size (strokes crossing a cell; real, shorter strokes cost less).
  function estSheet(g, dpi, color) { return g.W * g.H * 0.0038 * Math.pow(300 / dpi, 0.75) * (color ? 2.05 : 1); }
  // numbers for the export screen without rendering
  E.printInfo = function (L, ctl) {
    var d = L.d, pl = printPlan(L, d.dpi), g = pl.g, n = pl.pages.length, pg0 = L.pages[pl.pages[0].src], cellMm = pl.pages[0].u / g.k;
    var lines = [], bytes = 0;
    pl.pages.forEach(function (pp) {
      var ink = 0;
      L.pages[pp.src].items.forEach(function (it) { if (it.t === 'cell') ink += (L.kind === 'practice' ? 0 : ((ctl && ctl.cp && ctl.cp.copy.ink[ctl.cp.cells[it.i].key]) || []).length); });
      bytes += estSheet(g, d.dpi, pp.color) + ink * pp.u * (pp.color ? 4.8 : 3.1);
    });
    lines.push(d.paperSize + (d.orient === 'l' ? ' 橫向 ' : ' 直向 ') + Math.round(g.wmm) + '×' + Math.round(g.hmm) + ' mm，邊界 ' + d.margin + ' mm，每個字約 ' + (Math.round(cellMm * 10) / 10) + ' mm（' + Math.round(pl.pages[0].u) + ' 像素）。');
    if (d.format === 'scroll' && n > 1) lines.push('手卷分成 ' + n + ' 頁，在欄與欄之間切開，第 1 頁在最右邊，由右到左並排。');
    var r = { cell: null, pdf: true, print: true, files: 1, lim: I.limits(ctl), capped: false, u: pl.pages[0].u, notes: lines, bytes: bytes, big: false, strips: false, pages: n };
    r.images = pl.pages.map(function (pp, i) { return { spec: { page: i }, w: g.W, h: g.H, mode: 'print', strips: 1 }; });
    r.px = n * g.W * g.H; r.maxPx = g.W * g.H;
    return r;
  };
  // the preview: sheet idx of the document at a small dpi (the long side of the paper = maxPx pixels). {cv, page, pages, W, H (px of the real document)}
  E.renderPrintPreview = function (cp, L, idx, maxPx) {
    var d = L.d, full = paperPx(d, d.dpi), dpi = Math.max(20, Math.min(d.dpi, maxPx / (Math.max(full.wmm, full.hmm) / 25.4)));
    var pl = printPlan(L, dpi), i = MX.clamp(idx, 0, pl.pages.length - 1), cv = document.createElement('canvas');
    cv.width = pl.g.W; cv.height = pl.g.H;
    paintPaperTile(cv.getContext('2d'), cp, L, pl, pl.pages[i], 0, 0, pl.g.W, pl.g.H);
    return { cv: cv, page: i, pages: pl.pages.length, W: full.W, H: full.H };
  };
  E.printPlan = printPlan;

  // =================================================================================================================================
  // 描紅練習紙: the tracing template of a text (or one section) on paper, no ink.
  // =================================================================================================================================
  var MODES = [['trace', '描'], ['copy', '臨'], ['recall', '默']], MODE_NAME = { trace: '描紅', copy: '臨帖', recall: '默寫' };
  var GRID_KINDS = [['mi', '米字格'], ['tian', '田字格'], ['fang', '方格'], ['none', '無格']];
  var TONES = [['light', '淺'], ['mid', '中'], ['dark', '深']];
  var CELLS_MM = [15, 20, 25, 30];
  var COL = { gray: { box: '#8e8e8e', guide: '#c4c4c4', model: '#b4b4b4' }, red: { box: '#d9877c', guide: '#ecc3bd', model: '#e4aaa2' } };

  function dpi300(dpi) { return dpi / 300; }
  function gridKindOf(cfg) {
    var g = Draw.gridOf(cfg || {});
    if (!g.box && !g.guide) return 'none';
    if (!g.guide) return 'fang';
    return g.style === 'tian' ? 'tian' : 'mi';
  }
  function practiceOpts(cfg, o) {
    o = o || {};
    cfg = cfg || {};
    var st = MX.Model.settings, d = {
      mode: pick(o.mode !== undefined ? o.mode : cfg.mode, ['trace', 'copy', 'recall'], 'trace'),
      script: (o.script !== undefined ? o.script : cfg.script) === 'simp' ? 'simp' : 'trad',
      dir: (o.dir !== undefined ? o.dir : cfg.dir) === 'h' ? 'h' : 'v',
      gridKind: pick(o.gridKind !== undefined ? o.gridKind : gridKindOf(cfg), ['mi', 'tian', 'fang', 'none'], 'mi'),
      gridColor: o.gridColor === 'red' ? 'red' : 'gray',
      cellMm: pick(+o.cellMm, CELLS_MM, 25),
      tone: pick(o.tone, ['light', 'mid', 'dark'], 'light'),
      tplStyle: o.tplStyle === 'outline' ? 'outline' : 'fill',
      title: o.title !== undefined ? !!o.title : cfg.title !== false,
      sign: o.sign !== undefined ? !!o.sign : cfg.sign !== false,
      header: o.header !== false, ref: o.ref !== false,
      punct: (o.punct !== undefined ? !!o.punct : true) && cfg.punct === 'show',
      font: o.font || st.tplFont, name: String(st.name || '').replace(/\s+/g, ''),
      paperSize: PAPER[o.paperSize] ? o.paperSize : 'A4',
      orient: o.orient === 'l' ? 'l' : 'p',
      margin: +o.margin >= 4 && +o.margin <= 30 ? +o.margin : 12,
      dpi: E.DPI_LIST.indexOf(+o.dpi) >= 0 ? +o.dpi : 300,
      out: 'print', format: 'pages'
    };
    d.sign = d.sign && !!d.name;
    return d;
  }

  // Compose the practice sheets of `view` (Library.getView) with the copy choices `cfg` and the options `o`. Positions are in cells of the sheet (1 = one practice cell = cellMm), the
  // origin is the top-left corner of the PAPER. Pure geometry (no canvas): pages of items {t: grid | tpl | model | punct | text}.
  function composePractice(view, cfg, o) {
    var d = practiceOpts(cfg, o), P = PAPER[d.paperSize], l = d.orient === 'l', Wmm = l ? P.mm[1] : P.mm[0], Hmm = l ? P.mm[0] : P.mm[1], v = d.dir === 'v', paired = d.mode === 'copy';
    var cells = Layout.buildCells(view, { script: d.script, title: d.title, closing: false, sign: d.sign }, d.sign ? Closing.signFor({ cfg: { script: d.script, sign: true }, createdAt: Date.now() }, view) : []);
    var avW = Wmm - 2 * d.margin, hdr = d.header ? 9 : 0, ftr = 3, c = Math.min(d.cellMm, avW, Hmm - 2 * d.margin - hdr - ftr), tries = 0, pages, g, cols, rows, lines, refLines = 0, perRef;
    for (; tries < 3; tries++) {
      cols = Math.max(1, Math.floor((avW + 1e-6) / c)); rows = Math.max(1, Math.floor((Hmm - 2 * d.margin - hdr - ftr + 1e-6) / c));
      lines = paired ? Math.max(1, Math.floor((v ? cols : rows) / 2)) : (v ? cols : rows);
      g = v ? { dir: 'v', cols: lines, rows: rows, perPage: lines * rows } : { dir: 'h', cols: cols, rows: lines, perPage: cols * lines };
      pages = Layout.paginate(cells, g);
      if (d.mode !== 'recall' || !d.ref) break;
      perRef = Math.max(8, Math.floor(avW / 3.8));
      var most = pages.reduce(function (a, p) { return Math.max(a, p.filter(function (x) { return x >= 0; }).length); }, 0), need = Math.min(8, Math.ceil((most + 3) / perRef));
      if (need === refLines) break;
      refLines = need; ftr = 3 + refLines * 4.8;
    }
    var physC = v ? (paired ? lines * 2 : lines) : cols, physR = v ? rows : (paired ? lines * 2 : lines);
    var gx = (d.margin + (avW - physC * c) / 2) / c, gy = (d.margin + hdr) / c, k = 1 / c, fs = 3.6 * k, out = [], title = (view.multi ? view.textTitle[d.script] + ' · ' + view.sectionTitle[d.script] : view.title[d.script]);
    pages.forEach(function (pg, pi) {
      var items = [], idxs = [];
      pg.forEach(function (idx, s) {
        if (idx < 0) return;
        var cr = Layout.slotToColRow(g, s), cell = cells[idx], pc, pr, mc, mr;
        if (!paired) { pc = cr.col; pr = cr.row; } else if (v) { pc = 2 * cr.col; pr = cr.row; mc = pc + 1; mr = pr; } else { pc = cr.col; pr = 2 * cr.row + 1; mc = pc; mr = pr - 1; }
        idxs.push(idx);
        items.push({ t: 'grid', x: gx + pc, y: gy + pr, s: 1, kind: d.gridKind });
        if (d.mode === 'trace') items.push({ t: 'tpl', ch: cell.ch, x: gx + pc, y: gy + pr, s: 1 });
        if (paired) {
          items.push({ t: 'grid', x: gx + mc, y: gy + mr, s: 1, kind: d.gridKind === 'none' ? 'none' : 'model' });
          items.push({ t: 'model', ch: cell.ch, x: gx + mc, y: gy + mr, s: 1 });
        }
        if (d.punct && cell.punct) items.push({ t: 'punct', ch: cell.punct, x: gx + pc + 0.66, y: gy + pr + 0.7, s: 0.2 });
      });
      if (d.header) {
        items.push({ t: 'text', str: title + '　' + MODE_NAME[d.mode], x: d.margin * k, y: (d.margin + hdr * 0.55) * k, s: fs, align: 'left' });
        if (pages.length > 1) items.push({ t: 'text', str: (pi + 1) + ' / ' + pages.length, x: (Wmm - d.margin) * k, y: (d.margin + hdr * 0.55) * k, s: fs, align: 'right' });
      }
      if (d.mode === 'recall' && d.ref && refLines) {
        var chars = Array.from(idxs.map(function (i) { return cells[i].ch; }).join('')), q;
        for (q = 0; q * perRef < chars.length; q++) {
          items.push({ t: 'text', str: (q ? '' : '參考：') + chars.slice(q * perRef, (q + 1) * perRef).join(''), x: d.margin * k, y: (Hmm - d.margin - (refLines - q - 0.35) * 4.8) * k, s: fs, align: 'left' });
        }
      }
      out.push({ w: Wmm * k, h: Hmm * k, items: items, index: pi, cells: idxs.length });
    });
    d.cellMm = c;       // the cell size really used (a big cell is reduced to fit a small paper)
    return { kind: 'practice', d: d, cells: cells, pages: out, cellMm: c, cols: cols, rows: rows, perPage: g.perPage, title: title, view: view };
  }

  // glyph with a grey outline (descender-safe centring like Draw.glyph)
  function outlineGlyph(ctx, ch, cx, cy, size, d, color, lw) {
    ctx.save();
    ctx.font = Math.round(size) + 'px ' + Draw.fam(d.script, d.font);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(ch), y = cy + (m && m.actualBoundingBoxAscent !== undefined ? (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 : size * 0.35);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
    ctx.strokeText(ch, cx, y);
    ctx.restore();
  }
  // Paint a practice page at u px per cell (pmm = px per mm). Real greys; box 0.25 mm, dashed guides 0.18 mm.
  function paintPractice(ctx, L, pg, u, cull) {
    var d = L.d, pmm = u / d.cellMm, col = COL[d.gridColor], st = MX.Model.settings, sc = Draw.tplScale(st.tplSize), tone = Draw.TONE[d.tone] || Draw.TONE.light;
    pg.items.forEach(function (it) {
      var x = it.x * u, y = it.y * u, s = it.s * u, lw, b;
      if (cull && it.t !== 'text') {
        b = [x - 4, y - 4, x + s + 4, y + s + 4];
        if (b[0] >= cull.x1 || b[2] <= cull.x0 || b[1] >= cull.y1 || b[3] <= cull.y0) return;
      }
      switch (it.t) {
        case 'grid':
          if (it.kind === 'none') break;
          lw = Math.max(1, 0.25 * pmm);
          ctx.setLineDash([]);
          ctx.strokeStyle = it.kind === 'model' ? col.model : col.box; ctx.lineWidth = lw;
          ctx.strokeRect(x + lw / 2, y + lw / 2, s - lw, s - lw);
          if (it.kind === 'mi' || it.kind === 'tian') {
            ctx.strokeStyle = col.guide; ctx.lineWidth = Math.max(1, 0.18 * pmm);
            ctx.setLineDash([1.6 * pmm, 1.2 * pmm]);
            ctx.beginPath();
            ctx.moveTo(x + s / 2, y + lw); ctx.lineTo(x + s / 2, y + s - lw);
            ctx.moveTo(x + lw, y + s / 2); ctx.lineTo(x + s - lw, y + s / 2);
            if (it.kind === 'mi') { ctx.moveTo(x + lw, y + lw); ctx.lineTo(x + s - lw, y + s - lw); ctx.moveTo(x + s - lw, y + lw); ctx.lineTo(x + lw, y + s - lw); }
            ctx.stroke();
            ctx.setLineDash([]);
          }
          break;
        case 'tpl':
          if (d.tplStyle === 'outline') outlineGlyph(ctx, it.ch, x + s / 2, y + s / 2, s * sc, d, tone, Math.max(1, 0.2 * pmm));
          else Draw.glyph(ctx, it.ch, x + s / 2, y + s / 2, s * sc, { script: d.script, font: d.font, style: 'fill', color: tone });
          break;
        case 'model':
          Draw.glyph(ctx, it.ch, x + s / 2, y + s / 2, s * sc, { script: d.script, font: d.font, style: 'fill', color: '#262626' });
          break;
        case 'punct':
          Draw.glyph(ctx, it.ch, x, y, s, { script: d.script, font: d.font, style: 'fill', color: TXT });
          break;
        case 'text':
          ctx.fillStyle = TXT; ctx.font = Math.max(6, Math.round(it.s * u)) + 'px ' + Draw.fam(d.script, d.font); ctx.textAlign = it.align || 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(it.str, x, y);
          break;
      }
    });
  }
  function practiceFontText(L) {
    var s = '';
    L.pages.forEach(function (pg) { pg.items.forEach(function (it) { if (it.ch) s += it.ch; if (it.str) s += it.str; }); });
    return s + '0123456789 /參考描紅臨帖默寫';
  }
  function practiceName(L) {
    var d = L.d, nm = E.shortName({ text: L.view, copy: { textId: L.view.textId } }, d);
    return nm + '-' + (d.script === 'simp' ? '简' : '繁') + '-練習紙-' + { trace: '描', copy: '臨', recall: '默' }[d.mode] + '-' + paperLabel(d) + '.pdf';
  }
  async function buildPractice(L, ctl) {
    ctl = ctl || {};
    var d = L.d, out = [], pl = printPlan(L, d.dpi), total = Math.max(1, pl.pages.length * pl.g.W * pl.g.H), done = 0, docs = [], i;
    out.notes = [];
    await Draw.fontsReady(d.script, practiceFontText(L), d.font, true);
    async function tick(px) {
      done += px;
      if (ctl.progress) ctl.progress(Math.min(1, done / total));
      await I.yieldUi();
    }
    for (i = 0; i < pl.pages.length; i++) {
      var r = await encodeSheet(null, L, pl, pl.pages[i], ctl, tick);
      docs.push({ w: pl.g.W, h: pl.g.H, pw: pl.g.pw, ph: pl.g.ph, color: r.color, z: r.z });
    }
    var name = practiceName(L), blob = MX.Pdf.build(docs, { title: name.replace(/\.pdf$/, '') });
    var f = { name: name, blob: blob, mime: 'application/pdf', w: pl.g.W, h: pl.g.H, pages: docs.length, size: blob.size, dpi: d.dpi, sheets: docs.map(function (x) { return x.color ? 'rgb' : 'gray'; }) };
    if (ctl.sink) { f.status = await ctl.sink(f); f.blob = null; }
    out.push(f);
    return out;
  }
  E.practice = {
    compose: composePractice, opts: practiceOpts, build: async function (view, cfg, o, ctl) { return buildPractice(composePractice(view, cfg, o), ctl); },
    buildL: buildPractice, name: practiceName, fontText: practiceFontText, MODES: MODES, GRID_KINDS: GRID_KINDS, paint: paintPractice
  };

  // ------------------------------------------------------------------ the 練習紙 screen
  // E.openPractice(textId, sectionId, cfg): cfg = the copy choices to start from (the setup screen's current ones; else the text's remembered ones)
  E.openPractice = async function (textId, sectionId, cfg) {
    var st = MX.Model.settings, sid = sectionId || 'main', view = await MX.Library.getView(textId, sid);
    cfg = Object.assign({}, MX.Model.textCfg(textId), cfg || {});
    var ui = { o: {}, page: 0, seq: 0, L: null };
    var KEEP = ['cellMm', 'tone', 'tplStyle', 'gridColor', 'header', 'ref', 'paperSize', 'margin', 'dpi'], saved = st.prac || {};
    KEEP.forEach(function (k) { if (saved[k] !== undefined) ui.o[k] = saved[k]; });
    var root = h('div', { class: 'exp', 'data-screen': 'practice-sheet', 'data-text-id': textId, 'data-section': sid });
    var api = MX.overlay(root);
    var status = h('div', { class: 'note', 'data-role': 'exp-status' }), infoBox = h('div', { class: 'note expinfo', 'data-role': 'exp-info' });
    var box = h('div', { class: 'prevbox', 'data-role': 'exp-box' }), nav = h('div', { class: 'prevnav' }), ctrl = h('div', { 'data-role': 'exp-opts' }), panel = h('div', { class: 'savepanel', 'data-role': 'save-panel' });
    var native = !!(window.MoBridge && typeof window.MoBridge.saveFile === 'function');
    var btnSave = h('button', { class: 'on big', 'data-act': 'save', text: native ? '儲存' : '產生檔案', onclick: save });
    root.appendChild(h('div', { class: 'topbar' }, [h('h1', { class: 'grow', text: '列印練習紙' }), btnSave, h('button', { class: 'big', 'data-act': 'back', text: '返回', onclick: function () { api.close(); } })]));
    [status, infoBox, panel, box, nav, ctrl].forEach(function (n) { root.appendChild(n); });
    var pan = I.makePanel(panel, status);

    function persist() {
      var o = {};
      KEEP.forEach(function (k) { if (ui.o[k] !== undefined) o[k] = ui.o[k]; });
      st.prac = o; MX.Model.saveSettings();
    }
    function set(k, v) {
      ui.o[k] = v;
      if (KEEP.indexOf(k) >= 0) persist();
      if (k === 'mode' || k === 'dir' || k === 'cellMm' || k === 'paperSize' || k === 'orient' || k === 'margin') ui.page = 0;
      drawControls(); refresh();
    }
    function drawControls() {
      var d = practiceOpts(cfg, ui.o), rows = [], onoff = [[true, '有'], [false, '無']];
      function row(k, label, opts, val) { rows.push(MX.Form.row(label, MX.Form.seg(opts, val, function (v) { set(k, v); }), k)); }
      row('mode', '模式', MODES, d.mode);
      row('script', '字體', [['trad', '繁體'], ['simp', '简体']], d.script);
      row('dir', '方向', [['v', '直書'], ['h', '橫書']], d.dir);
      row('cellMm', '格子大小', CELLS_MM.map(function (n) { return [n, n + ' mm']; }), d.cellMm);
      row('gridKind', '格線', GRID_KINDS, d.gridKind);
      row('gridColor', '格線顏色', [['gray', '灰色'], ['red', '朱紅']], d.gridColor);
      if (d.mode === 'trace') {
        row('tplStyle', '範本字', [['fill', '灰字'], ['outline', '空心']], d.tplStyle);
        row('tone', '深淺', TONES, d.tone);
      }
      row('title', '題目', onoff, d.title);
      row('sign', '落款', onoff, d.sign);
      if (d.mode === 'recall') row('ref', '參考字', onoff, d.ref);
      row('header', '頁首', onoff, d.header);
      row('paperSize', '紙張', [['A4', 'A4'], ['A3', 'A3'], ['Letter', 'Letter']], d.paperSize);
      row('orient', '紙張方向', [['p', '直向'], ['l', '橫向']], d.orient);
      row('margin', '邊界', [[8, '窄 8 mm'], [12, '標準 12 mm'], [20, '寬 20 mm']], d.margin);
      row('dpi', '解析度', [[150, '150 dpi 草稿'], [300, '300 dpi 列印'], [600, '600 dpi 精細']], d.dpi);
      rows.push(h('div', { class: 'note', 'data-role': 'print-note', text: '描：範本字是真正的灰色，可以直接用筆描；臨：每個字旁邊有一格空白；默：只有格子，另有小字參考。列印時請選「實際大小」。' + (d.name ? '' : '尚未設定姓名：落款不會印出。') }));
      ctrl.innerHTML = '';
      rows.forEach(function (r) { ctrl.appendChild(r); });
    }
    async function refresh() {
      pan.clear();
      var seq = ++ui.seq;
      status.textContent = '處理中…';
      var L;
      try { L = composePractice(view, cfg, ui.o); await Draw.fontsReady(L.d.script, practiceFontText(L), L.d.font, true); } catch (e) { MX.err(e); status.textContent = '預覽失敗'; return; }
      if (seq !== ui.seq) return;
      ui.L = L;
      var d = L.d, pl = printPlan(L, d.dpi), full = pl.g, n = L.pages.length, prevDpi = Math.max(20, Math.min(d.dpi, 1100 / (Math.max(full.wmm, full.hmm) / 25.4))), pp = printPlan(L, prevDpi);
      ui.page = MX.clamp(ui.page, 0, n - 1);
      var cv = document.createElement('canvas');
      cv.width = pp.g.W; cv.height = pp.g.H;
      paintPaperTile(cv.getContext('2d'), null, L, pp, pp.pages[ui.page], 0, 0, pp.g.W, pp.g.H);
      cv.setAttribute('data-role', 'exp-preview'); cv.setAttribute('data-pages', String(n)); cv.setAttribute('data-page', String(ui.page)); cv.setAttribute('data-print', d.paperSize + d.orient);
      box.innerHTML = ''; box.appendChild(cv);
      // a blank sheet (A4, 300 dpi, measured): 描 about 435 KB, 臨 about 270 KB, 默 about 255 KB per page (the dashed guide lines and the glyph edges are what costs); 朱紅 is RGB, about twice
      var bytes = n * full.W * full.H * { trace: 0.050, copy: 0.031, recall: 0.029 }[d.mode] * Math.pow(dpi300(d.dpi), 1.3) * (d.gridColor === 'red' ? 2 : 1);
      infoBox.innerHTML = '';
      infoBox.appendChild(h('div', { 'data-role': 'exp-size', text: 'PDF 1 個，' + n + ' 頁，預估約 ' + I.kb(bytes) }));
      infoBox.appendChild(h('div', { 'data-role': 'exp-warn', text: d.paperSize + (d.orient === 'l' ? ' 橫向 ' : ' 直向 ') + '每頁 ' + L.cols + ' 欄 × ' + L.rows + ' 列，格子 ' + L.cellMm + ' mm，共 ' + L.cells.length + ' 字。' }));
      status.textContent = '共 ' + n + ' 頁 · ' + d.paperSize + (d.orient === 'l' ? ' 橫向' : ' 直向') + ' · 輸出 ' + full.W + '×' + full.H + ' px（' + d.dpi + ' dpi）· ' + MODE_NAME[d.mode];
      nav.innerHTML = '';
      if (n > 1) {
        nav.appendChild(h('button', { 'data-act': 'pprev', text: '上一頁', disabled: ui.page <= 0 ? true : null, onclick: function () { ui.page--; refresh(); } }));
        nav.appendChild(h('div', { 'data-role': 'exp-ctr', text: (ui.page + 1) + ' / ' + n }));
        nav.appendChild(h('button', { 'data-act': 'pnext', text: '下一頁', disabled: ui.page >= n - 1 ? true : null, onclick: function () { ui.page++; refresh(); } }));
      }
    }
    function progress(f) { status.textContent = '正在產生… ' + Math.round(f * 100) + '%'; }
    async function save() {
      btnSave.disabled = true;
      status.textContent = '處理中…';
      var seq0 = ui.seq;
      try {
        var L = composePractice(view, cfg, ui.o);
        if (!native) {
          var files = await buildPractice(L, { progress: progress });
          if (seq0 === ui.seq) { pan.show(files); status.textContent = '檔案已備妥，請按「儲存」'; try { panel.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
        } else {
          var stt = '', fl = await buildPractice(L, { progress: progress, sink: async function (f) { stt = await MX.saveFile(f.name, f.blob, f.mime); return stt; } });
          MX.toast(stt);
          status.textContent = '已儲存：' + fl[0].name + '（用手機的 PDF 檢視器就能列印）';
        }
      } catch (e) { MX.err(e); MX.toast('匯出失敗'); status.textContent = '匯出失敗'; }
      btnSave.disabled = false;
    }
    drawControls();
    refresh();
    return { close: api.close, ui: ui };
  };
})();
