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

  function grid(W, H, cfg) {
    var portrait = W < H;
    var d = DIMS[cfg.size] || DIMS.M;
    var cols = portrait ? d[0] : d[1], rows = portrait ? d[1] : d[0];
    var cell = Math.max(10, Math.floor(Math.min(W / cols, H / rows)));
    return {
      cols: cols, rows: rows, perPage: cols * rows, cell: cell, portrait: portrait,
      ox: Math.floor((W - cell * cols) / 2), oy: Math.floor((H - cell * rows) / 2),
      dir: cfg.dir === 'h' ? 'h' : 'v', W: W, H: H
    };
  }
  // slot (0..perPage-1, reading order) -> column,row (0-based from the left/top)
  function slotToColRow(g, s) {
    if (g.dir === 'v') return { col: g.cols - 1 - Math.floor(s / g.rows), row: s % g.rows };
    return { col: s % g.cols, row: Math.floor(s / g.cols) };
  }
  function colRowToSlot(g, col, row) {
    if (g.dir === 'v') return (g.cols - 1 - col) * g.rows + row;
    return row * g.cols + col;
  }

  MX.Layout = {
    DIMS: DIMS, buildCells: buildCells, paginate: paginate, grid: grid,
    slotToColRow: slotToColRow, colRowToSlot: colRowToSlot
  };
})();
