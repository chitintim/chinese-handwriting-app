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

  var toastEl = null, toastTimer = null;
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

  // Save a file: native bridge if present, else anchor download. src = Blob | data: URL string.
  MX.saveFile = async function (filename, src, mime) {
    var blob = typeof src === 'string' ? dataUrlToBlob(src) : src;
    mime = mime || blob.type || 'application/octet-stream';
    if (window.MoBridge && typeof window.MoBridge.saveFile === 'function') {
      var b64 = await blobToBase64(blob);
      var st = window.MoBridge.saveFile(filename, b64, mime);
      return String(st === undefined || st === null ? '已儲存' : st);
    }
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 4000);
    return '已下載 ' + filename;
  };

  MX.log = [];
  MX.err = function (e) { MX.log.push(String(e && e.stack || e)); try { console.warn('[MX]', e); } catch (x) {} };
})();
