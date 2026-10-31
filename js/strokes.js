(function () {
  'use strict';
  // Stroke-order data and drawing (docs/SPEC.md "Stroke order"). Data: library/strokes/manifest.json + s-NN.json chunks of about 200 characters each, built from
  // hanzi-writer-data 2.0.1 (Make Me a Hanzi, Arphic Public License): per character { strokes: [outline path ...], medians: [[[x, y] ...] ...] } in a 1024 box with y up
  // (display y = 900 - y). In the chunk files every path / median is ONE string (about half the size of the SVG text):
  //   path   "<commands>.<coordinates>"  commands = letters of M L Q C Z; coordinates = the points of the commands (M, L 1; Q 2; C 3; Z 0) as x/y deltas to the previous point
  //          (control points included), zigzag + base-64 variable-length digits (5 data bits + a continuation bit per digit, alphabet A-Za-z0-9-_)
  //   median "<coordinates>" the same for the points of the median (the first point relative to 0, 0)
  // A chunk is fetched the first time one of its characters is asked for (web: cached by the service worker, APK: bundled).
  var MX = window.MX, Draw = MX.Draw;
  var DIR = 'library/strokes/';
  var BOX = 1024, BASE = 900;            // data box and baseline of the y flip
  var PAD = 0.07;                        // margin around the character in the cell (fraction of the cell)
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var HT_LEVEL = 4;                      // 25% black dots: the dither-safe "light" template (pure black device pixels)
  var BRUSH_W = 190;                     // width of the reveal brush along a median (data units; wider than any stroke)
  var BACK = 70;                         // the reveal starts this far behind the first median point (medians start inside the outline)

  var manifest = null, manifestP = null, where = {}, chunkData = {}, chunkP = {}, parsed = {};
  var stats = { manifestFetches: 0, chunkFetches: 0, chunks: [] };
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', LUT = {}, PATH_ARGS = { M: 1, L: 1, Q: 2, C: 3, Z: 0 };
  for (var bi = 0; bi < 64; bi++) LUT[B64.charAt(bi)] = bi;
  function unvlq(s) {
    var out = [], v = 0, sh = 0, i, d;
    for (i = 0; i < s.length; i++) {
      d = LUT[s.charAt(i)];
      v += (d & 31) * Math.pow(2, sh); sh += 5;
      if (!(d & 32)) { out.push(v % 2 ? -((v + 1) / 2) : v / 2); v = 0; sh = 0; }
    }
    return out;
  }
  function pathDecode(code) {
    var dot = code.indexOf('.'), cmds = code.slice(0, dot), nums = unvlq(code.slice(dot + 1)), k = 0, px = 0, py = 0, parts = [], i, j, n;
    for (i = 0; i < cmds.length; i++) {
      parts.push(cmds.charAt(i));
      for (j = 0, n = PATH_ARGS[cmds.charAt(i)]; j < n; j++) { px += nums[k]; py += nums[k + 1]; k += 2; parts.push(px, py); }
    }
    return parts.join(' ');
  }
  function medianDecode(code) {
    var nums = unvlq(code), px = 0, py = 0, out = [], k;
    for (k = 0; k + 1 < nums.length; k += 2) { px += nums[k]; py += nums[k + 1]; out.push([px, py]); }
    return out;
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }

  var St = MX.Strokes = {
    stats: stats,
    STEPS: 4,                            // reveal steps per stroke in the animation
    // the manifest ({chunks: [{file, chars, bytes}], missing}); null when the app ships no stroke data. Retried on the next call after a failure.
    loadManifest: function () {
      if (manifest) return Promise.resolve(manifest);
      if (manifestP) return manifestP;
      stats.manifestFetches++;
      manifestP = fetchJson(DIR + 'manifest.json').then(function (m) {
        manifest = m; where = {};
        (m.chunks || []).forEach(function (c, i) { Array.from(c.chars || '').forEach(function (ch) { where[ch] = i; }); });
        return m;
      }).catch(function (e) { manifestP = null; throw e; });
      return manifestP;
    },
    // after loadManifest: true / false whether the character has data (undefined before the manifest is known)
    has: function (ch) { return manifest ? where[ch] !== undefined : undefined; },
    chunkOf: function (ch) { return manifest && where[ch] !== undefined ? manifest.chunks[where[ch]].file : null; },
    loadChunk: function (i) {
      var f = manifest.chunks[i].file;
      if (chunkData[f]) return Promise.resolve(chunkData[f]);
      if (chunkP[f]) return chunkP[f];
      stats.chunkFetches++; stats.chunks.push(f);
      chunkP[f] = fetchJson(DIR + f).then(function (d) { chunkData[f] = d; return d; }).catch(function (e) { delete chunkP[f]; throw e; });
      return chunkP[f];
    },
    // The parsed record of one character: {ch, n, d: [path strings], paths: [Path2D], medians, lens}; null when the dataset has no such character.
    // Rejects when the data cannot be loaded (no network and not cached).
    get: function (ch) {
      if (parsed[ch]) return Promise.resolve(parsed[ch]);
      return St.loadManifest().then(function () {
        if (where[ch] === undefined) return null;
        return St.loadChunk(where[ch]).then(function (d) {
          var r = d.chars && d.chars[ch];
          if (!r) return null;
          parsed[ch] = St.parse(ch, r);
          return parsed[ch];
        });
      });
    },
    parse: function (ch, raw) {
      var r = { strokes: raw.strokes.map(pathDecode), medians: raw.medians.map(medianDecode) };
      var lens = r.medians.map(function (m) {
        var out = [0], i;
        for (i = 1; i < m.length; i++) out.push(out[i - 1] + Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]));
        return out;
      });
      return { ch: ch, n: r.strokes.length, d: r.strokes, paths: r.strokes.map(function (d) { return new Path2D(d); }), medians: r.medians, lens: lens };
    },
    decodePath: pathDecode, decodeMedian: medianDecode,
    reset: function () { manifest = null; manifestP = null; where = {}; chunkData = {}; chunkP = {}; parsed = {}; stats.manifestFetches = 0; stats.chunkFetches = 0; stats.chunks = []; },

    // ---- geometry (display coordinates of a cell of `size` px)
    scaleOf: function (size) { var k = size * (1 - 2 * PAD) / BOX; return { k: k, ox: (size - BOX * k) / 2, oy: (size - BOX * k) / 2 }; },
    pt: function (size, p) { var L = St.scaleOf(size); return [L.ox + p[0] * L.k, L.oy + (BASE - p[1]) * L.k]; },
    // the point at fraction f (0..1) of the median's length
    along: function (rec, i, f) {
      var m = rec.medians[i], ln = rec.lens[i], tot = ln[ln.length - 1], t = tot * f, j;
      if (m.length === 1 || tot === 0) return { p: m[0], seg: 0 };
      for (j = 1; j < m.length && ln[j] < t; j++) { /* find the segment holding t */ }
      if (j >= m.length) return { p: m[m.length - 1], seg: m.length - 2, end: true };
      var u = (t - ln[j - 1]) / ((ln[j] - ln[j - 1]) || 1);
      return { p: [m[j - 1][0] + (m[j][0] - m[j - 1][0]) * u, m[j - 1][1] + (m[j][1] - m[j - 1][1]) * u], seg: j - 1 };
    },
    // unit direction (data coordinates, y up) of the first part of the median
    startDir: function (rec, i) {
      var m = rec.medians[i], j, dx = 0, dy = 0;
      for (j = 1; j < m.length; j++) { dx = m[j][0] - m[0][0]; dy = m[j][1] - m[0][1]; if (Math.hypot(dx, dy) > 25) break; }
      var l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    },

    // ---- the light template: all outlines as an ordered-dither halftone (pure black device pixels, 25%), cached per record + size
    template: function (rec, size, dpr) {
      var key = size + '@' + dpr;
      if (rec._tpl && rec._tpl.key === key) return rec._tpl.cv;
      var n = Math.round(size * dpr), cv = document.createElement('canvas');
      cv.width = n; cv.height = n;
      var c = cv.getContext('2d', { willReadFrequently: true }), L = St.scaleOf(size), x, y, i;
      c.setTransform(dpr * L.k, 0, 0, -dpr * L.k, dpr * L.ox, dpr * (L.oy + BASE * L.k));
      c.fillStyle = '#000';
      rec.paths.forEach(function (p) { c.fill(p); });
      c.setTransform(1, 0, 0, 1, 0, 0);
      var img = c.getImageData(0, 0, n, n), d = img.data;
      for (y = 0; y < n; y++) {
        for (x = 0; x < n; x++) {
          i = (y * n + x) * 4;
          if (d[i + 3] >= 110 && BAYER[(y & 3) * 4 + (x & 3)] < HT_LEVEL) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255; } else d[i + 3] = 0;
        }
      }
      c.putImageData(img, 0, 0);
      rec._tpl = { key: key, cv: cv };
      return cv;
    },

    // ---- one frame. o: {dpr, done (strokes 0..done-1 black), part: {i, f} (stroke i revealed up to fraction f of its median), marks (numbers 1..marks + arrows; default = all that are drawn),
    // grid (default true), script}. The canvas must be size*dpr square; it is repainted completely (opaque white).
    draw: function (ctx, rec, size, o) {
      o = o || {};
      var dpr = o.dpr || 1, L = St.scaleOf(size), done = Math.min(o.done || 0, rec.n), i;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      if (o.grid !== false) {
        Draw.cell(ctx, 0, 0, size, { ch: '', punct: '' }, { box: true, guide: true, gstyle: 'mi', look: 'dots', density: 'mid', dpr: dpr, mode: 'trace', script: o.script, tpl: false });
      }
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(St.template(rec, size, dpr), 0, 0, size, size);       // 1:1 device pixels
      ctx.restore();
      ctx.save();
      ctx.setTransform(dpr * L.k, 0, 0, -dpr * L.k, dpr * L.ox, dpr * (L.oy + BASE * L.k));
      ctx.fillStyle = '#000';
      for (i = 0; i < done; i++) ctx.fill(rec.paths[i]);
      if (o.part && o.part.i < rec.n && o.part.f > 0) St.reveal(ctx, rec, o.part.i, o.part.f);
      ctx.restore();
      if (o.marks !== false) {
        var upto = o.marks === undefined || o.marks === true ? done + (o.part ? 1 : 0) : o.marks;
        for (i = 0; i < Math.min(upto, rec.n); i++) St.mark(ctx, rec, i, size, o);
      }
    },
    // black reveal of stroke i up to fraction f of its median, clipped to the outline (the ctx already has the data transform). f >= 1 fills the whole outline.
    reveal: function (ctx, rec, i, f) {
      ctx.save();
      if (f >= 1) { ctx.fillStyle = '#000'; ctx.fill(rec.paths[i]); ctx.restore(); return; }
      ctx.clip(rec.paths[i]);
      var m = rec.medians[i], end = St.along(rec, i, f), dir = St.startDir(rec, i), j;
      ctx.strokeStyle = '#000'; ctx.lineWidth = BRUSH_W; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(m[0][0] - dir[0] * BACK, m[0][1] - dir[1] * BACK);
      ctx.lineTo(m[0][0], m[0][1]);
      for (j = 1; j <= end.seg; j++) ctx.lineTo(m[j][0], m[j][1]);
      ctx.lineTo(end.p[0], end.p[1]);
      ctx.stroke();
      ctx.restore();
    },
    // stroke number (white disc, black rim) behind the start of the stroke + a small direction arrow (white triangle, black rim) pointing along it
    mark: function (ctx, rec, i, size, o) {
      var L = St.scaleOf(size), dpr = (o && o.dpr) || 1, p0 = rec.medians[i][0], dir = St.startDir(rec, i), s = L.k;
      var R = 36, A = 46;                                   // badge radius and arrow length (data units)
      var cx = L.ox + (p0[0] - dir[0] * (R + 8)) * s, cy = L.oy + (BASE - (p0[1] - dir[1] * (R + 8))) * s;
      // keep the badge inside the cell
      cx = MX.clamp(cx, R * s + 1, size - R * s - 1); cy = MX.clamp(cy, R * s + 1, size - R * s - 1);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1.5, 5 * s);
      ctx.beginPath(); ctx.arc(cx, cy, R * s, 0, 6.283185307); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = Math.max(8, Math.round(R * s * (i >= 9 ? 1.05 : 1.3))) + 'px ' + Draw.uiFam(o && o.script);
      ctx.fillText(String(i + 1), cx, cy + R * s * 0.06);
      // arrow: tip A ahead of the start point along the stroke direction (display coordinates: y flipped)
      var ax = L.ox + p0[0] * s, ay = L.oy + (BASE - p0[1]) * s, dx = dir[0], dy = -dir[1], nx = -dy, ny = dx;
      ctx.beginPath();
      ctx.moveTo(ax + dx * A * s, ay + dy * A * s);
      ctx.lineTo(ax - dx * 6 * s + nx * 20 * s, ay - dy * 6 * s + ny * 20 * s);
      ctx.lineTo(ax - dx * 6 * s - nx * 20 * s, ay - dy * 6 * s - ny * 20 * s);
      ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(1.5, 4 * s); ctx.lineJoin = 'miter';
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  };
})();
