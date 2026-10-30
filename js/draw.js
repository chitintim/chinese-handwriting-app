(function () {
  'use strict';
  var MX = window.MX;
  var D = MX.Draw = {};

  D.INK_W = { thin: 13, mid: 22, thick: 36 };   // base width in 1/1000 cell units (at p = 0.5)
  D.TONE = { light: '#c4c4c4', mid: '#a8a8a8', dark: '#858585' };
  D.GRID_OUT = '#cfcfcf';      // cell box and guide lines are always lighter than the lightest template tone
  D.GRID_GUIDE = '#e3e3e3';
  // template glyph size as a fraction of the cell (default 中 = the old 0.8 reduced by ~13%)
  D.TPL_SIZE = { s: 0.60, m: 0.70, l: 0.80, xl: 0.90 };
  D.tplScale = function (key) { return D.TPL_SIZE[key] || D.TPL_SIZE.m; };
  // normalised grid options of a copy config (also understands the legacy grid: fang | none)
  D.gridOf = function (cfg) {
    var legacyOff = cfg.grid === 'none', noGuide = cfg.grid === 'fang';
    return { box: cfg.box !== false && !legacyOff, guide: cfg.guide !== false && !legacyOff && !noGuide, style: cfg.grid === 'tian' ? 'tian' : 'mi' };
  };

  // Template fonts (subsets built from open-licensed fonts, see library/fonts/README.txt). full[script] = covers every library glyph
  // (checked against library/fonts/fonts.json by the tests); otherwise missing glyphs fall back per character along the stack.
  D.FONTS = {
    ukai: { label: '楷書', fam: { trad: 'MoUKai TC', simp: 'MoUKai SC' }, full: { trad: true, simp: true } },
    tw: { label: '正楷', fam: { trad: 'MoTWKai', simp: 'MoTWKai' }, full: { trad: true, simp: true } },
    msz: { label: '行楷', fam: { trad: 'MoMaShan', simp: 'MoMaShan' }, full: { trad: false, simp: false } },
    wk: { label: '硬筆', fam: { trad: 'MoKai TC', simp: 'MoKai SC' }, full: { trad: true, simp: true } }
  };
  D.FONT_ORDER = ['ukai', 'tw', 'msz', 'wk'];     // most calligraphic first, LXGW WenKai last
  D.DEF_FONT = 'ukai';
  function famList(script, key) {
    var sc = script === 'simp' ? 'simp' : 'trad', out = [];
    if (D.FONTS[key]) out.push(D.FONTS[key].fam[sc]);
    D.FONT_ORDER.forEach(function (k) { var f = D.FONTS[k].fam[sc]; if (out.indexOf(f) < 0) out.push(f); });
    return out;
  }
  // CSS font stack. No key = the UI font (LXGW WenKai first); with a key = that template font first, then the others, LXGW last.
  D.fam = function (script, key) {
    var sys = script === 'simp'
      ? ',"LXGW WenKai","Kaiti SC","STKaiti","KaiTi","Noto Serif CJK SC",serif'
      : ',"LXGW WenKai TC","Kaiti TC","BiauKai","DFKai-SB","Noto Serif CJK TC",serif';
    var list = key ? famList(script, key) : famList(script, 'wk');
    return list.map(function (f) { return '"' + f + '"'; }).join(',') + sys;
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
    ctx.font = Math.round(size) + 'px ' + D.fam(o.script, o.font);
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

  // Draw the cell background: box, guide lines, template/reference, punctuation.
  // o: {box, guide, gstyle ('mi'|'tian'), mode, script, tplStyle, tplColor, tplScale, punct (bool), tpl (bool: show template in this cell)}
  D.cell = function (ctx, x, y, size, cell, o) {
    ctx.save();
    if (o.box) {
      ctx.setLineDash([]);
      ctx.strokeStyle = D.GRID_OUT; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);
    }
    if (o.guide) {
      ctx.strokeStyle = D.GRID_GUIDE; ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + 2); ctx.lineTo(x + size / 2, y + size - 2);
      ctx.moveTo(x + 2, y + size / 2); ctx.lineTo(x + size - 2, y + size / 2);
      if (o.gstyle === 'mi') {
        ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + size - 2, y + size - 2);
        ctx.moveTo(x + size - 2, y + 2); ctx.lineTo(x + 2, y + size - 2);
      }
      ctx.stroke();
    }
    ctx.restore();
    var sc = o.tplScale || D.TPL_SIZE.m;
    if (o.mode === 'copy') {
      D.glyph(ctx, cell.ch, x + size * 0.17, y + size * 0.17, size * 0.26 * sc / 0.8, { script: o.script, font: o.font, style: 'fill', color: '#333' });
    } else if (o.tpl) {
      D.glyph(ctx, cell.ch, x + size / 2, y + size / 2, size * sc, { script: o.script, font: o.font, style: o.tplStyle, color: o.tplColor });
    }
    if (o.punct && cell.punct) {
      D.glyph(ctx, cell.punct, x + size * 0.84, y + size * 0.86, size * 0.2, { script: o.script, style: 'fill', color: '#555' });
    }
  };

  // Make sure the web fonts are loaded before painting glyphs. key = template font; an incomplete font also loads the fallbacks.
  var fontsOk = {};
  D.fontsReady = function (script, text, key) {
    var sc = script === 'simp' ? 'simp' : 'trad', ck = sc + ':' + (key || '');
    if (fontsOk[ck]) return Promise.resolve();
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var fams = D.FONTS[key] && D.FONTS[key].full[sc] ? [D.FONTS[key].fam[sc]] : famList(sc, key);
    var ps = fams.map(function (f) { return document.fonts.load('40px "' + f + '"', text || '墨').catch(function () { return null; }); });
    var p = Promise.all(ps).then(function () { fontsOk[ck] = true; }, function () {});
    return Promise.race([p, new Promise(function (r) { setTimeout(r, 3000); })]);
  };
  D.fontsLoaded = function (script, key) {
    return !!fontsOk[(script === 'simp' ? 'simp' : 'trad') + ':' + (key || '')] || !(document.fonts && document.fonts.load);
  };
})();
