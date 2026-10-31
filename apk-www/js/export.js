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
  function copyDate(copy) { return copy.createdAt || copy.updatedAt || Date.now(); }       // the copy's start date, fixed (also what the practice 落款 cells use)
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
      sealStyle: o.sealStyle === 'red' ? 'red' : 'white', punct: !!o.punct && cfg.punct === 'show', tpl: !!o.tpl, out: o.out === 'pdf' ? 'pdf' : 'png',
      date: +o.date || copyDate(cp.copy), font: o.font || st.tplFont
    };
    d.merge = o.merge === true && d.format === 'pages' && d.out === 'png';      // 合併長圖: all 分頁 sheets in ONE image (see mergePlan)
    d.ratio = RATIOS[o.ratio] ? o.ratio : (d.format === 'pages' ? 'A4p' : (dir === 'v' ? '4:3' : '3:4'));
    d.r = RATIOS[d.ratio];
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
  // Pixels per cell unit: 220 px per cell, scaled down so that every page is <= 16 megapixels and <= 8192 px per side.
  function scaleFor(L) {
    var u = CELL_PX;
    (L.merge ? [L.merge] : L.pages).forEach(function (pg) {
      u = Math.min(u, Math.sqrt(MAX_PX / (pg.w * pg.h)), MAX_SIDE / Math.max(pg.w, pg.h));
    });
    return Math.floor(u * 1000) / 1000;
  }
  function pxSize(pg, u) { return { w: Math.max(1, Math.floor(pg.w * u)), h: Math.max(1, Math.floor(pg.h * u)) }; }

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
  function renderPage(cp, L, idx, u) {
    var d = L.d, pg = L.pages[idx], sz = pxSize(pg, u), cv = document.createElement('canvas');
    cv.width = sz.w; cv.height = sz.h;
    var ctx = cv.getContext('2d'), paper = PAPER[d.paper], inkStyle = MX.Ink.style(MX.Model.settings);
    ctx.fillStyle = paper; ctx.fillRect(0, 0, sz.w, sz.h);
    ctx.lineCap = 'butt';
    var ink = cp.copy.ink, order = ['rule', 'border', 'tpl', 'body', 'title', 'sig', 'punct', 'seal', 'pageno'];
    order.forEach(function (role) {
      pg.items.forEach(function (it) {
        if (it.role !== role) return;
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
            var strokes = ink[cp.cells[it.i].key] || [];
            for (j = 0; j < strokes.length; j++) {
              MX.Ink.paintStroke(ctx, strokes[j], x + s * (1 - K.INK) / 2, y + s * (1 - K.INK) / 2, s * K.INK / 1000, inkStyle, INK, { px: 1 });   // the same brush model as on screen
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
    return cv;
  }

  // The 合併長圖 image: every sheet rendered at u px per cell and pasted at its place of mergePlan; a thin grey line marks each gutter.
  function renderMerged(cp, L, u) {
    var m = L.merge, d = L.d, w = Math.max(1, Math.floor(m.w * u)), hh = Math.max(1, Math.floor(m.h * u)), cv = document.createElement('canvas');
    cv.width = w; cv.height = hh;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = PAPER[d.paper]; ctx.fillRect(0, 0, w, hh);
    m.at.forEach(function (p, k) {
      var pc = renderPage(cp, L, p.i, u), pg = L.pages[p.i];
      ctx.drawImage(pc, Math.round(p.x * u), Math.round(p.y * u));
      release(pc);
      if (k < m.at.length - 1) {
        ctx.fillStyle = RULE_WU;
        var lw = Math.max(1, Math.round(0.02 * u));
        if (m.dir === 'v') ctx.fillRect(Math.round((p.x - m.gutter / 2) * u - lw / 2), 0, lw, hh);
        else ctx.fillRect(0, Math.round((p.y + pg.h + m.gutter / 2) * u - lw / 2), w, lw);
      }
    });
    return cv;
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

  // ------------------------------------------------------------------ file names
  function shortName(cp, d) {
    var t = cp.text || {};
    if (t.short && t.short[d.script]) return t.short[d.script].replace(/[\\/:*?"<>|\s]+/g, '_');
    return cp.copy.textId === 'heart-sutra' && !t.multi ? '心經' : (((t.title && (t.title[d.script] || t.title.trad)) || cp.copy.textId).replace(/[\\/:*?"<>|\s]+/g, '_'));
  }
  function ymd(ts) { var x = new Date(ts); return x.getFullYear() + MX.pad2(x.getMonth() + 1) + MX.pad2(x.getDate()); }
  function baseName(cp, d) { return shortName(cp, d) + '-' + d.script + '-' + ymd(d.date) + '-' + FORMAT_NAME[d.format]; }

  var E = MX.Export = {
    K: K, RATIOS: RATIOS, CELL_PX: CELL_PX, MAX_PX: MAX_PX, MAX_SIDE: MAX_SIDE, RED: RED, PAPER: PAPER,
    // cp = {copy, text, cells}
    ctx: function (copy, text, cells) { return { copy: copy, text: text, cells: cells }; },
    resolve: resolve, compose: compose, scaleFor: scaleFor, pxSize: pxSize, sealShape: sealShape, buildPdf: buildPdf, renderPage: renderPage, renderMerged: renderMerged,
    prepare: prepare, baseName: baseName,

    // Render the whole export. Returns [{name, blob, mime, w, h, pages}]: PNG per page, or ONE multi-page PDF (分頁 + out 'pdf').
    build: async function (cp, o) {
      var L = compose(cp, o), d = L.d, u = scaleFor(L), base = baseName(cp, d), out = [], i, cv, sz;
      await prepare(cp, L);
      if (d.format === 'pages' && d.out === 'pdf') {
        var pgs = [], pw = d.r >= 1 ? 841.8898 : 595.2756;
        for (i = 0; i < L.pages.length; i++) {
          cv = renderPage(cp, L, i, u); sz = pxSize(L.pages[i], u);
          var jb = await toBlob(cv, 'image/jpeg', 0.92), buf = new Uint8Array(await new Promise(function (res, rej) {
            var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsArrayBuffer(jb);
          }));
          release(cv);
          pgs.push({ jpeg: buf, w: sz.w, h: sz.h, pw: pw, ph: pw * L.pages[i].h / L.pages[i].w });
        }
        out.push({ name: base + '.pdf', blob: new Blob([buildPdf(pgs)], { type: 'application/pdf' }), mime: 'application/pdf', w: pgs[0].w, h: pgs[0].h, pages: pgs.length });
        return out;
      }
      if (L.merge) {
        cv = renderMerged(cp, L, u); sz = { w: cv.width, h: cv.height };
        var mb = await toBlob(cv, 'image/png');
        release(cv);
        out.push({ name: base + '-長圖.png', blob: mb, mime: 'image/png', w: sz.w, h: sz.h, pages: L.pages.length });
        return out;
      }
      for (i = 0; i < L.pages.length; i++) {
        cv = renderPage(cp, L, i, u); sz = { w: cv.width, h: cv.height };
        var blob = await toBlob(cv, 'image/png');
        release(cv);
        out.push({ name: base + (d.format === 'pages' ? '-' + MX.pad2(i + 1) : '') + '.png', blob: blob, mime: 'image/png', w: sz.w, h: sz.h, pages: 1 });
      }
      return out;
    },
    run: async function (cp, o) {
      var files = await E.build(cp, o), st = '';
      for (var i = 0; i < files.length; i++) st = await MX.saveFile(files[i].name, files[i].blob, files[i].mime);
      return { files: files, status: st };
    },

    // ---- export screen: static scaled preview (re-rendered only when an option changes), big segmented options
    openSheet: function (cp0) {
      var st = MX.Model.settings, textId = cp0.copy.textId, secId = MX.Model.sid(cp0.copy), ui = { cp: cp0, o: {}, page: 0, seq: 0, L: null };
      var KEEP = ['paper', 'rules', 'border', 'title', 'sign', 'seal', 'dateStyle', 'suffix', 'sealStyle', 'hui', 'punct', 'tpl'];
      var saved = st.exp || {};
      KEEP.forEach(function (k) { if (saved[k] !== undefined) ui.o[k] = saved[k]; });
      var root = h('div', { class: 'exp', 'data-screen': 'export' });
      var api = MX.overlay(root);
      var status = h('div', { class: 'note', 'data-role': 'exp-status' });
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
      root.appendChild(status); root.appendChild(panel); root.appendChild(box); root.appendChild(nav); root.appendChild(ctrl);

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
        ui.o.format = undefined; ui.o.ratio = undefined; ui.o.perLine = undefined; ui.page = 0;
        drawControls(); refresh();
      }
      function persist() {
        var o = {};
        KEEP.forEach(function (k) { if (ui.o[k] !== undefined) o[k] = ui.o[k]; });
        st.exp = o; MX.Model.saveSettings();
      }
      function set(k, v, noPersist) {
        ui.o[k] = v;
        if (k === 'format') { ui.o.ratio = undefined; ui.page = 0; if (v !== 'pages') ui.o.merge = undefined; }
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
        if (d.format !== 'scroll') row('ratio', d.format === 'pages' ? '頁面比例' : '比例', RATIO_LIST, d.ratio);
        row('perLine', d.dir === 'v' ? '每行字數（每欄）' : '每行字數', [[0, '自動'], [8, '8'], [10, '10'], [12, '12'], [15, '15'], [20, '20'], [25, '25']], d.perLine);
        if (d.format === 'pages') row('out', '輸出', [['png', 'PNG 逐頁'], ['pdf', 'PDF 一份']], d.out);
        if (d.format === 'pages' && d.out === 'png') row('merge', '合併長圖', [[false, '分開存'], [true, '合成一張']], d.merge);
        row('paper', '紙色', [['xuan', '宣紙'], ['white', '純白']], d.paper);
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
      function clearPanel() {
        (panel._urls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
        panel._urls = [];
        panel.innerHTML = '';
      }
      function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
      function showPanel(files) {
        clearPanel();
        var many = files.length > 1;
        panel.appendChild(h('div', { class: 'note', 'data-role': 'save-ready', text: '檔案已備妥（' + files.length + ' 個）。請按「儲存」' + (many ? '，每頁一個。' : '。') + (files[0].mime === 'application/pdf' ? '' : '儲存不了時，長按圖片選「儲存圖片」。') }));
        files.forEach(function (f, i) {
          var item = h('div', { class: 'savefile', 'data-idx': i }, [
            h('div', { class: 'note', text: f.name + ' · ' + kb(f.blob.size) }),
            h('button', { class: 'on big', 'data-act': 'save-file', 'data-idx': i, text: many ? '儲存 第 ' + (i + 1) + ' 個（共 ' + files.length + '）' : '儲存', onclick: function (ev) { saveOne(f, ev.currentTarget); } })
          ]);
          if (/^image\//.test(f.mime)) {
            var url = URL.createObjectURL(f.blob);
            panel._urls.push(url);
            item.appendChild(h('img', { class: 'saveimg', 'data-role': 'save-img', alt: f.name, src: url, loading: 'lazy', decoding: 'async', draggable: 'false' }));
            item.appendChild(h('div', { class: 'note', text: '長按圖片儲存' }));
          }
          panel.appendChild(item);
        });
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
      async function refresh() {
        clearPanel();
        var seq = ++ui.seq;
        status.textContent = '處理中…';
        var L;
        try { L = compose(ui.cp, ui.o); await prepare(ui.cp, L); } catch (e) { MX.err(e); status.textContent = '預覽失敗'; return; }
        if (seq !== ui.seq) return;
        ui.L = L;
        ui.page = MX.clamp(ui.page, 0, L.pages.length - 1);
        var fit = scaleFor(L), pg = L.merge || L.pages[ui.page], mx = Math.max(pg.w, pg.h);
        var u = Math.min(fit, (L.d.format === 'scroll' || (L.merge && pg.w / pg.h > 2) ? 1600 : 1100) / mx);
        var cv = L.merge ? renderMerged(ui.cp, L, u) : renderPage(ui.cp, L, ui.page, u);
        cv.setAttribute('data-role', 'exp-preview');
        cv.setAttribute('data-pages', String(L.pages.length));
        cv.setAttribute('data-page', String(ui.page));
        if (L.merge) cv.setAttribute('data-merged', L.merge.dir);
        box.innerHTML = ''; box.appendChild(cv);
        var sz = pxSize(pg, fit);
        status.textContent = L.merge ? '共 ' + L.pages.length + ' 頁，合成 1 張（' + (L.merge.dir === 'v' ? '由右到左並排' : '由上到下') + '）· 輸出 ' + sz.w + '×' + sz.h + ' px · 每行 ' + L.P + ' 字'
          : '共 ' + L.pages.length + ' ' + (L.d.format === 'pages' ? '頁' : '張') + ' · 輸出 ' + sz.w + '×' + sz.h + ' px · 每行 ' + L.P + ' 字';
        nav.innerHTML = '';
        if (L.pages.length > 1 && !L.merge) {
          nav.appendChild(h('button', { 'data-act': 'pprev', text: '上一頁', disabled: ui.page <= 0 ? true : null, onclick: function () { ui.page--; refresh(); } }));
          nav.appendChild(h('div', { 'data-role': 'exp-ctr', text: (ui.page + 1) + ' / ' + L.pages.length }));
          nav.appendChild(h('button', { 'data-act': 'pnext', text: '下一頁', disabled: ui.page >= L.pages.length - 1 ? true : null, onclick: function () { ui.page++; refresh(); } }));
        }
      }
      async function save() {
        btnSave.disabled = true;
        if (!native) {
          status.textContent = '處理中…';
          var seq0 = ui.seq;
          try {
            var files = await E.build(ui.cp, ui.o);
            if (seq0 === ui.seq) { showPanel(files); status.textContent = '檔案已備妥，請按「儲存」'; try { panel.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
          } catch (e) { MX.err(e); MX.toast('匯出失敗'); status.textContent = '匯出失敗'; }
          btnSave.disabled = false;
          return;
        }
        status.textContent = '儲存中…';
        try {
          var r = await E.run(ui.cp, ui.o);
          MX.toast(r.files.length > 1 ? '已匯出 ' + r.files.length + ' 個檔案 · ' + r.status : r.status);
          status.textContent = '已儲存：' + r.files.map(function (f) { return f.name; }).join('、');
        } catch (e) { MX.err(e); MX.toast('匯出失敗'); status.textContent = '匯出失敗'; }
        btnSave.disabled = false;
      }
      drawControls();
      refresh();
      return { close: api.close, ui: ui };
    },

    // ---- whole-app data backup ----
    json: function () {
      MX.Model.flushAll();
      return JSON.stringify({ app: 'moxie', version: 1, exportedAt: new Date().toISOString(), entries: MX.Store.exportAll() });
    },
    // one tap, no long work before the save (the JSON is built synchronously), so the user activation is still fresh for the share sheet / the download
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
