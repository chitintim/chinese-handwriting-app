(function () {
  'use strict';
  var MX = window.MX;
  // cols x rows in portrait (swapped in landscape). Six steps: XL 特大, L 大, ML 中大, M 中, S 小, XS 特小.
  var DIMS = { XL: [3, 4], L: [4, 5], ML: [5, 7], M: [6, 8], S: [8, 10], XS: [10, 13] };

  // Build the cell sequence for a copy. A cell has a stable index (its position in this array),
  // independent of page size/orientation, so ink survives re-layout.
  function buildCells(text, cfg, signStr) {
    var script = cfg.script === 'simp' ? 'simp' : 'trad';
    var cells = [];
    function addSection(str, sec, keepAll) {
      Array.from(str || '').forEach(function (c) {
        if (/\s/.test(c)) return;
        if (keepAll || MX.Closing.isCJK(c)) cells.push({ ch: c, sec: sec, punct: '' });
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
    if (cfg.sign && signStr) addSection(signStr, 'tail', true);
    return cells;
  }

  // Pages = arrays of cell indices (or -1 for an unused slot). Title cells get their own page(s).
  function paginate(cells, perPage) {
    var pages = [], cur = [];
    function flush() {
      if (!cur.length) return;
      while (cur.length < perPage) cur.push(-1);
      pages.push(cur); cur = [];
    }
    var inTitle = true;
    cells.forEach(function (c, i) {
      if (inTitle && c.sec !== 'title') { flush(); inTitle = false; }
      if (c.sec !== 'title') inTitle = false;
      cur.push(i);
      if (cur.length === perPage) flush();
    });
    flush();
    if (!pages.length) { var e = []; for (var k = 0; k < perPage; k++) e.push(-1); pages.push(e); }
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
    DIMS: DIMS, EDGE_DEF: EDGE_DEF, edgePct: edgePct, buildCells: buildCells, paginate: paginate, grid: grid, insets: insets,
    slotToColRow: slotToColRow, colRowToSlot: colRowToSlot, flowGrid: flowGrid, slotToLinePos: slotToLinePos
  };
})();
