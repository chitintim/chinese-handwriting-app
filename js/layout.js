(function () {
  'use strict';
  var MX = window.MX;
  // cols x rows in portrait (swapped in landscape). Six steps: XL 特大, L 大, ML 中大, M 中, S 小, XS 特小.
  var DIMS = { XL: [3, 4], L: [4, 5], ML: [5, 7], M: [6, 8], S: [8, 10], XS: [10, 13] };

  // Build the cell sequence for a copy: title cells (cfg.title), the body, the legacy 迴向 verse inside the body (cfg.closing, old copies), then the 落款 lines (sig = array of
  // strings, one per line, see Closing.signLines). A cell's position in this array is its index (pages, focus, `pos`); its ink is stored under its KEY, which never
  // shifts when other parts are switched on or off: title cell i = 't<i>', body cell n = '<n>', 落款 cell i = 's<i>'.
  function buildCells(text, cfg, sig) {
    var script = cfg.script === 'simp' ? 'simp' : 'trad';
    var cells = [], nb = 0, nt = 0, ns = 0;
    function addSection(str, sec, keepAll) {
      Array.from(str || '').forEach(function (c) {
        if (/\s/.test(c)) return;
        if (keepAll || MX.Closing.isCJK(c)) cells.push({ ch: c, sec: sec, punct: '', key: sec === 'title' ? 't' + (nt++) : String(nb++) });
        else {
          // punctuation attaches to the previous cell of the same section (never occupies a cell)
          for (var i = cells.length - 1; i >= 0; i--) {
            if (cells[i].sec === sec) { cells[i].punct += c; break; }
            break;
          }
        }
      });
    }
    if (cfg.title) addSection(text.title[script], 'title', true);
    addSection(text.body[script], 'body', false);
    if (cfg.closing) addSection(MX.Closing.verse[script], 'body', false);
    var lines = typeof sig === 'string' ? (sig ? [sig] : []) : (sig || []);
    if (cfg.sign) lines.forEach(function (ln, j) {
      Array.from(ln).forEach(function (c) { if (!/\s/.test(c)) cells.push({ ch: c, sec: 'sign', punct: '', line: j, key: 's' + (ns++) }); });
    });
    return cells;
  }
  // the cells of a copy of `text` (view) with the 落款 its settings give
  function cellsFor(text, copy) { return buildCells(text, copy.cfg, MX.Closing.signFor(copy, text)); }

  // Pages = arrays of perPage cell indices (-1 = unused slot), filled line by line (a line = a column in 直書 / a row in 橫書; slots run line by line, see slotToColRow).
  // The title starts at the first line and has its own line(s), the body starts on the next fresh line, the 落款 starts on a new line after the body:
  // 直書 each 落款 line sits 2 cells down from the top of its column, 橫書 each 落款 line is its own row, right-aligned. g = grid (dir, cols, rows).
  function paginate(cells, g) {
    var v = g.dir === 'v', per = v ? g.rows : g.cols, perPage = g.perPage, lines = [], cur = [], i, sec;
    function pad(n) { var a = []; while (n-- > 0) a.push(-1); return a; }
    function flush() { if (cur.length) { lines.push(cur.concat(pad(per - cur.length))); cur = []; } }
    function put(idx) { cur.push(idx); if (cur.length === per) flush(); }
    for (i = 0; i < cells.length; i++) {
      sec = cells[i].sec;
      if (sec !== 'sign') {
        if (cur.length && i && (cells[i - 1].sec === 'title') !== (sec === 'title')) flush();       // the body starts on a fresh line after the title
        put(i);
      }
    }
    flush();
    // 落款: segments (cells of one text line), each starting on a fresh line
    var segs = [], last = -1;
    for (i = 0; i < cells.length; i++) if (cells[i].sec === 'sign') {
      if (cells[i].line !== last) { segs.push([]); last = cells[i].line; }
      segs[segs.length - 1].push(i);
    }
    var indent = v ? Math.min(2, per - 1) : 0;
    segs.forEach(function (sg) {
      var room = per - indent, k, chunk;
      for (k = 0; k < sg.length; k += room) {
        chunk = sg.slice(k, k + room);
        lines.push(v ? pad(indent).concat(chunk, pad(per - indent - chunk.length)) : pad(per - chunk.length).concat(chunk));
      }
    });
    var lpp = perPage / per, pages = [], q, pg, r;
    for (q = 0; q < lines.length; q += lpp) {
      pg = [];
      for (r = 0; r < lpp; r++) pg = pg.concat(lines[q + r] || pad(per));
      pages.push(pg);
    }
    if (!pages.length) pages.push(pad(perPage));
    return pages;
  }

  // Screen edge safe margins (setting 邊緣留白): the pen digitizer / system gesture area at the very edge of the screen may not report the pen,
  // so no cell may sit there. bottom = % of the viewport height (default 3.5), side = % applied to left/right (of the width) and top (of the height)
  // (default 1). Only edges where the stage really touches the viewport edge get a margin (edges = {left, top, right, bottom} booleans).
  var EDGE_DEF = { bottom: 3.5, side: 1 };
  function pct(v, d) { v = parseFloat(v); return v >= 0 && v <= 20 ? v : d; }
  function edgePct(st) { return { b: pct(st && st.edgeBottom, EDGE_DEF.bottom), s: pct(st && st.edgeSide, EDGE_DEF.side) }; }
  function insets(st, vw, vh, edges) {
    var e = edgePct(st), b = e.b, s = e.s;
    edges = edges || { left: true, top: true, right: true, bottom: true };
    return {
      l: edges.left ? Math.round(vw * s / 100) : 0, r: edges.right ? Math.round(vw * s / 100) : 0,
      t: edges.top ? Math.round(vh * s / 100) : 0, b: edges.bottom ? Math.round(vh * b / 100) : 0
    };
  }

  // inset {l,t,r,b} (px, optional): cells are laid out inside W x H minus the insets; the canvas stays W x H.
  function grid(W, H, cfg, inset) {
    var portrait = W < H;
    var d = DIMS[cfg.size] || DIMS.M;
    var cols = portrait ? d[0] : d[1], rows = portrait ? d[1] : d[0];
    var n = inset || { l: 0, t: 0, r: 0, b: 0 };
    var aw = Math.max(10, W - n.l - n.r), ah = Math.max(10, H - n.t - n.b);
    var cell = Math.max(10, Math.floor(Math.min(aw / cols, ah / rows)));
    return {
      cols: cols, rows: rows, perPage: cols * rows, cell: cell, portrait: portrait,
      ox: n.l + Math.floor((aw - cell * cols) / 2), oy: n.t + Math.floor((ah - cell * rows) / 2),
      dir: cfg.dir === 'h' ? 'h' : 'v', W: W, H: H, inset: n
    };
  }
  // Phone layout: ONE cell per page, as large as fits the W x H stage (minus `margin` px on every side and the insets). Same fields as grid(), so paginate() (every line
  // holds one cell -> one page per cell, in sequence order whatever the writing direction), slotToColRow and the practice view work unchanged.
  function gridOne(W, H, cfg, inset, margin) {
    var n = inset || { l: 0, t: 0, r: 0, b: 0 }, m = margin === undefined ? 8 : margin;
    var aw = Math.max(10, W - n.l - n.r - 2 * m), ah = Math.max(10, H - n.t - n.b - 2 * m);
    var cell = Math.max(10, Math.floor(Math.min(aw, ah)));
    return {
      cols: 1, rows: 1, perPage: 1, cell: cell, portrait: W < H, single: true,
      ox: n.l + m + Math.floor((aw - cell) / 2), oy: n.t + m + Math.floor((ah - cell) / 2),
      dir: cfg.dir === 'h' ? 'h' : 'v', W: W, H: H, inset: n
    };
  }
  // slot (0..perPage-1, reading order) -> column,row (0-based from the left/top). THE reading-order mapping, shared by the practice view and
  // the 作品 export: 直書 fills a column top->bottom and columns advance right->left; 橫書 fills a row left->right and rows advance top->bottom.
  function slotToColRow(g, s) {
    if (g.dir === 'v') return { col: g.cols - 1 - Math.floor(s / g.rows), row: s % g.rows };
    return { col: s % g.cols, row: Math.floor(s / g.cols) };
  }
  function colRowToSlot(g, col, row) {
    if (g.dir === 'v') return (g.cols - 1 - col) * g.rows + row;
    return row * g.cols + col;
  }
  // A free-standing flow of n cells with `per` cells per line (column in 直書, row in 橫書), no page: used by the export.
  function flowGrid(dir, n, per) {
    per = Math.max(1, per);
    var lines = Math.max(1, Math.ceil(n / per));
    return dir === 'h' ? { dir: 'h', cols: per, rows: lines, perPage: per * lines } : { dir: 'v', cols: lines, rows: per, perPage: per * lines };
  }
  // slot -> {line, pos}: line 0 is the first line read (rightmost column in 直書, top row in 橫書), pos 0 its first cell.
  function slotToLinePos(g, s) {
    var cr = slotToColRow(g, s);
    return g.dir === 'v' ? { line: g.cols - 1 - cr.col, pos: cr.row } : { line: cr.row, pos: cr.col };
  }

  MX.Layout = {
    DIMS: DIMS, EDGE_DEF: EDGE_DEF, edgePct: edgePct, buildCells: buildCells, cellsFor: cellsFor, paginate: paginate, grid: grid, gridOne: gridOne, insets: insets,
    slotToColRow: slotToColRow, colRowToSlot: colRowToSlot, flowGrid: flowGrid, slotToLinePos: slotToLinePos
  };
})();
