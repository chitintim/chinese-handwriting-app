(function () {
  'use strict';
  var MX = window.MX;
  var D = MX.Draw = {};

  D.INK_W = { thin: 13, mid: 22, thick: 36 };   // base width in 1/1000 cell units (at p = 0.5)
  D.TONE = { light: '#c4c4c4', mid: '#a8a8a8', dark: '#858585' };
  D.GRID_OUT = '#cfcfcf';
  D.GRID_GUIDE = '#e3e3e3';

  D.fam = function (script) {
    return script === 'simp'
      ? '"MoKai SC","LXGW WenKai","Kaiti SC","STKaiti","KaiTi","Noto Serif CJK SC",serif'
      : '"MoKai TC","LXGW WenKai TC","Kaiti TC","BiauKai","DFKai-SB","Noto Serif CJK TC",serif';
  };

  function wOf(base, p, sc) {
    var w = base * (0.3 + 1.4 * p / 1000) * sc;
    return w < 0.9 ? 0.9 : w;
  }
  // Paint ink segments k0..k1 of a flat [x,y,p,...] stroke (cell-local 0..1000 units).
  // ox,oy = cell origin in px; sc = px per unit. fin=true also paints the closing segment.
  D.paint = function (ctx, pts, ox, oy, sc, k0, k1, fin, base) {
    var n = pts.length / 3;
    if (!n) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
    if (n === 1) {
      if (fin) {
        ctx.beginPath();
        ctx.arc(ox + pts[0] * sc, oy + pts[1] * sc, wOf(base, pts[2], sc) / 2, 0, 6.2832);
        ctx.fill();
      }
      return;
    }
    var k, ax, ay, bx, by, cx, cy;
    for (k = Math.max(1, k0); k <= k1 && k < n; k++) {
      cx = ox + pts[k * 3] * sc; cy = oy + pts[k * 3 + 1] * sc;
      ctx.beginPath();
      if (k === 1) {
        ax = ox + pts[0] * sc; ay = oy + pts[1] * sc;
        ctx.moveTo(ax, ay);
        ctx.lineTo((ax + cx) / 2, (ay + cy) / 2);
        ctx.lineWidth = wOf(base, (pts[2] + pts[5]) / 2, sc);
      } else {
        ax = ox + pts[(k - 2) * 3] * sc; ay = oy + pts[(k - 2) * 3 + 1] * sc;
        bx = ox + pts[(k - 1) * 3] * sc; by = oy + pts[(k - 1) * 3 + 1] * sc;
        ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
        ctx.quadraticCurveTo(bx, by, (bx + cx) / 2, (by + cy) / 2);
        ctx.lineWidth = wOf(base, pts[(k - 1) * 3 + 2], sc);
      }
      ctx.stroke();
    }
    if (fin) {
      ax = ox + pts[(n - 2) * 3] * sc; ay = oy + pts[(n - 2) * 3 + 1] * sc;
      bx = ox + pts[(n - 1) * 3] * sc; by = oy + pts[(n - 1) * 3 + 1] * sc;
      ctx.beginPath();
      ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
      ctx.lineTo(bx, by);
      ctx.lineWidth = wOf(base, pts[(n - 1) * 3 + 2], sc);
      ctx.stroke();
    }
  };
  D.paintFull = function (ctx, pts, ox, oy, sc, base) {
    D.paint(ctx, pts, ox, oy, sc, 1, pts.length / 3 - 1, true, base);
  };

  // Draw one glyph centred in a box (cx,cy centre; size = em box in px).
  D.glyph = function (ctx, ch, cx, cy, size, o) {
    ctx.save();
    ctx.font = Math.round(size) + 'px ' + D.fam(o.script);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(ch), y = cy;
    if (m && m.actualBoundingBoxAscent !== undefined) y = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    else y = cy + size * 0.35;
    if (o.style === 'outline' || o.style === 'dotted') {
      ctx.strokeStyle = o.color; ctx.lineWidth = Math.max(1, size / 60);
      if (o.style === 'dotted') ctx.setLineDash([Math.max(2, size / 40), Math.max(3, size / 28)]);
      ctx.strokeText(ch, cx, y);
    } else {
      ctx.fillStyle = o.color;
      ctx.fillText(ch, cx, y);
    }
    ctx.restore();
  };

  // Draw the cell background: grid, template/reference, punctuation.
  // o: {grid, mode, script, tplStyle, tplColor, punct (bool), tpl (bool: show template in this cell)}
  D.cell = function (ctx, x, y, size, cell, o) {
    ctx.save();
    if (o.grid !== 'none') {
      ctx.setLineDash([]);
      ctx.strokeStyle = D.GRID_OUT; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);
      ctx.strokeStyle = D.GRID_GUIDE; ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + 2); ctx.lineTo(x + size / 2, y + size - 2);
      ctx.moveTo(x + 2, y + size / 2); ctx.lineTo(x + size - 2, y + size / 2);
      if (o.grid === 'mi') {
        ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + size - 2, y + size - 2);
        ctx.moveTo(x + size - 2, y + 2); ctx.lineTo(x + 2, y + size - 2);
      }
      ctx.stroke();
    }
    ctx.restore();
    if (o.mode === 'copy') {
      D.glyph(ctx, cell.ch, x + size * 0.17, y + size * 0.17, size * 0.26, { script: o.script, style: 'fill', color: '#333' });
    } else if (o.tpl) {
      D.glyph(ctx, cell.ch, x + size / 2, y + size / 2, size * 0.8, { script: o.script, style: o.tplStyle, color: o.tplColor });
    }
    if (o.punct && cell.punct) {
      D.glyph(ctx, cell.punct, x + size * 0.84, y + size * 0.86, size * 0.2, { script: o.script, style: 'fill', color: '#555' });
    }
  };

  // Make sure the web fonts are loaded before painting glyphs.
  var fontsOk = {};
  D.fontsReady = function (script, text) {
    var key = script;
    if (fontsOk[key]) return Promise.resolve();
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var spec = '40px ' + (script === 'simp' ? '"MoKai SC"' : '"MoKai TC"');
    var p = document.fonts.load(spec, text || '墨').then(function () { fontsOk[key] = true; }, function () {});
    return Promise.race([p, new Promise(function (r) { setTimeout(r, 3000); })]);
  };
  D.fontsLoaded = function (script) { return !!fontsOk[script] || !(document.fonts && document.fonts.load); };
})();
