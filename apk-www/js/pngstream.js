(function () {
  'use strict';
  var MX = window.MX;

  // ---------------------------------------------------------------------------------------------------------------------------------
  // Streaming PNG encoder (docs/EXPORT.md "Resolution and big exports"). A PNG is written row band by row band, so an image far bigger than any canvas
  // never exists in memory as a whole: only the band being filtered (rows x width x 3 bytes) and the COMPRESSED output (a list of Blob parts) are held.
  //   enc = MX.PngStream.encoder(width, height, {fallback: bool, channels: 3 | 1, zlib: bool})
  //   await enc.rows(rgb, n)     // n rows of 8-bit RGB (n * width * 3 bytes; channels 1: 8-bit grey, n * width bytes), top to bottom, any number of calls
  //   blob = await enc.finish()  // exactly `height` rows must have been written; image/png Blob (IHDR, IDAT chunks of ~256 KB, IEND)
  // zlib: true -> finish() gives the bare zlib stream of the filtered rows instead of a PNG file (application/octet-stream): that is exactly what a PDF image XObject with
  //   /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors c /BitsPerComponent 8 /Columns width >> holds (the print PDF, app/js/print.js).
  // Filtering: type 2 (Up) for every row (paper and vertical rules become zero runs; the first row is stored raw).
  // Deflate: CompressionStream('deflate') (Chrome 80+, Safari 16.4+) -- its output is already the zlib stream a PNG wants. Without it (or with
  // fallback:true) a small built-in deflate runs: fixed-Huffman blocks with greedy LZ77 (3-byte hash, one candidate, window = the chunk being written),
  // about 2-3x bigger than zlib on this kind of image but never larger than 1.125x the raw data (a literal costs at most 9 bits).
  // ---------------------------------------------------------------------------------------------------------------------------------
  var CRC_T = null;
  function crcTable() {
    if (CRC_T) return CRC_T;
    CRC_T = new Int32Array(256);
    for (var n = 0, c, k; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_T[n] = c;
    }
    return CRC_T;
  }
  // crc32 of u8[from..to) (standard: init 0xFFFFFFFF, final xor); returns an unsigned 32-bit value
  function crc32(u8, from, to) {
    var t = crcTable(), c = -1, i;
    from = from || 0; to = to === undefined ? u8.length : to;
    for (i = from; i < to; i++) c = t[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  function put32(b, at, v) { b[at] = (v >>> 24) & 255; b[at + 1] = (v >>> 16) & 255; b[at + 2] = (v >>> 8) & 255; b[at + 3] = v & 255; }
  // one PNG chunk: length, type, data, crc(type + data)
  function chunk(type, data) {
    var n = data ? data.length : 0, b = new Uint8Array(12 + n), i;
    put32(b, 0, n);
    for (i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
    if (n) b.set(data, 8);
    put32(b, 8 + n, crc32(b, 4, 8 + n));
    return b;
  }

  // ------------------------------------------------------------------ built-in deflate (fixed Huffman + greedy LZ77), zlib wrapper
  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var LIT_CODE = null, LIT_BITS = null, LEN_SYM = null;
  function rev(code, n) { var r = 0; for (var i = 0; i < n; i++) { r = (r << 1) | (code & 1); code >>= 1; } return r; }
  function tables() {
    if (LIT_CODE) return;
    LIT_CODE = new Uint16Array(288); LIT_BITS = new Uint8Array(288);
    for (var s = 0, code, bits; s < 288; s++) {
      if (s < 144) { code = 0x30 + s; bits = 8; } else if (s < 256) { code = 0x190 + s - 144; bits = 9; } else if (s < 280) { code = s - 256; bits = 7; } else { code = 0xC0 + s - 280; bits = 8; }
      LIT_CODE[s] = rev(code, bits); LIT_BITS[s] = bits;
    }
    LEN_SYM = new Uint8Array(259);
    for (var l = 3, k = 0; l <= 258; l++) { while (k < 28 && LEN_BASE[k + 1] <= l) k++; LEN_SYM[l] = k; }
  }
  function distSym(d) { var k = 0; while (k < 29 && DIST_BASE[k + 1] <= d) k++; return k; }

  function Lite(onData) {
    tables();
    this.onData = onData; this.bb = 0; this.bc = 0; this.a = 1; this.b = 0; this.started = false; this.head = new Int32Array(1 << 15);
  }
  // compress one chunk as a block of its own; the bit buffer carries over (blocks need not end on a byte)
  Lite.prototype.write = function (src) {
    var n = src.length, out = new Uint8Array(n + (n >> 3) + 64), op = 0, bb = this.bb, bc = this.bc, head = this.head, i, k, e, a = this.a, b = this.b;
    function put(code, nb) {
      bb |= code << bc; bc += nb;
      while (bc >= 8) { out[op++] = bb & 255; bb >>>= 8; bc -= 8; }
    }
    if (!this.started) { out[op++] = 0x78; out[op++] = 0x01; this.started = true; }
    for (k = 0; k < n;) {      // Adler-32
      e = k + 5552 < n ? k + 5552 : n;
      for (; k < e; k++) { a += src[k]; b += a; }
      a %= 65521; b %= 65521;
    }
    this.a = a; this.b = b;
    put(0, 1); put(1, 2);        // BFINAL 0, BTYPE 01 (fixed Huffman)
    head.fill(-1);
    var best, dist, cand, h, max, l, ls, ds;
    for (i = 0; i < n;) {
      best = 0; dist = 0;
      if (i + 2 < n) {
        h = ((src[i] << 10) ^ (src[i + 1] << 5) ^ src[i + 2]) & 32767;
        cand = head[h]; head[h] = i;
        if (cand >= 0 && i - cand <= 32768) {
          max = n - i < 258 ? n - i : 258; l = 0;
          while (l < max && src[cand + l] === src[i + l]) l++;
          if (l >= 3) { best = l; dist = i - cand; }
        }
      }
      if (best) {
        ls = LEN_SYM[best];
        put(LIT_CODE[257 + ls], LIT_BITS[257 + ls]);
        if (LEN_EXTRA[ls]) put(best - LEN_BASE[ls], LEN_EXTRA[ls]);
        ds = distSym(dist);
        put(rev(ds, 5), 5);
        if (DIST_EXTRA[ds]) put(dist - DIST_BASE[ds], DIST_EXTRA[ds]);
        i += best;
      } else { put(LIT_CODE[src[i]], LIT_BITS[src[i]]); i++; }
    }
    put(LIT_CODE[256], LIT_BITS[256]);
    this.bb = bb; this.bc = bc;
    this.onData(out.subarray(0, op));
    return Promise.resolve();
  };
  Lite.prototype.finish = function () {
    var out = new Uint8Array(16), op = 0, bb = this.bb, bc = this.bc, a = this.a, b = this.b;
    function put(code, nb) { bb |= code << bc; bc += nb; while (bc >= 8) { out[op++] = bb & 255; bb >>>= 8; bc -= 8; } }
    if (!this.started) { out[op++] = 0x78; out[op++] = 0x01; this.started = true; }
    put(1, 1); put(1, 2); put(0, 7);        // an empty final fixed block
    if (bc > 0) { out[op++] = bb & 255; bb = 0; bc = 0; }
    var ad = ((b << 16) | a) >>> 0;
    out[op++] = (ad >>> 24) & 255; out[op++] = (ad >>> 16) & 255; out[op++] = (ad >>> 8) & 255; out[op++] = ad & 255;
    this.onData(out.subarray(0, op));
    return Promise.resolve();
  };

  // ------------------------------------------------------------------ CompressionStream wrapper
  function Native(onData) {
    var cs = new CompressionStream('deflate'), self = this;
    this.w = cs.writable.getWriter();
    var r = cs.readable.getReader();
    this.err = null;
    this.pump = (async function () {
      for (;;) {
        var x = await r.read();
        if (x.done) break;
        onData(x.value);
      }
    })().catch(function (e) { self.err = e; });
  }
  Native.prototype.write = async function (u8) {
    await this.w.write(u8);
    if (this.err) throw this.err;
  };
  Native.prototype.finish = async function () {
    await this.w.close();
    await this.pump;
    if (this.err) throw this.err;
  };

  function hasNative() {
    try { return typeof CompressionStream === 'function' && typeof Response === 'function' && typeof WritableStream === 'function'; } catch (e) { return false; }
  }

  // ------------------------------------------------------------------ encoder
  var IDAT_SIZE = 262144;
  function encoder(width, height, o) {
    o = o || {};
    var ch = o.channels === 1 ? 1 : 3, rowBytes = width * ch, parts = [], pend = [], pendLen = 0, rowsDone = 0, prev = new Uint8Array(rowBytes), closed = false;
    var useNative = !o.fallback && hasNative();
    function flushIdat(force) {
      if (!pendLen || (!force && pendLen < IDAT_SIZE)) return;
      var d = new Uint8Array(pendLen), at = 0;
      pend.forEach(function (p) { d.set(p, at); at += p.length; });
      pend = []; pendLen = 0;
      parts.push(o.zlib ? d : chunk('IDAT', d));
    }
    function onData(u8) {
      if (!u8 || !u8.length) return;
      pend.push(u8.slice ? u8.slice() : new Uint8Array(u8)); pendLen += u8.length;      // own copy: the producer may reuse its buffer
      flushIdat(false);
    }
    var def = useNative ? new Native(onData) : new Lite(onData);
    var ihdr = new Uint8Array(13);
    put32(ihdr, 0, width); put32(ihdr, 4, height); ihdr[8] = 8; ihdr[9] = ch === 1 ? 0 : 2;
    if (!o.zlib) parts.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr));
    var SLICE = 1 << 20;
    return {
      native: useNative,
      rows: async function (rgb, n) {
        if (closed) throw new Error('png finished');
        if (rowsDone + n > height) throw new Error('too many rows');
        var f = new Uint8Array(n * (rowBytes + 1)), r, i, o1, o2, at = 0;
        for (r = 0; r < n; r++) {
          o1 = r * rowBytes; o2 = r * (rowBytes + 1);
          f[o2] = 2;
          if (r === 0) { for (i = 0; i < rowBytes; i++) f[o2 + 1 + i] = (rgb[i] - prev[i]) & 255; }
          else { for (i = 0; i < rowBytes; i++) f[o2 + 1 + i] = (rgb[o1 + i] - rgb[o1 - rowBytes + i]) & 255; }
        }
        prev.set(rgb.subarray((n - 1) * rowBytes, n * rowBytes));
        rowsDone += n;
        while (at < f.length) {
          var end = Math.min(f.length, at + SLICE);
          await def.write(f.subarray(at, end));
          at = end;
        }
      },
      finish: async function () {
        if (rowsDone !== height) throw new Error('png rows ' + rowsDone + ' of ' + height);
        closed = true;
        await def.finish();
        flushIdat(true);
        if (o.zlib) return new Blob(parts, { type: 'application/octet-stream' });
        parts.push(chunk('IEND'));
        return new Blob(parts, { type: 'image/png' });
      }
    };
  }

  MX.PngStream = { encoder: encoder, crc32: crc32, chunk: chunk, hasNative: hasNative, Lite: Lite };
})();
