(function () {
  'use strict';
  var MX = window.MX = window.MX || {};

  MX.h = function (tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    if (kids) {
      (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  };
  var h = MX.h;

  MX.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  MX.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };
  MX.debounce = function (fn, ms) {
    var t = null;
    var d = function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, a); }, ms);
    };
    d.cancel = function () { clearTimeout(t); t = null; };
    return d;
  };
  MX.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  MX.fmtDate = function (ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + MX.pad2(d.getMonth() + 1) + '-' + MX.pad2(d.getDate());
  };
  MX.fmtDuration = function (ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return '不足1分鐘';
    var hh = Math.floor(m / 60), mm = m % 60;
    return (hh ? hh + '小時' : '') + (mm ? mm + '分鐘' : '');
  };
  MX.layer = function () { return document.getElementById('layer'); };
  // UI sentences with {name} slots (no string pieces glued together: a sentence is translated as a whole later): MX.fmt('已完成 {n} 份', {n: 3})
  MX.fmt = function (s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] !== undefined ? String(v[k]) : m; }); };
  // 53-bit string hash (cyrb53) as base 36: a short fingerprint, not a security hash
  MX.hash53 = function (str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, c;
    str = String(str);
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  // 12.3 MB / 840 KB / 120 B
  MX.fmtBytes = function (n) {
    n = +n || 0;
    if (n < 1024) return Math.round(n) + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
    return (n / 1073741824).toFixed(1) + ' GB';
  };

  // Inline SVG icons (pure black, no font dependency): star / star-o (收藏), tri-l / tri-r / tri-u / tri-d (page arrows). The UI font has ☆★ but not ◀▶, and an icon is the same on every device.
  var SVGNS = 'http://www.w3.org/2000/svg';
  MX.icon = function (name, size) {
    var sz = size || 24, svg = document.createElementNS(SVGNS, 'svg'), el, pts = [], i, r, a;
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', String(sz)); svg.setAttribute('height', String(sz));
    svg.setAttribute('class', 'ico ico-' + name); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    if (name === 'star' || name === 'star-o') {
      for (i = 0; i < 10; i++) { r = i % 2 ? 4.8 : 11; a = -Math.PI / 2 + i * Math.PI / 5; pts.push((12 + r * Math.cos(a)).toFixed(2) + ',' + (12.8 + r * Math.sin(a)).toFixed(2)); }
      el = document.createElementNS(SVGNS, 'polygon');
      el.setAttribute('points', pts.join(' '));
      el.setAttribute('fill', name === 'star' ? 'currentColor' : 'none');
      el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '2'); el.setAttribute('stroke-linejoin', 'round');
    } else if (name === 'x') {
      el = document.createElementNS(SVGNS, 'path');
      el.setAttribute('d', 'M5 5 L19 19 M19 5 L5 19'); el.setAttribute('fill', 'none');
      el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '3'); el.setAttribute('stroke-linecap', 'square');
    } else if (name === 'dl') {
      el = document.createElementNS(SVGNS, 'path');
      el.setAttribute('d', 'M12 3 V15 M6 10 L12 16 L18 10 M4 21 H20'); el.setAttribute('fill', 'none');
      el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '3'); el.setAttribute('stroke-linecap', 'square');
    } else {
      var P = { 'tri-l': '17,3 5,12 17,21', 'tri-r': '7,3 19,12 7,21', 'tri-u': '3,17 12,5 21,17', 'tri-d': '3,7 12,19 21,7' };
      el = document.createElementNS(SVGNS, 'polygon');
      el.setAttribute('points', P[name] || P['tri-r']); el.setAttribute('fill', 'currentColor');
    }
    svg.appendChild(el);
    return svg;
  };
  // A button with an icon and/or label: MX.btn({label, icon, iconRight, act, cls, onclick})
  MX.btn = function (o) {
    var kids = [], attrs = { type: 'button', class: o.cls || '', 'data-act': o.act || null, onclick: o.onclick || null, disabled: o.disabled ? true : null, title: o.title || null, 'aria-label': o.aria || null };
    if (o.icon && !o.iconRight) kids.push(MX.icon(o.icon, o.iconSize));
    if (o.label) kids.push(o.label);
    if (o.icon && o.iconRight) kids.push(MX.icon(o.icon, o.iconSize));
    if (o.icon) attrs.class = (attrs.class + ' withico').trim();
    return MX.h('button', attrs, kids);
  };
  // 收藏 toggle button for a text (sectionId null) or a section. onToggle(on) after the change.
  MX.favButton = function (textId, sectionId, onToggle, withLabel) {
    var on = MX.Model.isFav(textId, sectionId), b;
    function paint() {
      on = MX.Model.isFav(textId, sectionId);
      b.setAttribute('data-on', on ? '1' : '0'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = on ? '取消收藏' : '加入收藏';
      b.innerHTML = '';
      b.appendChild(MX.icon(on ? 'star' : 'star-o', 28));
      if (withLabel) b.appendChild(document.createTextNode(on ? '已收藏' : '收藏'));
    }
    b = MX.h('button', { type: 'button', class: 'fav' + (withLabel ? ' withico' : ''), 'data-act': 'fav', onclick: function () {
      var v = MX.Model.toggleFav(textId, sectionId); paint(); if (onToggle) onToggle(v);
    } });
    paint();
    return b;
  };

  var toastEl = null, toastTimer = null, toastLater = null;
  // a toast for the NEXT screen (a route change clears the layer, so a message about what happened just before it is shown after the route is drawn): main.js calls MX.toastShowPending()
  MX.toastNext = function (msg, ms) { toastLater = [msg, ms]; };
  MX.toastShowPending = function () { var t = toastLater; toastLater = null; if (t) MX.toast(t[0], t[1]); };
  MX.toast = function (msg, ms) {
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    clearTimeout(toastTimer);
    toastEl = h('div', { class: 'toast', text: msg, role: 'status' });
    MX.layer().appendChild(toastEl);
    toastTimer = setTimeout(function () {
      if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      toastEl = null;
    }, ms || 2600);
  };

  // modal({title, body: Node|Node[], buttons:[{label, primary, keep, onClick}]}) -> {close, el}
  var modalStack = [];
  MX.modal = function (o) {
    var bg = h('div', { class: 'modal-bg' });
    var box = h('div', { class: 'modal', role: 'dialog' });
    var api = {
      el: box,
      close: function () {
        var at = modalStack.indexOf(api);
        if (at >= 0) modalStack.splice(at, 1);
        if (bg.parentNode) bg.parentNode.removeChild(bg);
        if (o.onClose) o.onClose();
      }
    };
    modalStack.push(api);
    api.bg = bg;
    if (o.title) box.appendChild(h('h2', { text: o.title }));
    if (o.body) {
      (Array.isArray(o.body) ? o.body : [o.body]).forEach(function (n) {
        box.appendChild(typeof n === 'string' ? h('p', { text: n }) : n);
      });
    }
    if (o.buttons && o.buttons.length) {
      var row = h('div', { class: 'btnrow' });
      o.buttons.forEach(function (b) {
        row.appendChild(h('button', {
          class: (b.primary ? 'on ' : '') + (b.cls || ''), text: b.label,
          'data-act': b.act || null,
          onclick: function () {
            if (b.onClick) b.onClick(api);
            if (!b.keep) api.close();
          }
        }));
      });
      box.appendChild(row);
    }
    bg.appendChild(box);
    MX.layer().appendChild(bg);
    return api;
  };
  // A full-screen overlay (the export screen, the edge test) that takes part in the modal stack, so Android Back closes it first.
  MX.overlay = function (el, onClose) {
    var api = {
      el: el, bg: el,
      close: function () {
        var at = modalStack.indexOf(api);
        if (at >= 0) modalStack.splice(at, 1);
        if (el.parentNode) el.parentNode.removeChild(el);
        if (onClose) onClose();
      }
    };
    modalStack.push(api);
    MX.layer().appendChild(el);
    return api;
  };
  // Close the top-most open modal (Android Back button). Returns true if one was closed.
  MX.closeTopModal = function () {
    while (modalStack.length) {
      var m = modalStack.pop();
      if (m.bg && m.bg.parentNode) { m.close(); return true; }
    }
    return false;
  };
  MX.confirm = function (msg, okLabel, title) {
    return new Promise(function (resolve) {
      var done = false;
      function fin(v) { if (!done) { done = true; resolve(v); } }
      MX.modal({
        title: title || '確認', body: msg, onClose: function () { fin(false); },
        buttons: [
          { label: '取消', act: 'cancel', onClick: function () { fin(false); } },
          { label: okLabel || '確定', act: 'ok', primary: true, onClick: function () { fin(true); } }
        ]
      });
    });
  };

  var BRIDGE_CHUNK = 1572864;       // raw bytes per bridge call: a multiple of 3, so every chunk's base64 stands alone
  MX.BRIDGE_CHUNK = BRIDGE_CHUNK;
  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function dataUrlToBlob(u) {
    var i = u.indexOf(','), meta = u.slice(5, i), isB64 = /;base64/.test(meta);
    var mime = meta.split(';')[0] || 'application/octet-stream';
    var raw = isB64 ? atob(u.slice(i + 1)) : decodeURIComponent(u.slice(i + 1));
    var arr = new Uint8Array(raw.length);
    for (var k = 0; k < raw.length; k++) arr[k] = raw.charCodeAt(k);
    return new Blob([arr], { type: mime });
  }
  MX.dataUrlToBlob = dataUrlToBlob;

  // A phone or tablet (share sheets exist there; on a desktop browser an anchor download is the right thing)
  MX.isMobileBrowser = function () {
    var ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || !!(MX.Device && MX.Device.env().ios);
  };
  // Save a file. Call it straight from a tap (user activation expires a few seconds after it: never after long async work).
  //   1. native bridge (APK): MoBridge.saveFile
  //   2. a mobile browser with navigator.canShare({files}): the share sheet (Save to Files / Photos); a cancelled share is not an error
  //   3. an anchor download with a blob URL (kept alive for a minute: some browsers read it late)
  // src = Blob | data: URL string.
  MX.saveFile = async function (filename, src, mime) {
    var blob = typeof src === 'string' ? dataUrlToBlob(src) : src;
    mime = mime || blob.type || 'application/octet-stream';
    if (window.MoBridge && typeof window.MoBridge.saveFile === 'function') {
      var B = window.MoBridge;
      // big files (the export can be 100 MB+) go over in pieces: one base64 string of the whole file would need 2-3 copies in the WebView and the JavascriptInterface
      if (blob.size > BRIDGE_CHUNK && typeof B.beginFile === 'function' && typeof B.writeChunk === 'function' && typeof B.endFile === 'function') {
        var id = String(B.beginFile(filename, mime));
        if (id.indexOf('id:') !== 0) return id;      // not an id: the final status (an error, or the storage permission is missing)
        try {
          for (var at = 0; at < blob.size; at += BRIDGE_CHUNK) {
            var r = String(B.writeChunk(id, await blobToBase64(blob.slice(at, at + BRIDGE_CHUNK))));
            if (r !== 'ok') { try { B.abortFile(id); } catch (e2) { /* ignore */ } return r; }
          }
          return String(B.endFile(id));
        } catch (e) { try { B.abortFile(id); } catch (e3) { /* ignore */ } throw e; }
      }
      var b64 = await blobToBase64(blob);
      var st = B.saveFile(filename, b64, mime);
      return String(st === undefined || st === null ? '已儲存' : st);
    }
    if (MX.isMobileBrowser() && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
      var file = null;
      try { file = new File([blob], filename, { type: mime }); } catch (e) { file = null; }
      var ok = false;
      try { ok = !!file && navigator.canShare({ files: [file] }); } catch (e) { ok = false; }
      if (ok) {
        try { await navigator.share({ files: [file], title: filename }); return '已分享 ' + filename; }
        catch (e) { if (e && e.name === 'AbortError') return '已取消'; MX.err(e); /* anything else: fall back to the anchor */ }
      }
    }
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, blob.size > 20000000 ? 600000 : 60000);       // a big file is read late
    return '已下載 ' + filename;
  };

  MX.log = [];
  MX.err = function (e) { MX.log.push(String(e && e.stack || e)); try { console.warn('[MX]', e); } catch (x) {} };
})();
