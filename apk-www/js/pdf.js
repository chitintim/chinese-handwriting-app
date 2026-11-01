(function () {
  'use strict';
  var MX = window.MX;

  // ---------------------------------------------------------------------------------------------------------------------------------
  // Print-ready PDF writer (docs/EXPORT.md "Print PDF"). No library: a page is ONE image XObject covering the whole sheet of paper, stored LOSSLESS with FlateDecode and
  // the PNG predictor (the zlib stream pngstream.js writes with {zlib: true}: filtered rows, each led by its filter byte -- /Predictor 15):
  //   DeviceGray 8 bit when everything on the page is black / grey (ink, grey rules and template tones), DeviceRGB 8 bit when the page has colour (vermilion rules, the seal).
  // The pages are Blob parts, so a 600 dpi A3 page (70 MP) is never in memory as pixels or as a joined byte array: only its compressed stream.
  //   MX.Pdf.build([{w, h (px), pw, ph (pt), color: bool, z: Blob}], {title}) -> Blob (application/pdf)
  // The catalog asks viewers to print at 100% (/PrintScaling /None) so the paper size and margins come out as laid out.
  // ---------------------------------------------------------------------------------------------------------------------------------
  var PT_PER_MM = 72 / 25.4;
  // paper sizes in mm (portrait): A4 / A3 (ISO 216), Letter (8.5 x 11 in)
  var PAPER = { A4: { mm: [210, 297], pt: [595.2756, 841.8898], label: 'A4' }, A3: { mm: [297, 420], pt: [841.8898, 1190.5512], label: 'A3' }, Letter: { mm: [215.9, 279.4], pt: [612, 792], label: 'Letter' } };

  function ascii(s) {
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  }
  function hex16(s) {      // a PDF text string as UTF-16BE hex with BOM
    var out = 'FEFF';
    for (var i = 0; i < s.length; i++) out += ('0000' + s.charCodeAt(i).toString(16).toUpperCase()).slice(-4);
    return '<' + out + '>';
  }
  function num(x) { return String(+x.toFixed(2)); }

  function build(pages, info) {
    info = info || {};
    var parts = [], len = 0, offs = [], n = pages.length, i, kids = [];
    function add(x) {
      if (typeof x === 'string') x = ascii(x);
      parts.push(x); len += x.size !== undefined ? x.size : x.length;
    }
    function obj(id, body) { offs[id] = len; add(id + ' 0 obj\n'); add(body); add('\nendobj\n'); }
    add('%PDF-1.4\n%âãÏÓ\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>');
    for (i = 0; i < n; i++) kids.push((4 + 3 * i) + ' 0 R');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [ ' + kids.join(' ') + ' ] >>');
    obj(3, '<< /Producer (Moxie) /Creator (Moxie)' + (info.title ? ' /Title ' + hex16(info.title) : '') + ' >>');
    pages.forEach(function (pg, k) {
      var pid = 4 + 3 * k, cid = pid + 1, iid = pid + 2, pw = num(pg.pw), ph = num(pg.ph), cols = pg.color ? 3 : 1;
      obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 ' + iid + ' 0 R >> /ProcSet [/PDF /' + (pg.color ? 'ImageC' : 'ImageB') + '] >> /Contents ' + cid + ' 0 R >>');
      var content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
      obj(cid, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      offs[iid] = len;
      add(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + pg.w + ' /Height ' + pg.h + ' /ColorSpace /' + (pg.color ? 'DeviceRGB' : 'DeviceGray') + ' /BitsPerComponent 8 /Filter /FlateDecode' +
        ' /DecodeParms << /Predictor 15 /Colors ' + cols + ' /BitsPerComponent 8 /Columns ' + pg.w + ' >> /Length ' + pg.z.size + ' >>\nstream\n');
      add(pg.z);
      add('\nendstream\nendobj\n');
    });
    var xref = len, total = 4 + 3 * n;
    add('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (i = 1; i < total; i++) add(('0000000000' + offs[i]).slice(-10) + ' 00000 n \n');
    add('trailer\n<< /Size ' + total + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }

  MX.Pdf = { build: build, PAPER: PAPER, PT_PER_MM: PT_PER_MM };
})();
