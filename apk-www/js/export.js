(function () {
  'use strict';
  var MX = window.MX, h = MX.h, Layout = MX.Layout, Draw = MX.Draw, Closing = MX.Closing;

  // ---------------------------------------------------------------------------------------------------------------------------------
  // 作品 export (docs/EXPORT.md). The whole text is RE-FLOWED as one composition (never a stack of screen pages) and every cell's strokes are
  // re-rendered as vectors at high resolution. compose() is pure geometry (no canvas): all lengths are in CELL UNITS (1 = one cell), pages are
  // lists of items; renderPage() paints a page at u px per unit. The reading order comes from MX.Layout (flowGrid / slotToLinePos /
  // slotToColRow), the same mapping the practice view uses.
  // ---------------------------------------------------------------------------------------------------------------------------------
  var CELL_PX = 220, MAX_PX = 16000000, MAX_SIDE = 8192;
  // 解析度: pixels per character cell. The resolution is the user's choice and NEVER depends on the length of the text (docs/EXPORT.md "Resolution and big exports").
  var RES_PX = { screen: 100, print: 220, high: 300 };
  var RES_LIST = [['screen', '螢幕'], ['print', '列印'], ['high', '高清']];
  // limits: SAFE_* = one native canvas (toBlob); TILE_* / BAND_BUF = the tile canvas and the band buffer of the streaming encoder; FILE_* = the biggest single PNG file
  // (bigger images are saved as numbered strips of the same resolution); WARN_PX = from here on the screen says some galleries show the picture reduced.
  var LIM = { SAFE_PX: 16000000, SAFE_SIDE: 8192, TILE_PX: 4000000, TILE_SIDE: 4096, BAND_BUF: 24000000, FILE_SIDE: 30000, FILE_PX: 160000000, WARN_PX: 100000000, IMG_PX: 25000000 };
  var INK = '#151515', RED = '#c8473a', RULE_ZHU = '#e7b3ab', RULE_WU = '#8a8a8a', TPL_COL = '#d8d1c0';
  var PAPER = { xuan: '#f6f1e6', white: '#ffffff' };
  var K = {
    LG_V: 0.18, LG_H: 0.12,     // gap between lines (columns in 直書, rows in 橫書)
    CG: 0.04,                   // gap between characters of a line
    BG: 0.4,                    // extra gap between title | body | signature blocks
    M: 1.2, M_END: 2.5,         // paper margin (hand scroll: at both ends)
    BP: 0.35,                   // border padding around the text block
    INK: 0.92,                  // ink is drawn at 92% of its cell
    SIG: 0.6,                   // signature size relative to the body
    FOOT: 0.9,                  // extra bottom margin for the page number on 分頁
    MG: 0.8,                    // gutter between the sheets of 合併長圖 (cells)
    CH: 1.08, SP: 1.5, SEAL: 1.6, GAP: 0.4, STAG: 1.0    // signature (units of the signature size)
  };
  var RATIOS = { '3:4': 0.75, '4:3': 4 / 3, '1:1': 1, 'A4p': 210 / 297, 'A4l': 297 / 210 };
  var RATIO_LIST = [['3:4', '3:4'], ['4:3', '4:3'], ['1:1', '1:1'], ['A4p', 'A4 直'], ['A4l', 'A4 橫']];
  var FORMAT_NAME = { sheet: '單張', scroll: '手卷', pages: '分頁' };
  var DPI_LIST = [150, 300, 600];

  function num(v, a, b, d) { v = +v; return v >= a && v <= b ? v : d; }

  // ------------------------------------------------------------------ seal (印章): deterministic, seeded by the name
  function hashStr(s) {
    var x = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    return x >>> 0;
  }
  function rng(seed) {      // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // width of a seal as a fraction of its height: 2 or 3 characters stand in a narrow vertical seal
  function sealRatio(n) { return n === 2 || n === 3 ? 0.62 : 1; }
  // Seal shape in units of the seal height (height = 1, width = wr): jittered rounded-rectangle outline, wear specks, character boxes.
  // Pure function of the name (seeded PRNG, nothing random between exports): every export of the same name gives the same seal.
  function sealShape(name, style) {
    var chars = Array.from(String(name || '').replace(/\s+/g, '')).slice(0, 4), n = chars.length;
    if (!n) return null;
    var r = rng(hashStr(chars.join(''))), wr = sealRatio(n), rad = 0.08, pts = [], i, k;
    function edge(x0, y0, x1, y1, m) { for (k = 0; k < m; k++) pts.push([x0 + (x1 - x0) * k / m, y0 + (y1 - y0) * k / m]); }
    function arc(cx, cy, a0) { for (k = 0; k < 5; k++) { var a = (a0 + 18 * k) * Math.PI / 180; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); } }
    edge(rad, 0, wr - rad, 0, 9); arc(wr - rad, rad, -90);
    edge(wr, rad, wr, 1 - rad, 9); arc(wr - rad, 1 - rad, 0);
    edge(wr - rad, 1, rad, 1, 9); arc(rad, 1 - rad, 90);
    edge(0, 1 - rad, 0, rad, 9); arc(rad, rad, 180);
    var outline = pts.map(function (p) {
      var dx = p[0] - wr / 2, dy = p[1] - 0.5, l = Math.sqrt(dx * dx + dy * dy) || 1, j = (r() - 0.45) * 0.026;
      return [+(p[0] + dx / l * j).toFixed(4), +(p[1] + dy / l * j).toFixed(4)];
    });
    var specks = [];
    for (i = 0; i < 26; i++) specks.push([+(r() * wr).toFixed(4), +r().toFixed(4), +(0.006 + r() * 0.014).toFixed(4)]);
    var out = [], size, cx, cy;
    if (n === 1) { size = 0.7; out.push({ ch: chars[0], cx: wr / 2, cy: 0.5, size: size }); }
    else if (n < 4) {
      size = Math.min(wr * 0.74, 0.8 / n);
      for (i = 0; i < n; i++) out.push({ ch: chars[i], cx: wr / 2, cy: (i + 0.5) / n, size: size });
    } else {
      size = 0.4;      // 2 x 2 read like 直書: right column top->bottom, then the left column
      for (i = 0; i < 4; i++) { cx = i < 2 ? 0.73 : 0.27; cy = i % 2 ? 0.74 : 0.26; out.push({ ch: chars[i], cx: cx, cy: cy, size: size }); }
    }
    return { wr: wr, outline: outline, specks: specks, chars: out };
  }

  // ------------------------------------------------------------------ options
  // The date of a 作品 (落款 date and file name): the day the copy was FINISHED (completedAt); a copy not finished yet uses the day it was last written (updatedAt, which an
  // archived copy keeps: archiving does not touch it), else its start. Never the day of the export, so an archived copy always exports with its own dates.
  // (The practice view's 落款 cells show the START date: that text decides the cells the user writes by hand, which must not change while writing.)
  function copyDate(copy) { return copy.completedAt || copy.updatedAt || copy.createdAt || Date.now(); }
  function resolve(cp, o) {
    o = o || {};
    var cfg = cp.copy.cfg, st = MX.Model.settings, dir = cfg.dir === 'h' ? 'h' : 'v', script = cfg.script === 'simp' ? 'simp' : 'trad';
    var name = String(o.name !== undefined ? o.name : (st.name || '')).replace(/\s+/g, ''), bud = !!cp.text && cp.text.category === 'buddhist';
    function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
    var d = {
      dir: dir, script: script, name: name,
      format: o.format === 'scroll' && dir === 'v' ? 'scroll' : (o.format === 'pages' ? 'pages' : 'sheet'),
      paper: o.paper === 'white' ? 'white' : 'xuan',
      rules: ['zhu', 'wu', 'mi', 'none'].indexOf(o.rules) >= 0 ? o.rules : 'zhu',
      border: !!o.border, title: o.title !== false, sign: o.sign !== undefined ? !!o.sign : !!name, seal: o.seal !== undefined ? !!o.seal : !!name,
      hui: o.hui !== undefined ? !!o.hui : !!st.sigHui, dateStyle: pick(o.dateStyle !== undefined ? o.dateStyle : st.sigDate, ['gz', 'ce', 'none'], 'gz'),
      suffix: pick(o.suffix !== undefined ? o.suffix : st.sigWord, bud ? Closing.SUFFIX_KEYS : ['shu', 'lin'], bud ? 'jing' : 'shu'), buddhist: bud, dizi: st.sigDizi !== false,
      sealStyle: o.sealStyle === 'red' ? 'red' : 'white', punct: !!o.punct && cfg.punct === 'show', tpl: !!o.tpl, out: o.out === 'pdf' || o.out === 'print' ? o.out : 'png',
      date: +o.date || copyDate(cp.copy), font: o.font || st.tplFont, res: RES_PX[o.res] ? o.res : 'print'
    };
    // 列印用 PDF (app/js/print.js): paper size, orientation (default: 手卷 and a 直書 單張 landscape, otherwise portrait), print margin (mm), dpi
    d.paperSize = MX.Pdf.PAPER[o.paperSize] ? o.paperSize : 'A4';
    d.orient = o.orient === 'p' || o.orient === 'l' ? o.orient : (d.format === 'scroll' ? 'l' : (d.format === 'pages' ? 'p' : (dir === 'v' ? 'l' : 'p')));
    d.margin = num(o.margin, 4, 30, 12);
    d.dpi = DPI_LIST.indexOf(+o.dpi) >= 0 ? +o.dpi : 300;
    d.merge = o.merge === true && d.format === 'pages' && d.out === 'png';      // 合併長圖: all 分頁 sheets in ONE image (see mergePlan)
    d.ratio = RATIOS[o.ratio] ? o.ratio : (d.format === 'pages' ? 'A4p' : (dir === 'v' ? '4:3' : '3:4'));
    d.r = RATIOS[d.ratio];
    if (d.out === 'print') {       // the page is the printable area of the paper (paper minus margins): the composition fills it exactly
      var pm = MX.Pdf.PAPER[d.paperSize].mm, pl = d.orient === 'l', aw = (pl ? pm[1] : pm[0]) - 2 * d.margin, ah = (pl ? pm[0] : pm[1]) - 2 * d.margin;
      d.ratio = 'paper'; d.r = aw / ah;
    }
    d.perLine = Math.floor(num(o.perLine, 3, 60, 0));
    if (!d.name) d.seal = false;
    return d;
  }
  function defaultP(d) {
    var r = d.r;
    if (d.format === 'scroll') return 12;
    if (d.dir === 'v') return r < 0.9 ? 12 : (r <= 1.1 ? 10 : 8);
    return r < 0.9 ? 10 : (r <= 1.1 ? 12 : 16);
  }

  // ------------------------------------------------------------------ units: title / body / signature
  function hasInk(cp, list) { return list.some(function (i) { return (cp.copy.ink[cp.cells[i].key] || []).length > 0; }); }
  function chars(s) { return Array.from(s).map(function (c) { return { ch: c }; }); }
  function gather(cp, d) {
    var cells = cp.cells, T = [], B = [], G = [], i;
    for (i = 0; i < cells.length; i++) (cells[i].sec === 'title' ? T : (cells[i].sec === 'sign' ? G : B)).push(i);
    var U = { title: [], body: B.map(function (k) { return { i: k, punct: cells[k].punct }; }), sig: { hand: null, text: [] } };
    if (d.title) {
      if (T.length && hasInk(cp, T)) U.title = T.map(function (k) { return { i: k }; });
      else U.title = chars(cp.text.title[d.script] || cp.text.title.trad || '');
    }
    if (d.sign) {
      if (G.length && hasInk(cp, G)) U.sig.hand = G.map(function (k) { return { i: k }; });
      else {
        // the same lines the practice 落款 cells show (Closing.signLines); the closing verse of an old copy is already in its body
        Closing.signLines({ script: d.script, name: d.name, date: d.date, buddhist: d.buddhist, style: d.dateStyle, word: d.suffix, dizi: d.dizi, hui: d.hui && !cp.copy.cfg.closing })
          .forEach(function (ln) { U.sig.text.push(chars(ln)); });
      }
    }
    return U;
  }

  // Signature block plan. Local coordinates: s along the stacking axis (from the block start), c along the line (cross axis), cell units.
  // 直書: columns right->left, the name column staggered lower with the seal under it; 橫書: rows top->bottom, right-aligned, seal under the name.
  function sigPlan(U, d, C) {
    var v = d.dir === 'v', seal = d.seal && d.name, lines = U.sig.hand ? null : U.sig.text, n, ss;
    var sh = seal ? sealShape(d.name, d.sealStyle) : null;
    if (U.sig.hand) {
      var cap = Math.max(3, Math.floor(C / (K.SIG * K.CH)) - (sh ? 4 : 0)), hand = U.sig.hand;
      lines = [];
      for (var q = 0; q < hand.length; q += cap) lines.push(hand.slice(q, q + cap));
    }
    n = lines.length;
    if (!n && !sh) return null;
    var maxLen = 0, nameLen = n ? lines[n - 1].length : 0, sealW = sh ? sh.wr * K.SEAL : 0;
    lines.forEach(function (l) { if (l.length > maxLen) maxLen = l.length; });
    var needC, pad = 0, stackU;
    if (v) {
      needC = Math.max(maxLen * K.CH, (n ? K.STAG + nameLen * K.CH + (sh ? K.GAP : 0) : 0) + (sh ? K.SEAL : 0));
      pad = sh ? Math.max(0, (sealW - 1) / 2) : 0;
      stackU = n ? 2 * pad + (n - 1) * K.SP + 1 : sealW;
    } else {
      needC = maxLen * K.CH;
      stackU = n ? (n - 1) * K.SP + 1 + (sh ? K.GAP + K.SEAL : 0) : K.SEAL;
    }
    ss = needC > 0 ? Math.min(K.SIG, C / needC) : K.SIG;
    if (!n && sh) ss = Math.min(K.SIG, C / K.SEAL);
    var items = [], j, k, cj, s;
    for (j = 0; j < n; j++) {
      s = (v ? (pad + j * K.SP) : j * K.SP) * ss;
      cj = v ? (C - needC * ss) + (j === n - 1 ? K.STAG * ss : 0) : C - lines[j].length * K.CH * ss;
      for (k = 0; k < lines[j].length; k++) items.push({ u: lines[j][k], s: s, c: cj + k * K.CH * ss, se: ss, ce: ss });
      if (sh && j === n - 1) {
        if (v) items.push({ seal: true, s: s + ss / 2 - sealW * ss / 2, c: cj + nameLen * K.CH * ss + K.GAP * ss, se: sealW * ss, ce: K.SEAL * ss });
        else items.push({ seal: true, s: s + ss + K.GAP * ss, c: C - sealW * ss, se: K.SEAL * ss, ce: sealW * ss });
      }
    }
    if (!n && sh) items.push({ seal: true, s: 0, c: v ? C - K.SEAL * ss : C - sealW * ss, se: v ? sealW * ss : K.SEAL * ss, ce: v ? K.SEAL * ss : sealW * ss });
    var stack = !n && sh ? (v ? sealW : K.SEAL) * ss : stackU * ss;
    return { items: items, stack: stack, ss: ss, lines: n, shape: sh };
  }

  // ------------------------------------------------------------------ composition
  function geoOf(d) {
    var v = d.dir === 'v', LG = v ? K.LG_V : K.LG_H;
    return { v: v, LG: LG, lp: 1 + LG, cpc: 1 + K.CG };
  }
  // text block plan for one sheet/page. body = {units, P}; title = {units, P}|null; sig plan|null; S = length along the stacking axis.
  function blockPlan(U, d, geo, P, S, bodyUnits, withTitle, withSig, sigPl) {
    var C = P * geo.cpc - K.CG, t = null, tl = 0;
    if (withTitle && U.title.length) {
      var tp = Math.min(P, U.title.length);
      t = { units: U.title, P: tp, lines: Math.ceil(U.title.length / tp) };
      t.stack = t.lines * geo.lp - geo.LG; tl = t.stack + K.BG;
    }
    var lines = bodyUnits.length ? Math.ceil(bodyUnits.length / P) : 0;
    return {
      C: C, P: P, t: t, body: { units: bodyUnits, P: P, s: tl, lines: lines, stack: lines * geo.lp - geo.LG },
      sig: withSig ? sigPl : null, S: S
    };
  }
  // measured length of a plan when nothing forces a fixed S (sheet / scroll)
  function naturalS(pl, geo) {
    return (pl.t ? pl.t.stack + K.BG : 0) + Math.max(0, pl.body.stack) + (pl.sig ? K.BG + pl.sig.stack : 0);
  }

  // Place the blocks of one plan on a page whose text block starts at (X0, Y0); returns nothing, pushes items.
  function emit(pg, pl, d, geo, X0, Y0, cp, extra) {
    var v = geo.v, S = pl.S, C = pl.C, items = pg.items, lp = geo.lp, cpc = geo.cpc;
    function rect(s, c, se, ce) {
      return v ? { x: X0 + S - s - se, y: Y0 + c, w: se, h: ce } : { x: X0 + c, y: Y0 + s, w: ce, h: se };
    }
    function put(u, role, s, c, size, extraProps) {
      var r = rect(s, c, size, size), it = u.i !== undefined ? { t: 'cell', i: u.i } : { t: 'glyph', ch: u.ch };
      it.role = role; it.x = r.x; it.y = r.y; it.s = size;
      if (extraProps) Object.keys(extraProps).forEach(function (k) { it[k] = extraProps[k]; });
      items.push(it);
      return r;
    }
    var b = pl.body, bg = Layout.flowGrid(d.dir, b.units.length, b.P), k, lpz, it2;
    // rules (欄線) around the body lines of this page
    if (d.rules === 'zhu' || d.rules === 'wu') {
      var col = d.rules === 'zhu' ? RULE_ZHU : RULE_WU, lw = d.rules === 'zhu' ? 0.016 : 0.01;
      for (k = 0; b.lines > 0 && k <= b.lines; k++) {
        var sb = b.s + k * lp - geo.LG / 2;
        if (v) items.push({ t: 'line', role: 'rule', x1: X0 + S - sb, y1: Y0 - 0.15, x2: X0 + S - sb, y2: Y0 + C + 0.15, lw: lw, col: col });
        else items.push({ t: 'line', role: 'rule', x1: X0 - 0.15, y1: Y0 + sb, x2: X0 + C + 0.15, y2: Y0 + sb, lw: lw, col: col });
      }
    }
    if (d.border) {
      var bw = v ? S : C, bh = v ? C : S;
      items.push({ t: 'rect', role: 'border', x: X0 - K.BP, y: Y0 - K.BP, w: bw + 2 * K.BP, h: bh + 2 * K.BP, lw: 0.05, col: INK });
      items.push({ t: 'rect', role: 'border', x: X0 - K.BP + 0.1, y: Y0 - K.BP + 0.1, w: bw + 2 * K.BP - 0.2, h: bh + 2 * K.BP - 0.2, lw: 0.016, col: INK });
    }
    // title block (far right in 直書, top and centred in 橫書)
    if (pl.t) {
      var tg = Layout.flowGrid(d.dir, pl.t.units.length, pl.t.P);
      for (k = 0; k < pl.t.units.length; k++) {
        lpz = Layout.slotToLinePos(tg, k);
        var nl = Math.min(pl.t.P, pl.t.units.length - lpz.line * pl.t.P), cc = v ? lpz.pos * cpc : (C - (nl * cpc - K.CG)) / 2 + lpz.pos * cpc;
        put(pl.t.units[k], 'title', lpz.line * lp, cc, 1, { k: k });
      }
    }
    // body
    for (k = 0; k < b.units.length; k++) {
      lpz = Layout.slotToLinePos(bg, k);
      var s0 = b.s + lpz.line * lp, c0 = lpz.pos * cpc, r0 = rect(s0, c0, 1, 1);
      if (d.rules === 'mi') items.push({ t: 'mi', role: 'rule', x: r0.x, y: r0.y, s: 1, col: RULE_ZHU, lw: 0.012 });
      if (d.tpl) items.push({ t: 'glyph', role: 'tpl', ch: cp.cells[b.units[k].i].ch, x: r0.x, y: r0.y, s: 1, col: TPL_COL });
      it2 = { t: 'cell', role: 'body', i: b.units[k].i, k: b.first + k, line: lpz.line, pos: lpz.pos, x: r0.x, y: r0.y, s: 1 };
      items.push(it2);
      if (d.punct && b.units[k].punct) {
        Array.from(b.units[k].punct).forEach(function (pc, q) {
          items.push({ t: 'punct', role: 'punct', ch: pc, s: 0.26, x: v ? r0.x + 0.7 : r0.x + 0.72 - q * 0.2, y: v ? r0.y + 0.02 + q * 0.2 : r0.y + 0.72 });
        });
      }
    }
    // signature (far left in 直書, bottom-right in 橫書)
    if (pl.sig) {
      var s1 = S - pl.sig.stack;
      pl.sig.items.forEach(function (q) {
        if (q.seal) {
          var rr = rect(s1 + q.s, q.c, q.se, q.ce);
          items.push({ t: 'seal', role: 'seal', x: rr.x, y: rr.y, w: rr.w, h: rr.h, style: d.sealStyle, shape: pl.sig.shape });
        } else put(q.u, 'sig', s1 + q.s, q.c, q.se);
      });
    }
    if (extra) extra(pg, rect);
  }

  function cnPage(n) { return Closing.cnNum(n); }

  // 合併長圖: the sheets of a 分頁 export in ONE image, in reading order. 直書: side by side, sheet 1 RIGHTMOST, then to the left (columns read
  // right -> left, so the sheets do too); never stacked top-to-bottom. 橫書: top to bottom, sheet 1 on top. K.MG of paper between sheets.
  // Returns {dir, w, h, gutter, at: [{i, x, y}]} in cell units (x, y = top-left of sheet i).
  function mergePlan(pages, dir) {
    var G = K.MG, n = pages.length, at = [], W = 0, H = 0, i, pos;
    pages.forEach(function (pg) {
      if (dir === 'v') { W += pg.w; H = Math.max(H, pg.h); } else { H += pg.h; W = Math.max(W, pg.w); }
    });
    if (dir === 'v') W += G * (n - 1); else H += G * (n - 1);
    if (dir === 'v') {
      pos = W;
      for (i = 0; i < n; i++) { pos -= pages[i].w; at.push({ i: i, x: pos, y: (H - pages[i].h) / 2 }); pos -= G; }
    } else {
      pos = 0;
      for (i = 0; i < n; i++) { at.push({ i: i, x: (W - pages[i].w) / 2, y: pos }); pos += pages[i].h + G; }
    }
    return { dir: dir, w: W, h: H, gutter: G, at: at };
  }

  // compose(cp, opts) -> {d, geo, P, pages: [{w, h, items, ...}], unit scale info}
  function compose(cp, o) {
    MX.Model.loadInk(cp.copy);
    var d = resolve(cp, o), U = gather(cp, d), geo = geoOf(d), v = geo.v, lp = geo.lp, cpc = geo.cpc;
    var nB = U.body.length, pages = [], P, pl, M, Wc, Hc, W, H, X0, Y0, i;
    var bd = d.border ? K.BP : 0;
    function sigFor(Pn) { return d.sign || (d.seal && d.name) ? sigPlan(U, d, Pn * cpc - K.CG) : null; }
    function sheetOf(Pn, withRatio) {
      var pl2 = blockPlan(U, d, geo, Pn, 0, U.body, true, true, sigFor(Pn));
      pl2.body.first = 0;
      pl2.S = naturalS(pl2, geo);
      var Mx = (d.format === 'scroll' ? K.M_END : K.M) + bd, My = K.M + bd;
      var bw = v ? pl2.S : pl2.C, bh = v ? pl2.C : pl2.S;
      return { pl: pl2, Wc: bw + 2 * Mx, Hc: bh + 2 * My, Mx: Mx, My: My, bw: bw, bh: bh };
    }
    if (d.format === 'pages') {
      P = d.perLine || defaultP(d);
      M = K.M + bd;
      var C = P * cpc - K.CG, foot = K.FOOT;
      var Wp, Hp, Sfull;
      if (v) { Hp = 2 * M + C + foot; Wp = Hp * d.r; Sfull = Wp - 2 * M; } else { Wp = 2 * M + C; Hp = Wp / d.r; Sfull = Hp - 2 * M - foot; }
      var Lcap = Math.max(3, Math.floor((Sfull + geo.LG) / lp));
      Sfull = Lcap * lp - geo.LG;
      if (v) Wp = Math.max(Wp, Sfull + 2 * M); else Hp = Math.max(Hp, Sfull + 2 * M + foot);
      var sigPl = sigFor(P), t = null;
      var titleStack = 0;
      if (U.title.length) { var tp = Math.min(P, U.title.length); titleStack = Math.ceil(U.title.length / tp) * lp - geo.LG + K.BG; }
      var budget1 = Math.max(1, Math.floor((Sfull - titleStack + geo.LG) / lp));
      var totalLines = nB ? Math.ceil(nB / P) : 0, from = 0, groups = [];
      var take = Math.min(totalLines, budget1);
      groups.push({ from: 0, lines: take, first: true });
      from = take;
      while (from < totalLines) { take = Math.min(Lcap, totalLines - from); groups.push({ from: from, lines: take, first: false }); from += take; }
      var last = groups[groups.length - 1];
      var used = last.lines * lp - geo.LG + (last.first ? titleStack : 0);
      var sigOwn = false;
      if (sigPl) {
        if (last.lines === 0 || used + K.BG + sigPl.stack <= Sfull + 1e-9) last.sig = true;
        else { groups.push({ from: totalLines, lines: 0, first: false, sig: true }); sigOwn = true; }
      }
      var X0p = v ? (Wp - Sfull) / 2 : (Wp - C) / 2, Y0p = v ? M : M;
      groups.forEach(function (g, gi) {
        var units = U.body.slice(g.from * P, Math.min(nB, (g.from + g.lines) * P));
        var plp = blockPlan(U, d, geo, P, Sfull, units, g.first, !!g.sig, sigPl);
        plp.body.first = g.from * P;
        plp.body.s = g.first && plp.t ? plp.t.stack + K.BG : 0;
        var pg = { w: Wp, h: Hp, items: [], index: gi, lines: g.lines, cells: units.length, hasTitle: !!plp.t, hasSig: !!g.sig, sigOnly: g.lines === 0 && !!g.sig };
        emit(pg, plp, d, geo, X0p, Y0p, cp);
        pages.push(pg);
      });
      if (pages.length > 1) {
        pages.forEach(function (pg, gi) {
          var label = v ? cnPage(gi + 1) : String(gi + 1), sz = 0.45;
          if (v) {
            Array.from(label).forEach(function (c, q) { pg.items.push({ t: 'glyph', role: 'pageno', ch: c, x: M, y: Hp - M * 0.9 + q * sz * 1.05 - (label.length - 1) * sz * 1.05, s: sz }); });
          } else pg.items.push({ t: 'text', role: 'pageno', str: label, x: Wp / 2, y: Hp - M * 0.8, s: sz });
        });
      }
      return { d: d, geo: geo, P: P, Lcap: Lcap, sigOwnPage: sigOwn, pages: pages, bodyLines: totalLines, titleStack: titleStack, sigStack: sigPl ? sigPl.stack : 0, Sfull: Sfull,
        merge: d.merge && pages.length > 1 ? mergePlan(pages, d.dir) : null };
    }
    // sheet / scroll: one page
    var best;
    if (d.format === 'scroll') { P = d.perLine || 12; best = sheetOf(P); }
    else if (d.perLine) { P = d.perLine; best = sheetOf(P); }
    else {
      var bestDist = Infinity, cand;
      for (P = 3; P <= Math.max(3, Math.min(60, nB || 3)); P++) {
        cand = sheetOf(P);
        var dist = Math.abs(Math.log(cand.Wc / cand.Hc / d.r));
        if (dist < bestDist - 1e-9) { bestDist = dist; best = cand; best.P = P; }
      }
      P = best.P;
    }
    pl = best.pl;
    W = best.Wc; H = best.Hc;
    if (d.format === 'sheet') { var W2 = Math.max(W, H * d.r); H = W2 / d.r; W = W2; }
    X0 = (W - best.bw) / 2; Y0 = (H - best.bh) / 2;
    var pg1 = { w: W, h: H, items: [], index: 0, lines: pl.body.lines, cells: nB, hasTitle: !!pl.t, hasSig: !!pl.sig };
    emit(pg1, pl, d, geo, X0, Y0, cp);
    pages.push(pg1);
    return { d: d, geo: geo, P: P, pages: pages, bodyLines: pl.body.lines, S: pl.S, C: pl.C, titleStack: pl.t ? pl.t.stack : 0, sigStack: pl.sig ? pl.sig.stack : 0 };
  }

  // ------------------------------------------------------------------ resolution limits
  // scaleFor(L, cell): the biggest scale at which EVERY page fits ONE canvas (<= 16 MP, <= 8192 px per side); cell = wanted px per cell (default 220).
  // It is what the on-screen preview, the PDF pages (JPEG needs a canvas) and the last-resort fallback use. PNG files do NOT use it: they keep the chosen
  // resolution whatever the size (tiles + streaming encoder, numbered strips beyond FILE_SIDE / FILE_PX), see makeImage().
  function scaleFor(L, cell) {
    var u = cell || CELL_PX;
    (L.merge ? [L.merge] : L.pages).forEach(function (pg) {
      u = Math.min(u, Math.sqrt(MAX_PX / (pg.w * pg.h)), MAX_SIDE / Math.max(pg.w, pg.h));
    });
    return Math.floor(u * 1000) / 1000;
  }
  function pxSize(pg, u) { return { w: Math.max(1, Math.floor(pg.w * u)), h: Math.max(1, Math.floor(pg.h * u)) }; }
  // an image to export: {merge: true} (the 合併長圖) or {page: i}
  function specBox(L, spec) { return spec.merge ? L.merge : L.pages[spec.page]; }

  // ------------------------------------------------------------------ rendering
  function fontText(cp, L) {
    var s = '';
    L.pages.forEach(function (pg) {
      pg.items.forEach(function (it) { if (it.ch) s += it.ch; if (it.t === 'seal') it.shape.chars.forEach(function (c) { s += c.ch; }); });
    });
    return s + '〇一二三四五六七八九十年月日公元敬書恭錄沐手' + (L.d.dir === 'h' ? '0123456789' : '');
  }
  function prepare(cp, L) {
    return Draw.fontsReady(L.d.script, fontText(cp, L), L.d.font);
  }
  function drawSeal(ctx, it, u, paper, d) {
    var sh = it.shape, hh = it.h * u, x0 = it.x * u, y0 = it.y * u, i, p;
    ctx.save();
    ctx.beginPath();
    for (i = 0; i < sh.outline.length; i++) {
      p = sh.outline[i];
      if (i) ctx.lineTo(x0 + p[0] * hh, y0 + p[1] * hh); else ctx.moveTo(x0 + p[0] * hh, y0 + p[1] * hh);
    }
    ctx.closePath();
    var white = it.style !== 'red';
    if (white) { ctx.fillStyle = RED; ctx.fill(); }
    else { ctx.strokeStyle = RED; ctx.lineWidth = Math.max(1, hh * 0.05); ctx.lineJoin = 'round'; ctx.stroke(); }
    if (white) {
      ctx.fillStyle = paper;
      sh.specks.forEach(function (q) { ctx.beginPath(); ctx.arc(x0 + q[0] * hh, y0 + q[1] * hh, q[2] * hh, 0, 6.2832); ctx.fill(); });
    }
    sh.chars.forEach(function (c) {
      Draw.glyph(ctx, c.ch, x0 + c.cx * hh, y0 + c.cy * hh, c.size * hh, { script: d.script, font: d.font, style: 'fill', color: white ? paper : RED });
    });
    ctx.restore();
  }
  var ROLES = ['rule', 'border', 'tpl', 'body', 'title', 'sig', 'punct', 'seal', 'pageno'];
  function byRole(pg) {
    if (pg.roles) return pg.roles;
    var m = {};
    ROLES.forEach(function (r) { m[r] = []; });
    pg.items.forEach(function (it) { if (m[it.role]) m[it.role].push(it); });
    Object.defineProperty(pg, 'roles', { value: m, enumerable: false });
    return m;
  }
  // [x0, y0, x1, y1] (px) of everything an item can paint, with a margin: used to skip the items outside a tile
  function itemBox(it, u) {
    var x = it.x * u, y = it.y * u, s = (it.s || 0) * u, lw, m;
    switch (it.t) {
      case 'line':
        lw = Math.max(1, it.lw * u) + 2;
        return [Math.min(it.x1, it.x2) * u - lw, Math.min(it.y1, it.y2) * u - lw, Math.max(it.x1, it.x2) * u + lw, Math.max(it.y1, it.y2) * u + lw];
      case 'rect':
        lw = Math.max(1, it.lw * u) + 2;
        return [x - lw, y - lw, x + it.w * u + lw, y + it.h * u + lw];
      case 'seal':
        return [x - 6, y - 6, x + Math.max(it.w, it.h) * u + 6, y + it.h * u + 6];
      case 'text':
        return [x - s * 4, y - s * 2, x + s * 4, y + s * 2];
      case 'cell':
        m = s * 0.5 + 4;
        return [x - m, y - m, x + s + m, y + s + m];
      default:
        return [x - 4, y - 4, x + s + 4, y + s + 4];
    }
  }
  // Paint the items of page `pg` at u px per cell on ctx, whose origin is the page's top-left. cull = {x0, y0, x1, y1} (page px) skips everything that cannot touch
  // that rectangle (the tiled export draws the SAME full-scale picture through a translated context, one tile at a time); null = paint everything.
  function paintItems(ctx, cp, L, pg, u, cull) {
    var d = L.d, paper = PAPER[d.paper], inkStyle = MX.Ink.style(MX.Model.settings), ink = cp.copy.ink, roles = byRole(pg);
    ctx.lineCap = 'butt';
    ROLES.forEach(function (role) {
      roles[role].forEach(function (it) {
        if (cull) {
          var b = itemBox(it, u);
          if (b[0] >= cull.x1 || b[2] <= cull.x0 || b[1] >= cull.y1 || b[3] <= cull.y0) return;
        }
        var x = it.x * u, y = it.y * u, s = (it.s || 0) * u, j;
        switch (it.t) {
          case 'line':
            ctx.strokeStyle = it.col; ctx.lineWidth = Math.max(1, it.lw * u);
            ctx.beginPath(); ctx.moveTo(it.x1 * u, it.y1 * u); ctx.lineTo(it.x2 * u, it.y2 * u); ctx.stroke();
            break;
          case 'rect':
            ctx.strokeStyle = it.col; ctx.lineWidth = Math.max(1, it.lw * u); ctx.strokeRect(x, y, it.w * u, it.h * u);
            break;
          case 'mi':
            ctx.strokeStyle = it.col; ctx.lineWidth = Math.max(1, it.lw * u);
            ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
            ctx.beginPath();
            ctx.moveTo(x + s / 2, y); ctx.lineTo(x + s / 2, y + s); ctx.moveTo(x, y + s / 2); ctx.lineTo(x + s, y + s / 2);
            ctx.moveTo(x, y); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y); ctx.lineTo(x, y + s);
            ctx.stroke();
            break;
          case 'cell':
            var strokes = ink[cp.cells[it.i].key] || [], ox = x + s * (1 - K.INK) / 2, oy = y + s * (1 - K.INK) / 2, sc = s * K.INK / 1000;
            for (j = 0; j < strokes.length; j++) {
              if (cull) {
                var sb = MX.Ink.bounds(strokes[j], ox, oy, sc, inkStyle, 1);
                if (sb.x0 >= cull.x1 || sb.x1 <= cull.x0 || sb.y0 >= cull.y1 || sb.y1 <= cull.y0) continue;
              }
              MX.Ink.paintStroke(ctx, strokes[j], ox, oy, sc, inkStyle, INK, { px: 1 });   // the same brush model as on screen
            }
            break;
          case 'glyph':
            Draw.glyph(ctx, it.ch, x + s / 2, y + s / 2, s * 0.9, { script: d.script, font: d.font, style: 'fill', color: it.col || INK });
            break;
          case 'punct':
            Draw.glyph(ctx, it.ch, x + s / 2, y + s / 2, s, { script: d.script, font: d.font, style: 'fill', color: INK });
            break;
          case 'text':
            ctx.fillStyle = '#555'; ctx.font = Math.round(s) + 'px ' + Draw.fam(d.script, d.font); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(it.str, x, y);
            break;
          case 'seal':
            drawSeal(ctx, it, u, paper, d);
            break;
        }
      });
    });
  }
  function renderPage(cp, L, idx, u) {
    var pg = L.pages[idx], sz = pxSize(pg, u), cv = document.createElement('canvas');
    cv.width = sz.w; cv.height = sz.h;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = PAPER[L.d.paper]; ctx.fillRect(0, 0, sz.w, sz.h);
    paintItems(ctx, cp, L, pg, u, null);
    return cv;
  }

  // The thin grey lines in the gutters of the 合併長圖: [{x, y, w, h}] in px of the merged image
  function gutterRects(L, u, w, hh) {
    var m = L.merge, out = [], lw = Math.max(1, Math.round(0.02 * u));
    m.at.forEach(function (p, k) {
      if (k >= m.at.length - 1) return;
      if (m.dir === 'v') out.push({ x: Math.round((p.x - m.gutter / 2) * u - lw / 2), y: 0, w: lw, h: hh });
      else out.push({ x: 0, y: Math.round((p.y + L.pages[p.i].h + m.gutter / 2) * u - lw / 2), w: w, h: lw });
    });
    return out;
  }
  // The 合併長圖 image: every sheet rendered at u px per cell and pasted at its place of mergePlan; a thin grey line marks each gutter.
  function renderMerged(cp, L, u) {
    var m = L.merge, d = L.d, w = Math.max(1, Math.floor(m.w * u)), hh = Math.max(1, Math.floor(m.h * u)), cv = document.createElement('canvas');
    cv.width = w; cv.height = hh;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = PAPER[d.paper]; ctx.fillRect(0, 0, w, hh);
    var gr = gutterRects(L, u, w, hh);
    m.at.forEach(function (p, k) {
      var pc = renderPage(cp, L, p.i, u);
      ctx.drawImage(pc, Math.round(p.x * u), Math.round(p.y * u));
      release(pc);
      if (k < gr.length) { ctx.fillStyle = RULE_WU; ctx.fillRect(gr[k].x, gr[k].y, gr[k].w, gr[k].h); }
    });
    return cv;
  }

  // ------------------------------------------------------------------ tiled rendering + streaming PNG
  // Paint the tile (tx, ty, tw x th px) of the full-scale image `spec` on ctx. The drawing is the one renderPage / renderMerged make, seen through a translated context.
  function paintTile(ctx, cp, L, spec, u, tx, ty, tw, th) {
    var paper = PAPER[L.d.paper];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = paper; ctx.fillRect(0, 0, tw, th);
    if (!spec.merge) {
      ctx.setTransform(1, 0, 0, 1, -tx, -ty);
      paintItems(ctx, cp, L, L.pages[spec.page], u, { x0: tx, y0: ty, x1: tx + tw, y1: ty + th });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    var m = L.merge, w = Math.max(1, Math.floor(m.w * u)), hh = Math.max(1, Math.floor(m.h * u));
    m.at.forEach(function (p) {
      var sz = pxSize(L.pages[p.i], u), sx = Math.round(p.x * u), sy = Math.round(p.y * u);
      if (sx >= tx + tw || sy >= ty + th || sx + sz.w <= tx || sy + sz.h <= ty) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, sx - tx, sy - ty);
      ctx.beginPath(); ctx.rect(0, 0, sz.w, sz.h); ctx.clip();
      ctx.fillStyle = paper; ctx.fillRect(0, 0, sz.w, sz.h);
      paintItems(ctx, cp, L, L.pages[p.i], u, { x0: tx - sx, y0: ty - sy, x1: tx + tw - sx, y1: ty + th - sy });
      ctx.restore();
    });
    ctx.setTransform(1, 0, 0, 1, -tx, -ty);
    ctx.fillStyle = RULE_WU;
    gutterRects(L, u, w, hh).forEach(function (g) { ctx.fillRect(g.x, g.y, g.w, g.h); });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  var TILE_PAD = 8;
  function yieldUi() { return new Promise(function (res) { setTimeout(res, 0); }); }
  function clampInt(v, a, b) { v = Math.floor(v); return v < a ? a : (v > b ? b : v); }
  // Render the region reg = {x0, y0, w, h} (px of the full-scale image `spec`) band by band and encode it as ONE PNG (streamed; see pngstream.js).
  // A band is `th` rows of the whole width, drawn tile by tile on ONE reused canvas (<= TILE_PX, <= TILE_SIDE per side); the band buffer is <= BAND_BUF bytes.
  // tick(pixelsDone) is awaited after every band (progress + a yield to the UI).
  // x (optional, the print PDF): {paint(ctx, tx, ty, tw, th): paints the tile of the image at (tx, ty) (replaces paintTile), channels: 1 (8-bit grey: the red channel is kept and
  // anything coloured throws) | 3, zlib: the result is the bare zlib stream (PdfStream) instead of a PNG}
  async function encodeRegion(cp, L, spec, u, reg, lim, ctl, tick, stage, x) {
    if (ctl.inject && ctl.inject.indexOf(stage) >= 0) throw new Error('injected failure: ' + stage);
    x = x || {};
    var ch = x.channels === 1 ? 1 : 3;
    // the tile canvas has TILE_PAD extra pixels on every side that are painted but not copied: the picture at a seam then comes out exactly as in one big canvas
    var P = TILE_PAD, th = clampInt(lim.BAND_BUF / (reg.w * ch), 8, Math.min(1024, lim.TILE_SIDE - 2 * P)), tw;
    th = Math.min(th, reg.h);
    tw = Math.min(reg.w, lim.TILE_SIDE - 2 * P, Math.max(8, Math.floor(lim.TILE_PX / (th + 2 * P)) - 2 * P));
    var cv = document.createElement('canvas');
    cv.width = tw + 2 * P; cv.height = th + 2 * P;
    var ctx = cv.getContext('2d', { willReadFrequently: true }), enc = MX.PngStream.encoder(reg.w, reg.h, { fallback: !!ctl.noNative, channels: ch, zlib: !!x.zlib }), band = new Uint8Array(reg.w * ch * th);
    E.last = { tileW: tw + 2 * P, tileH: th + 2 * P, tiles: 0, native: enc.native };
    try {
      for (var by = 0; by < reg.h; by += th) {
        var rows = Math.min(th, reg.h - by), bx, cols, id, d, r, c, si, di, rowAt;
        for (bx = 0; bx < reg.w; bx += tw) {
          cols = Math.min(tw, reg.w - bx);
          if (x.paint) x.paint(ctx, reg.x0 + bx - P, reg.y0 + by - P, tw + 2 * P, th + 2 * P);
          else paintTile(ctx, cp, L, spec, u, reg.x0 + bx - P, reg.y0 + by - P, tw + 2 * P, th + 2 * P);
          id = ctx.getImageData(P, P, cols, rows); d = id.data;
          if (ch === 1) {
            for (r = 0; r < rows; r++) {
              si = r * cols * 4; di = r * reg.w + bx;
              for (c = 0; c < cols; c++) {
                if (d[si] !== d[si + 1] || d[si] !== d[si + 2]) throw new Error('colour in a grey page');
                band[di++] = d[si]; si += 4;
              }
            }
          } else {
            for (r = 0; r < rows; r++) {
              si = r * cols * 4; di = (r * reg.w + bx) * 3;
              for (c = 0; c < cols; c++) { band[di] = d[si]; band[di + 1] = d[si + 1]; band[di + 2] = d[si + 2]; di += 3; si += 4; }
            }
          }
          E.last.tiles++;
        }
        await enc.rows(band, rows);
        await tick(reg.w * rows);
      }
      return await enc.finish();
    } finally { release(cv); }
  }

  // ------------------------------------------------------------------ plan: one file, or numbered strips
  function planFor(w, h, lim) {
    if (w * h <= lim.SAFE_PX && Math.max(w, h) <= lim.SAFE_SIDE) return 'native';
    if (w * h <= lim.FILE_PX && Math.max(w, h) <= lim.FILE_SIDE) return 'tiled';
    return 'strips';
  }
  function stripCount(w, h, lim) {
    return Math.max(1, Math.ceil(Math.max(w, h) / (0.85 * lim.FILE_SIDE)), Math.ceil(w * h / (0.85 * lim.FILE_PX)));
  }
  // the limits after a failure: smaller strips, smaller tiles
  function smallLim(lim) {
    return Object.assign({}, lim, { FILE_SIDE: Math.floor(lim.FILE_SIDE / 2), FILE_PX: Math.floor(lim.FILE_PX / 3), TILE_PX: Math.floor(lim.TILE_PX / 2), BAND_BUF: Math.floor(lim.BAND_BUF / 2) });
  }
  // px rectangles [x0, y0, x1, y1] of everything a cut must not go through (characters, seals), in the image's own pixels
  function solidRects(L, spec, u) {
    var out = [];
    function add(pg, ox, oy) {
      pg.items.forEach(function (it) {
        var w, hh;
        if (it.t === 'cell' || it.t === 'glyph' || it.t === 'punct') { w = hh = it.s; } else if (it.t === 'seal') { w = it.w; hh = it.h; } else return;
        out.push([ox + it.x * u, oy + it.y * u, ox + (it.x + w) * u, oy + (it.y + hh) * u]);
      });
    }
    if (spec.merge) L.merge.at.forEach(function (p) { add(L.pages[p.i], Math.round(p.x * u), Math.round(p.y * u)); });
    else add(L.pages[spec.page], 0, 0);
    return out;
  }
  // Cut positions (px along the long axis) for k strips: each cut goes to the middle of the free gap (between two columns / rows, or in a gutter) nearest to the even split.
  function cutPositions(L, spec, u, long, axis, k) {
    var cuts = [], iv = solidRects(L, spec, u).map(function (r) { return axis === 'x' ? [r[0], r[2]] : [r[1], r[3]]; }), gaps = [], i, end = -Infinity;
    iv.sort(function (a, b) { return a[0] - b[0]; });
    for (i = 0; i < iv.length; i++) {
      if (iv[i][0] - end >= 2 && end > -Infinity) gaps.push((end + iv[i][0]) / 2);
      if (iv[i][1] > end) end = iv[i][1];
    }
    var part = long / k, prev = 0, j, t, best, bd, g;
    for (j = 1; j < k; j++) {
      t = Math.round(part * j); best = t; bd = part * 0.15;
      for (g = 0; g < gaps.length; g++) if (Math.abs(gaps[g] - t) < bd && gaps[g] > prev + 8) { bd = Math.abs(gaps[g] - t); best = Math.round(gaps[g]); }
      cuts.push(best); prev = best;
    }
    return cuts;
  }
  // the regions of the k strips in reading order (直書 wide image: rightmost strip first), plus the axis
  function stripRegions(L, spec, u, w, h, k) {
    var axis = w >= h ? 'x' : 'y', long = axis === 'x' ? w : h, cuts = cutPositions(L, spec, u, long, axis, k), b = [0].concat(cuts, [long]), regs = [], i;
    for (i = 0; i + 1 < b.length; i++) regs.push(axis === 'x' ? { x0: b[i], y0: 0, w: b[i + 1] - b[i], h: h } : { x0: 0, y0: b[i], w: w, h: b[i + 1] - b[i] });
    if (axis === 'x' && L.d.dir === 'v') regs.reverse();
    return regs;
  }
  // what an export will produce (no rendering): [{w, h, mode, strips}] per image, for the screen's size line and the progress total
  function outline(L, u, lim) {
    lim = lim || LIM;
    var specs = L.merge ? [{ merge: true }] : L.pages.map(function (pg, i) { return { page: i }; });
    return specs.map(function (sp) {
      var sz = pxSize(specBox(L, sp), u), mode = planFor(sz.w, sz.h, lim);
      return { spec: sp, w: sz.w, h: sz.h, mode: mode, strips: mode === 'strips' ? stripCount(sz.w, sz.h, lim) : 1 };
    });
  }

  // ------------------------------------------------------------------ minimal multi-page PDF (JPEG pages, no library)
  function asciiBytes(s) {
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  }
  // pages: [{jpeg: Uint8Array, w, h (px), pw, ph (pt)}] -> Uint8Array
  function buildPdf(pages) {
    var parts = [], len = 0, offs = [];
    function add(x) { var b = typeof x === 'string' ? asciiBytes(x) : x; parts.push(b); len += b.length; }
    function obj(id, body) { offs[id] = len; add(id + ' 0 obj\n'); add(body); add('\nendobj\n'); }
    var n = pages.length, kids = [], i;
    add('%PDF-1.4\n%âãÏÓ\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    for (i = 0; i < n; i++) kids.push((3 + 3 * i) + ' 0 R');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [ ' + kids.join(' ') + ' ] >>');
    pages.forEach(function (pg, k) {
      var pid = 3 + 3 * k, cid = pid + 1, iid = pid + 2, pw = +pg.pw.toFixed(2), ph = +pg.ph.toFixed(2);
      obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
      var content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
      obj(cid, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      offs[iid] = len;
      add(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + pg.w + ' /Height ' + pg.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.jpeg.length + ' >>\nstream\n');
      add(pg.jpeg);
      add('\nendstream\nendobj\n');
    });
    var xref = len, total = 3 + 3 * n;
    add('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (i = 1; i < total; i++) add(('0000000000' + offs[i]).slice(-10) + ' 00000 n \n');
    add('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(len), at = 0;
    parts.forEach(function (b) { out.set(b, at); at += b.length; });
    return out;
  }
  function dataUrlBytes(u) {
    var raw = atob(u.slice(u.indexOf(',') + 1)), b = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i);
    return b;
  }
  function toBlob(cv, type, q) {
    return new Promise(function (res) {
      if (cv.toBlob) cv.toBlob(function (b) { res(b || MX.dataUrlToBlob(cv.toDataURL(type, q))); }, type, q);
      else res(MX.dataUrlToBlob(cv.toDataURL(type, q)));
    });
  }
  function release(cv) { cv.width = 0; cv.height = 0; }

  // ------------------------------------------------------------------ making the files
  // estimated PNG size in bytes (a rough guide for the screen): paper and rules compress to almost nothing, the ink costs ~3 bytes per stroke and pixel of cell size
  // (measured: strokes crossing a cell cost ~4, short real strokes ~2); a picture made by the browser's own encoder (native canvas) is about 1.5x bigger
  function estBytes(L, spec, w, h, u, cp, native) {
    var strokes = 0;
    (spec.merge ? L.pages : [L.pages[spec.page]]).forEach(function (pg) {
      pg.items.forEach(function (it) {
        if (it.t !== 'cell') return;
        strokes += cp ? ((cp.copy.ink[cp.cells[it.i].key] || []).length) : 1;
      });
    });
    return Math.round((w * h * 0.0006 + strokes * u * 3) * (native ? 1.5 : 1));
  }
  // a device that says it has <= 2 GB of RAM (navigator.deviceMemory) gets half-size tiles and bands
  var LOW = { TILE_PX: 2000000, BAND_BUF: 12000000 };
  function lowMem() { try { return !!navigator.deviceMemory && navigator.deviceMemory <= 2; } catch (e) { return false; } }
  function describe(L, ctl) {
    ctl = ctl || {};
    if (L.d.out === 'print' && E.printInfo) return E.printInfo(L, ctl);
    var d = L.d, cell = RES_PX[d.res], lim = Object.assign({}, LIM, lowMem() ? LOW : {}, ctl.lim || {}), r = { cell: cell, pdf: d.out === 'pdf' && d.format === 'pages', lim: lim, capped: false };
    if (r.pdf) {
      var u = scaleFor(L, cell);
      r.u = u; r.capped = u < cell - 0.5;
      r.images = L.pages.map(function (pg, i) { var sz = pxSize(pg, u); return { spec: { page: i }, w: sz.w, h: sz.h, mode: 'native', strips: 1 }; });
      r.files = 1; r.bytes = r.images.reduce(function (a, im) { return a + im.w * im.h * 0.06; }, 0);     // JPEG q 0.92
    } else {
      r.u = cell;
      r.images = outline(L, cell, lim);
      r.files = r.images.reduce(function (a, im) { return a + im.strips; }, 0);
      r.bytes = r.images.reduce(function (a, im) { return a + estBytes(L, im.spec, im.w, im.h, cell, ctl.cp, im.mode === 'native'); }, 0);
    }
    r.px = r.images.reduce(function (a, im) { return a + im.w * im.h; }, 0);
    r.maxPx = r.images.reduce(function (a, im) { return Math.max(a, im.w * im.h / im.strips); }, 0);
    r.big = r.maxPx > lim.WARN_PX;
    r.strips = r.images.some(function (im) { return im.strips > 1; });
    return r;
  }

  async function makeImage(job, spec, name, pages) {
    var cp = job.cp, L = job.L, u = job.u, lim = job.lim, ctl = job.ctl, box = specBox(L, spec), sz = pxSize(box, u), mode = planFor(sz.w, sz.h, lim), cv, blob, done0 = job.done;
    var inj = ctl.inject || [];
    function file(nm, bl, w, h) { return { name: nm, blob: bl, mime: 'image/png', w: w, h: h, pages: pages, size: bl.size }; }
    function tick(px) { return job.tick(px); }
    if (ctl.mode === 'tiled' && mode === 'native') mode = 'tiled';
    if (mode === 'native') {
      try {
        if (inj.indexOf('native') >= 0) throw new Error('injected failure: native');
        cv = spec.merge ? renderMerged(cp, L, u) : renderPage(cp, L, spec.page, u);
        blob = await toBlob(cv, 'image/png');
        release(cv); cv = null;
        if (!blob) throw new Error('toBlob gave nothing');
        await job.emit(file(name + '.png', blob, sz.w, sz.h));
        await tick(sz.w * sz.h);
        return;
      } catch (e) {
        MX.err(e); if (cv) release(cv);
        mode = sz.w * sz.h <= lim.FILE_PX && Math.max(sz.w, sz.h) <= lim.FILE_SIDE ? 'tiled' : 'strips';
        job.done = done0;
      }
    }
    var useLim = lim;
    if (mode === 'tiled') {
      try {
        blob = await encodeRegion(cp, L, spec, u, { x0: 0, y0: 0, w: sz.w, h: sz.h }, lim, ctl, tick, 'tiled');
        await job.emit(file(name + '.png', blob, sz.w, sz.h));
        return;
      } catch (e) {
        MX.err(e);
        job.notes.push('合成大圖時出錯（可能是記憶體不足），改存為分段圖片，解析度不變。');
        job.done = done0; useLim = smallLim(lim); mode = 'strips';
      }
    }
    try {
      var k = stripCount(sz.w, sz.h, useLim), regs = stripRegions(L, spec, u, sz.w, sz.h, k), made = [], i;
      for (i = 0; i < regs.length; i++) {
        blob = await encodeRegion(cp, L, spec, u, regs[i], useLim, ctl, tick, 'strips');
        made.push(file(name + (regs.length > 1 ? '-' + (regs.length >= 10 ? MX.pad2(i + 1) : String(i + 1)) : '') + '.png', blob, regs[i].w, regs[i].h));
        made[i].strip = { i: i + 1, n: regs.length, x0: regs[i].x0, y0: regs[i].y0 };
      }
      if (regs.length > 1 && !job.notes.some(function (n) { return n.indexOf('分成') >= 0; })) job.notes.push('圖片很大，已依解析度分成 ' + regs.length + ' 張（' + (L.d.dir === 'v' && sz.w >= sz.h ? '第 1 張在最右邊，由右到左接起來' : '第 1 張在最前面，依序接起來') + '）。');
      for (i = 0; i < made.length; i++) await job.emit(made[i]);
      return;
    } catch (e) {
      MX.err(e);
      job.done = done0;
    }
    // last resort: ONE canvas at the biggest scale the device accepts
    var u2 = scaleFor(L, job.cell), sz2 = pxSize(box, u2);
    job.notes.push('裝置記憶體不足：這張圖只能降低解析度輸出（每字約 ' + Math.round(u2) + ' 像素）。可改選「螢幕」，或改存分頁。');
    cv = spec.merge ? renderMerged(cp, L, u2) : renderPage(cp, L, spec.page, u2);
    blob = await toBlob(cv, 'image/png');
    release(cv);
    await job.emit(file(name + '.png', blob, sz2.w, sz2.h));
    await tick(sz.w * sz.h);
  }

  // ------------------------------------------------------------------ file names
  function shortName(cp, d) {
    var t = cp.text || {};
    if (t.short && t.short[d.script]) return t.short[d.script].replace(/[\\/:*?"<>|\s]+/g, '_');
    return cp.copy.textId === 'heart-sutra' && !t.multi ? '心經' : (((t.title && (t.title[d.script] || t.title.trad)) || cp.copy.textId).replace(/[\\/:*?"<>|\s]+/g, '_'));
  }
  function ymd(ts) { var x = new Date(ts); return x.getFullYear() + MX.pad2(x.getMonth() + 1) + MX.pad2(x.getDate()); }
  // The writing number of a copy: the n-th time this section was started (all copies of the section, any script, active and archived, by start time), so two writings of
  // the same text on the same day never get the same name. Deleting an older archive renumbers the later ones.
  function writingNo(copy) {
    var M = MX.Model, n = 1, sid = M.sid(copy);
    Object.keys(M.copies).forEach(function (id) {
      var c = M.copies[id];
      if (c.id === copy.id || c.textId !== copy.textId || M.sid(c) !== sid) return;
      if ((c.createdAt || 0) < (copy.createdAt || 0) || ((c.createdAt || 0) === (copy.createdAt || 0) && c.id < copy.id)) n++;
    });
    return n;
  }
  // 心經-繁-20261101-第2遍-手卷: text (+ section), script, finishing date (see copyDate), writing number, format
  function baseName(cp, d) { return shortName(cp, d) + '-' + (d.script === 'simp' ? '简' : '繁') + '-' + ymd(d.date) + '-第' + writingNo(cp.copy) + '遍-' + FORMAT_NAME[d.format]; }

  // The panel under the status line that holds the finished files (one 儲存 button per file, each PNG also as an <img>, a PDF with 開啟 PDF 列印): shared by the 匯出作品 screen
  // and the 練習紙 screen (print.js). The browser only RENDERS on the big button; the saving happens from these buttons' own taps (a fresh user activation).
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function makePanel(panel, status) {
    function clear() {
      (panel._urls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
      panel._urls = [];
      panel.innerHTML = '';
    }
    async function saveOne(f, btn) {
      btn.disabled = true;
      try {
        var st = await MX.saveFile(f.name, f.blob, f.mime);       // first await inside: the tap's activation is still fresh (the files are already rendered)
        MX.toast(st);
        status.textContent = st;
      } catch (e) { MX.err(e); MX.toast('儲存失敗，請長按圖片儲存'); status.textContent = '儲存失敗'; }
      btn.disabled = false;
    }
    // the PDF in a new tab: the browser's PDF viewer has the print dialog (the tap is fresh, so the pop-up is allowed)
    function openPdf(f) {
      var url = URL.createObjectURL(f.blob), w = null;
      panel._urls.push(url);
      try { w = window.open(url, '_blank'); } catch (e) { w = null; }
      if (!w) { MX.toast('瀏覽器擋住了新視窗：請按「儲存」，再用 PDF 閱讀器列印'); status.textContent = '新視窗被擋住了'; } else status.textContent = '已在新分頁開啟，請用瀏覽器的列印功能';
    }
    function show(files) {
      clear();
      var many = files.length > 1;
      (files.notes || []).forEach(function (n) { panel.appendChild(h('div', { class: 'note', 'data-role': 'save-note', text: n })); });
      panel.appendChild(h('div', { class: 'note', 'data-role': 'save-ready', text: '檔案已備妥（' + files.length + ' 個）。請按「儲存」' + (many ? '，每頁一個。' : '。') + (files[0].mime === 'application/pdf' ? '' : '儲存不了時，長按圖片選「儲存圖片」。') }));
      files.forEach(function (f, i) {
        var item = h('div', { class: 'savefile', 'data-idx': i }, [
          h('div', { class: 'note', text: f.name + ' · ' + kb(f.blob.size) }),
          h('button', { class: 'on big', 'data-act': 'save-file', 'data-idx': i, text: many ? '儲存 第 ' + (i + 1) + ' 個（共 ' + files.length + '）' : '儲存', onclick: function (ev) { saveOne(f, ev.currentTarget); } })
        ]);
        if (f.mime === 'application/pdf') {
          item.appendChild(h('button', { class: 'big', 'data-act': 'print-open', text: '開啟 PDF 列印', onclick: function () { openPdf(f); } }));
          item.appendChild(h('div', { class: 'note', 'data-role': 'print-note', text: '網頁：開啟後用瀏覽器的列印（列印比例選「實際大小」）。手機 App：儲存後用 PDF 檢視器的列印功能。' }));
        }
        if (/^image\//.test(f.mime) && f.w * f.h <= LIM.IMG_PX) {
          var url = URL.createObjectURL(f.blob);
          panel._urls.push(url);
          item.appendChild(h('img', { class: 'saveimg', 'data-role': 'save-img', alt: f.name, src: url, loading: 'lazy', decoding: 'async', draggable: 'false' }));
          item.appendChild(h('div', { class: 'note', text: '長按圖片儲存' }));
        } else if (/^image\//.test(f.mime)) item.appendChild(h('div', { class: 'note', 'data-role': 'big-note', text: '圖片很大（' + f.w + '×' + f.h + ' 像素），不顯示預覽，請按「儲存」。' }));
        panel.appendChild(item);
      });
    }
    return { clear: clear, show: show };
  }

  var E = MX.Export = {
    K: K, RATIOS: RATIOS, CELL_PX: CELL_PX, MAX_PX: MAX_PX, MAX_SIDE: MAX_SIDE, RED: RED, PAPER: PAPER,
    // cp = {copy, text, cells}
    ctx: function (copy, text, cells) { return { copy: copy, text: text, cells: cells }; },
    RES_PX: RES_PX, RES_LIST: RES_LIST, LIM: LIM, describe: describe, planFor: planFor, stripRegions: stripRegions, paintTile: paintTile, last: null,
    resolve: resolve, compose: compose, scaleFor: scaleFor, pxSize: pxSize, sealShape: sealShape, buildPdf: buildPdf, renderPage: renderPage, renderMerged: renderMerged,
    prepare: prepare, baseName: baseName, copyDate: copyDate, writingNo: writingNo, shortName: shortName, DPI_LIST: DPI_LIST,
    // what print.js (the print PDF and the practice sheets) shares with this file
    int: {
      paintItems: paintItems, encodeRegion: encodeRegion, yieldUi: yieldUi, release: release, limits: function (ctl) { return Object.assign({}, LIM, lowMem() ? LOW : {}, (ctl && ctl.lim) || {}); },
      makePanel: makePanel, ymd: ymd, TPL_COL: TPL_COL, INK: INK, RULE_ZHU: RULE_ZHU, RULE_WU: RULE_WU, itemBox: itemBox, byRole: byRole, kb: kb
    },

    // Render the whole export. Returns [{name, blob, mime, w, h, pages, size}]: PNG per page, or ONE multi-page PDF (分頁 + out 'pdf'); `.notes` = messages for the user.
    // PNG files keep the chosen resolution (RES_PX) whatever the size: one native canvas when it fits, else tiles + streaming encoder, else numbered strips (makeImage).
    // ctl (all optional): progress(0..1), sink(file) (awaited per file; the blob is dropped afterwards), lim (overrides of LIM), mode 'tiled' (force the tiled path),
    // noNative (built-in deflate), inject (['native', 'tiled', 'strips']: that stage fails on purpose, for the tests).
    build: async function (cp, o, ctl) {
      ctl = ctl || {};
      if (o && o.out === 'print') return E.buildPrint(cp, o, ctl);      // 列印用 PDF: app/js/print.js
      var L = compose(cp, o), d = L.d, cell = RES_PX[d.res], lim = Object.assign({}, LIM, lowMem() ? LOW : {}, ctl.lim || {}), base = baseName(cp, d), out = [], notes = [], i, cv, sz;
      var info = describe(L, { lim: ctl.lim }), job = { cp: cp, L: L, u: cell, cell: cell, lim: lim, ctl: ctl, notes: notes, done: 0, total: Math.max(1, info.px) };
      job.tick = async function (px) {
        job.done += px;
        if (ctl.progress) ctl.progress(Math.min(1, job.done / job.total));
        await yieldUi();
      };
      job.emit = async function (f) {
        if (ctl.sink) { f.status = await ctl.sink(f); f.blob = null; }
        out.push(f);
      };
      out.notes = notes;
      await prepare(cp, L);
      if (d.format === 'pages' && d.out === 'pdf') {
        var pgs = [], pw = d.r >= 1 ? 841.8898 : 595.2756, u = info.u;
        if (info.capped) notes.push('PDF 每頁最多約 1600 萬像素，這份每字約 ' + Math.round(u) + ' 像素。');
        for (i = 0; i < L.pages.length; i++) {
          cv = renderPage(cp, L, i, u); sz = pxSize(L.pages[i], u);
          var jb = await toBlob(cv, 'image/jpeg', 0.92), buf = new Uint8Array(await new Promise(function (res, rej) {
            var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsArrayBuffer(jb);
          }));
          release(cv);
          pgs.push({ jpeg: buf, w: sz.w, h: sz.h, pw: pw, ph: pw * L.pages[i].h / L.pages[i].w });
          await job.tick(sz.w * sz.h);
        }
        var pdf = new Blob([buildPdf(pgs)], { type: 'application/pdf' });
        await job.emit({ name: base + '.pdf', blob: pdf, mime: 'application/pdf', w: pgs[0].w, h: pgs[0].h, pages: pgs.length, size: pdf.size });
        return out;
      }
      if (L.merge) await makeImage(job, { merge: true }, base + '-長圖', L.pages.length);
      else for (i = 0; i < L.pages.length; i++) await makeImage(job, { page: i }, base + (d.format === 'pages' ? '-' + MX.pad2(i + 1) : ''), 1);
      return out;
    },
    run: async function (cp, o, ctl) {
      var st = '', c2 = Object.assign({}, ctl || {});
      c2.sink = async function (f) { st = await MX.saveFile(f.name, f.blob, f.mime); return st; };
      var files = await E.build(cp, o, c2);
      return { files: files, status: st, notes: files.notes };
    },

    // ---- export screen: static scaled preview (re-rendered only when an option changes), big segmented options
    openSheet: function (cp0) {
      var st = MX.Model.settings, textId = cp0.copy.textId, secId = MX.Model.sid(cp0.copy), ui = { cp: cp0, o: {}, page: 0, seq: 0, L: null };
      var KEEP = ['res', 'paperSize', 'margin', 'dpi', 'paper', 'rules', 'border', 'title', 'sign', 'seal', 'dateStyle', 'suffix', 'sealStyle', 'hui', 'punct', 'tpl'];
      var saved = st.exp || {};
      KEEP.forEach(function (k) { if (saved[k] !== undefined) ui.o[k] = saved[k]; });
      var root = h('div', { class: 'exp', 'data-screen': 'export' });
      var api = MX.overlay(root);
      var status = h('div', { class: 'note', 'data-role': 'exp-status' });
      var infoBox = h('div', { class: 'note expinfo', 'data-role': 'exp-info' });
      var box = h('div', { class: 'prevbox', 'data-role': 'exp-box' });
      var nav = h('div', { class: 'prevnav' });
      var ctrl = h('div', { 'data-role': 'exp-opts' });
      // APK: 儲存 renders and saves through the native bridge. Browser: the button only RENDERS the files; the 儲存 buttons of the panel (one per file / page) do the saving from their own tap
      // (a browser download started after long async work has lost its user activation, and Android Chrome silently drops it). Each PNG is also shown as an <img> (long-press to save).
      var native = !!(window.MoBridge && typeof window.MoBridge.saveFile === 'function');
      var btnSave = h('button', { class: 'on big', 'data-act': 'save', text: native ? '儲存' : '產生檔案', onclick: save });
      var panel = h('div', { class: 'savepanel', 'data-role': 'save-panel' });
      root.appendChild(h('div', { class: 'topbar' }, [h('h1', { class: 'grow', text: '匯出作品' }), btnSave,
        h('button', { class: 'big', 'data-act': 'back', text: '返回', onclick: function () { api.close(); } })]));
      var fpBox = h('div', { class: 'note fpnote', 'data-role': 'fp-note' });
      function updateFp() {
        var ch = false;
        try { ch = MX.Model.fpChanged(ui.cp.copy, ui.cp.text); } catch (e) { MX.err(e); }
        fpBox.textContent = ch ? MX.Model.FP_STR.note : '';
        fpBox.hidden = !ch;
      }
      updateFp();
      root.appendChild(status); root.appendChild(fpBox); root.appendChild(infoBox); root.appendChild(panel); root.appendChild(box); root.appendChild(nav); root.appendChild(ctrl);

      function scopes() {
        var list = [], act = MX.Model.activeCopy(textId, secId);
        if (act) list.push([act.id, '目前這一遍']);
        MX.Model.archived(textId, secId).forEach(function (c) { list.push([c.id, '存檔 ' + MX.fmtDate(c.archivedAt || c.updatedAt)]); });
        if (!list.some(function (x) { return x[0] === ui.cp.copy.id; })) list.unshift([ui.cp.copy.id, ui.cp.copy.status === 'archived' ? '存檔' : '目前這一遍']);
        return list;
      }
      async function switchCopy(id) {
        var c = MX.Model.copies[id];
        if (!c) return;
        var text = await MX.Library.getView(textId, secId);
        MX.Model.loadInk(c);
        MX.Model.upgradeKeys(c, text);
        ui.cp = E.ctx(c, text, Layout.cellsFor(text, c));
        ui.o.format = undefined; ui.o.ratio = undefined; ui.o.perLine = undefined; ui.o.orient = undefined; ui.page = 0;
        updateFp();
        drawControls(); refresh();
      }
      function persist() {
        var o = {};
        KEEP.forEach(function (k) { if (ui.o[k] !== undefined) o[k] = ui.o[k]; });
        st.exp = o; MX.Model.saveSettings();
      }
      function set(k, v, noPersist) {
        ui.o[k] = v;
        if (k === 'format') { ui.o.ratio = undefined; ui.o.orient = undefined; ui.page = 0; if (v !== 'pages') { ui.o.merge = undefined; if (ui.o.out === 'pdf') ui.o.out = undefined; } }
        if (k === 'out' || k === 'paperSize' || k === 'orient') ui.page = 0;
        if (KEEP.indexOf(k) >= 0 && !noPersist) persist();
        drawControls(); refresh();
      }
      function drawControls() {
        var d = resolve(ui.cp, ui.o), cfg = ui.cp.copy.cfg, rows = [], onoff = [[true, '有'], [false, '無']];
        function row(k, label, opts, val, fn) {
          rows.push(MX.Form.row(label, MX.Form.seg(opts, val, fn || function (v) { set(k, v); }), k));
        }
        var sc = scopes();
        if (sc.length > 1) rows.push(MX.Form.row('範圍', MX.Form.seg(sc, ui.cp.copy.id, function (v) { switchCopy(v); }), 'range'));
        var fmts = [['sheet', '單張']]; if (d.dir === 'v') fmts.push(['scroll', '手卷']); fmts.push(['pages', '分頁']);
        row('format', '格式', fmts, d.format);
        var print = d.out === 'print';
        row('out', '輸出', d.format === 'pages' ? [['png', 'PNG 逐頁'], ['pdf', 'PDF 一份'], ['print', '列印用 PDF']] : [['png', 'PNG 圖片'], ['print', '列印用 PDF']], d.format !== 'pages' && d.out === 'pdf' ? 'png' : d.out);
        if (print) {
          row('paperSize', '紙張', [['A4', 'A4'], ['A3', 'A3'], ['Letter', 'Letter']], d.paperSize);
          row('orient', '紙張方向', [['p', '直向'], ['l', '橫向']], d.orient);
          row('margin', '邊界', [[8, '窄 8 mm'], [12, '標準 12 mm'], [20, '寬 20 mm']], d.margin);
        } else if (d.format !== 'scroll') row('ratio', d.format === 'pages' ? '頁面比例' : '比例', RATIO_LIST, d.ratio);
        row('perLine', d.dir === 'v' ? '每行字數（每欄）' : '每行字數', [[0, '自動'], [8, '8'], [10, '10'], [12, '12'], [15, '15'], [20, '20'], [25, '25']], d.perLine);
        if (print) {
          row('dpi', '解析度', [[150, '150 dpi 草稿'], [300, '300 dpi 列印'], [600, '600 dpi 精細']], d.dpi);
          rows.push(h('div', { class: 'note', 'data-role': 'print-note', text: '依紙張大小與 dpi 輸出實際像素，和字數無關。列印時請選「實際大小」（不要縮放）。' + (d.format === 'scroll' ? '手卷會在欄與欄之間切成數頁，由右到左接起來。' : '') + '一律白紙（省墨）。' }));
        } else {
          row('res', '解析度', RES_LIST, d.res);
          rows.push(h('div', { class: 'note', 'data-role': 'res-note', text: '解析度是每個字有多清楚，和字數多少無關：螢幕約 100 像素（檔案小）、列印約 220 像素、高清約 300 像素（檔案大）。' }));
          if (d.format === 'pages' && d.out === 'png') row('merge', '合併長圖', [[false, '分開存'], [true, '合成一張']], d.merge);
          row('paper', '紙色', [['xuan', '宣紙'], ['white', '純白']], d.paper);
        }
        row('rules', '欄線', [['zhu', '朱絲欄'], ['wu', '烏絲欄'], ['mi', '米字格'], ['none', '無']], d.rules);
        row('border', '邊框', onoff, d.border);
        row('title', '題目', onoff, d.title);
        row('sign', '落款', onoff, d.sign);
        if (d.sign) {
          row('dateStyle', '日期', [['gz', '干支年'], ['ce', '公元年'], ['none', '不寫']], d.dateStyle);
          row('suffix', d.buddhist ? '敬語' : '署款', d.buddhist ? Closing.SUFFIX_KEYS.map(function (k) { return [k, Closing.suffix('trad', k)]; }) : [['shu', '書'], ['lin', '臨']], d.suffix);
          if (!cfg.closing && d.buddhist) row('hui', '迴向', onoff, d.hui);
        }
        if (d.name) {
          row('seal', '印章', onoff, d.seal);
          if (d.seal) row('sealStyle', '印文', [['white', '白文'], ['red', '朱文']], d.sealStyle);
        }
        if (cfg.punct === 'show') row('punct', '標點', onoff, d.punct);
        row('tpl', '範本字', onoff, d.tpl);
        ctrl.innerHTML = '';
        rows.forEach(function (r) { ctrl.appendChild(r); });
        ctrl.appendChild(h('div', { class: 'note', text: d.name ? '姓名：' + d.name + '（可在「設定」更改）' : '尚未設定姓名：到「設定」輸入姓名，才會有落款姓名與印章。' }));
      }
      var pan = makePanel(panel, status);
      var clearPanel = pan.clear, showPanel = pan.show;
      function px(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
      // the size line under the status: file count and estimated size, strips, very large images, the PDF cap
      function showInfo(inf, L) {
        var lines = [], mp = Math.round(inf.maxPx / 1e6);
        lines.push((inf.pdf ? 'PDF 1 個' : '檔案 ' + inf.files + ' 個') + '，預估約 ' + kb(inf.bytes) + '（實際大小依寫了多少字而定）');
        if (inf.strips) {
          var im = inf.images.filter(function (x) { return x.strips > 1; })[0];
          var wide = im.w >= im.h;
          lines.push('這張圖太大，無法存成單一檔案：會依解析度分成 ' + im.strips + ' 張（每張約 ' + px(Math.round(wide ? im.w / im.strips : im.w)) + '×' + px(Math.round(wide ? im.h : im.h / im.strips)) + ' 像素），' +
            (L.d.dir === 'v' && wide ? '第 1 張在最右邊，由右到左接起來' : '第 1 張在最前面，依序接起來') + '，每個字的解析度不變。');
        }
        if (inf.big) lines.push('圖片很大（約 ' + mp + ' 百萬像素）：產生要等一下，部分手機相簿可能縮小顯示。要看清楚請用電腦，或改選「螢幕」解析度。');
        (inf.notes || []).forEach(function (t) { lines.push(t); });
        if (inf.capped) lines.push('PDF 的每一頁最多約 1600 萬像素，所以這份 PDF 每字約 ' + Math.round(inf.u) + ' 像素；要更高解析度請存 PNG。');
        infoBox.innerHTML = '';
        lines.forEach(function (t, i) { infoBox.appendChild(h('div', { 'data-role': i === 0 ? 'exp-size' : 'exp-warn', text: t })); });
      }
      async function refresh() {
        clearPanel();
        var seq = ++ui.seq;
        status.textContent = '處理中…';
        var L;
        try { L = compose(ui.cp, ui.o); await prepare(ui.cp, L); } catch (e) { MX.err(e); status.textContent = '預覽失敗'; return; }
        if (seq !== ui.seq) return;
        ui.L = L;
        var cv, npages = L.pages.length, sz, inf;
        if (L.d.out === 'print') {       // the paper pages (print.js): the preview is page ui.page of the sheet of paper, at a small dpi
          var pv = E.renderPrintPreview(ui.cp, L, ui.page, 1100);
          cv = pv.cv; ui.page = pv.page; npages = pv.pages; sz = { w: pv.W, h: pv.H };
          cv.setAttribute('data-print', L.d.paperSize + L.d.orient);
          inf = describe(L, { cp: ui.cp });
        } else {
          ui.page = MX.clamp(ui.page, 0, L.pages.length - 1);
          var fit = scaleFor(L), pg = L.merge || L.pages[ui.page], mx = Math.max(pg.w, pg.h);
          var u = Math.min(fit, (L.d.format === 'scroll' || (L.merge && pg.w / pg.h > 2) ? 1600 : 1100) / mx);
          cv = L.merge ? renderMerged(ui.cp, L, u) : renderPage(ui.cp, L, ui.page, u);
          if (L.merge) cv.setAttribute('data-merged', L.merge.dir);
          inf = describe(L, { cp: ui.cp });
          var im = inf.images[L.merge ? 0 : Math.min(ui.page, inf.images.length - 1)];
          sz = { w: im.w, h: im.h };
        }
        cv.setAttribute('data-role', 'exp-preview');
        cv.setAttribute('data-pages', String(npages));
        cv.setAttribute('data-page', String(ui.page));
        box.innerHTML = ''; box.appendChild(cv);
        showInfo(inf, L);
        status.textContent = L.d.out === 'print' ? '共 ' + npages + ' 頁 · ' + L.d.paperSize + (L.d.orient === 'l' ? ' 橫向' : ' 直向') + ' · 輸出 ' + sz.w + '×' + sz.h + ' px（' + L.d.dpi + ' dpi）· 每行 ' + L.P + ' 字'
          : L.merge ? '共 ' + L.pages.length + ' 頁，合成 1 張（' + (L.merge.dir === 'v' ? '由右到左並排' : '由上到下') + '）· 輸出 ' + sz.w + '×' + sz.h + ' px · 每行 ' + L.P + ' 字'
          : '共 ' + L.pages.length + ' ' + (L.d.format === 'pages' ? '頁' : '張') + ' · 輸出 ' + sz.w + '×' + sz.h + ' px · 每行 ' + L.P + ' 字';
        nav.innerHTML = '';
        if (npages > 1 && !L.merge) {
          nav.appendChild(h('button', { 'data-act': 'pprev', text: '上一頁', disabled: ui.page <= 0 ? true : null, onclick: function () { ui.page--; refresh(); } }));
          nav.appendChild(h('div', { 'data-role': 'exp-ctr', text: (ui.page + 1) + ' / ' + npages }));
          nav.appendChild(h('button', { 'data-act': 'pnext', text: '下一頁', disabled: ui.page >= npages - 1 ? true : null, onclick: function () { ui.page++; refresh(); } }));
        }
      }
      function progress(f) { status.textContent = '正在產生… ' + Math.round(f * 100) + '%'; }
      async function save() {
        btnSave.disabled = true;
        if (!native) {
          status.textContent = '處理中…';
          var seq0 = ui.seq;
          try {
            var files = await E.build(ui.cp, ui.o, { progress: progress });
            if (seq0 === ui.seq) { showPanel(files); status.textContent = '檔案已備妥，請按「儲存」'; try { panel.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
          } catch (e) { MX.err(e); MX.toast('匯出失敗'); status.textContent = '匯出失敗'; }
          btnSave.disabled = false;
          return;
        }
        status.textContent = '儲存中…';
        try {
          var r = await E.run(ui.cp, ui.o, { progress: progress });
          MX.toast(r.files.length > 1 ? '已匯出 ' + r.files.length + ' 個檔案 · ' + r.status : r.status);
          status.textContent = '已儲存：' + r.files.map(function (f) { return f.name; }).join('、') + (r.notes && r.notes.length ? '　' + r.notes.join(' ') : '');
          if (r.files.some(function (f) { return f.mime === 'application/pdf'; })) status.textContent += '　（用手機的 PDF 檢視器就能列印）';
        } catch (e) { MX.err(e); MX.toast('匯出失敗'); status.textContent = '匯出失敗'; }
        btnSave.disabled = false;
      }
      drawControls();
      refresh();
      return { close: api.close, ui: ui };
    },

    // ---- whole-app data backup: see js/backup.js (MX.Backup). These two keep the plain-JSON, replace-everything form the tests and older code use.
    json: function () { return JSON.stringify(MX.Backup.build(null)); },
    importText: function (text) {
      var rep = MX.Backup.inspect(MX.Backup.parse(text));
      MX.Backup.replace(rep);
      return Object.keys(rep.valid).length;
    }
  };
})();
