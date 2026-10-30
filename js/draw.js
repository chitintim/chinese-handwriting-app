(function () {
  'use strict';
  var MX = window.MX;
  var D = MX.Draw = {};

  D.INK_W = { thin: 13, mid: 22, thick: 36 };   // base width in 1/1000 cell units (at p = 0.5)
  // Template greys. E-ink fast refresh modes (A2 / 極速 / 快刷) threshold to 1 bit at roughly #808080: only the full-quality
  // refresh shows these greys (中 #a8 and 淺 #c4 turn white in a fast mode, 深 #85 is borderline). 描紅樣式 網點 / 空心 and
  // the black dotted guide lines below are the fast-mode-safe alternatives.
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
  D.paint = function (ctx, pts, ox, oy, sc, k0, k1, fin, base, color) {
    var n = pts.length / 3;
    if (!n) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color || '#000'; ctx.fillStyle = color || '#000';
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
  D.paintFull = function (ctx, pts, ox, oy, sc, base, color) {
    D.paint(ctx, pts, ox, oy, sc, 1, pts.length / 3 - 1, true, base, color);
  };

  // Ordered-dither (Bayer 4x4) halftone: the glyph becomes pure black device pixels (alpha 0 or 255), so a 1-bit e-ink mode keeps it.
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var HT_LEVEL = 4;                          // 4/16 = 25% black
  var scratch = null;
  function halftone(ctx, ch, cx, cy, size, o) {
    var dpr = o.dpr || 1, n = Math.ceil(size * 1.3 * dpr) + 2;
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width !== n || scratch.height !== n) { scratch.width = n; scratch.height = n; }
    var c2 = scratch.getContext('2d');
    c2.clearRect(0, 0, n, n);
    c2.font = Math.round(size * dpr) + 'px ' + D.fam(o.script, o.font);
    c2.textAlign = 'center'; c2.textBaseline = 'alphabetic'; c2.fillStyle = '#000';
    var m = c2.measureText(ch), y = n / 2;
    if (m && m.actualBoundingBoxAscent !== undefined) y += (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    else y += size * dpr * 0.35;
    c2.fillText(ch, n / 2, y);
    var img = c2.getImageData(0, 0, n, n), d = img.data, i, px, py;
    for (py = 0; py < n; py++) {
      for (px = 0; px < n; px++) {
        i = (py * n + px) * 4;
        if (d[i + 3] >= 110 && BAYER[(py & 3) * 4 + (px & 3)] < HT_LEVEL) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255; }
        else d[i + 3] = 0;
      }
    }
    c2.putImageData(img, 0, 0);
    var dx = Math.round(cx * dpr - n / 2), dy = Math.round(cy * dpr - n / 2);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0, n, n, dx / dpr, dy / dpr, n / dpr, n / dpr);   // 1:1 device pixels, no resampling
    ctx.restore();
  }

  // Draw one glyph centred in a box (cx,cy centre; size = em box in px).
  // style: fill (grey tone) | dots (black halftone) | outline (black hairline outline)
  D.glyph = function (ctx, ch, cx, cy, size, o) {
    if (o.style === 'dots') { halftone(ctx, ch, cx, cy, size, o); return; }
    ctx.save();
    ctx.font = Math.round(size) + 'px ' + D.fam(o.script, o.font);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(ch), y = cy;
    if (m && m.actualBoundingBoxAscent !== undefined) y = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    else y = cy + size * 0.35;
    if (o.style === 'outline') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, size / 60);
      ctx.strokeText(ch, cx, y);
    } else {
      ctx.fillStyle = o.color;
      ctx.fillText(ch, cx, y);
    }
    ctx.restore();
  };

  // Grid periods (css px) of the dotted guide lines: 疏 / 中 / 密
  D.DENSITY = { sparse: 8, mid: 6, dense: 4 };
  // Box + guide lines of one cell. look: 'dots' (default; pure black 1-device-pixel dots, e-ink fast-mode safe) | 'light' (old light grey
  // solid box + dashed guides) | 'black' (solid black). Everything in 'dots' / 'black' is filled as whole device pixels (no anti-aliasing grey).
  function drawGrid(ctx, x, y, size, o) {
    var look = o.look || 'dots', dpr = o.dpr || 1;
    if (look === 'light') {
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
      return;
    }
    var X = Math.round(x * dpr), Y = Math.round(y * dpr), S = Math.round(size * dpr), t = Math.max(1, Math.round(dpr));
    var step = look === 'black' ? 1 : Math.max(2 * t, Math.round((D.DENSITY[o.density] || D.DENSITY.mid) * dpr));
    var inset = Math.round(2 * dpr), c = Math.floor((S - t) / 2), k;
    ctx.save();
    ctx.fillStyle = '#000';
    function R(dx, dy, dw, dh) { ctx.fillRect((X + dx) / dpr, (Y + dy) / dpr, dw / dpr, dh / dpr); }
    if (o.box) {
      R(0, 0, S, t); R(0, S - t, S, t); R(0, 0, t, S); R(S - t, 0, t, S);
    }
    if (o.guide) {
      if (look === 'black') {
        R(c, inset, t, S - 2 * inset); R(inset, c, S - 2 * inset, t);
      } else {
        for (k = inset; k <= S - inset - t; k += step) { R(c, k, t, t); R(k, c, t, t); }
      }
      if (o.gstyle === 'mi') {
        var dstep = look === 'black' ? 1 : Math.max(t, Math.round(step * 0.72));
        for (k = inset; k <= S - inset - t; k += dstep) { R(k, k, t, t); R(S - t - k, k, t, t); }
      }
    }
    ctx.restore();
  }

  // Draw the cell background: box, guide lines, template/reference, punctuation.
  // o: {box, guide, gstyle ('mi'|'tian'), look, density, dpr, mode, script, font, tplStyle, tplColor, tplScale, punct (bool), tpl (bool: show template in this cell)}
  D.cell = function (ctx, x, y, size, cell, o) {
    drawGrid(ctx, x, y, size, o);
    var sc = o.tplScale || D.TPL_SIZE.m;
    if (o.mode === 'copy') {
      D.glyph(ctx, cell.ch, x + size * 0.17, y + size * 0.17, size * 0.26 * sc / 0.8, { script: o.script, font: o.font, style: 'fill', color: '#333', dpr: o.dpr });
    } else if (o.tpl) {
      D.glyph(ctx, cell.ch, x + size / 2, y + size / 2, size * sc, { script: o.script, font: o.font, style: o.tplStyle, color: o.tplColor, dpr: o.dpr });
    }
    if (o.punct && cell.punct) {
      D.glyph(ctx, cell.punct, x + size * 0.84, y + size * 0.86, size * 0.2, { script: o.script, style: 'fill', color: '#555', dpr: o.dpr });
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
