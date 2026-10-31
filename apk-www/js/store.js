(function () {
  'use strict';
  var MX = window.MX;
  var DBN = 'moxie', ST = 'kv', LSP = 'moxie:';
  var mem = {};
  var mode = 'mem';
  var db = null;
  var pending = 0, waiters = [];
  var idbBad = false;       // an IndexedDB write failed: further writes also go to localStorage (merged back on next start)
  var warned = false;
  var LOCAL_ONLY = /^(ota|sys|introSeen|setupAdv):/;       // introSeen:v1 = the first-visit intro was closed, setupAdv:v2 = 進階選項 of the setup screen is open (device-local: not in a backup, survive an import)

  function open() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; rej(new Error('idb timeout')); } }, 4000);
      var r;
      try { r = indexedDB.open(DBN, 1); } catch (e) { clearTimeout(t); return rej(e); }
      r.onupgradeneeded = function () { r.result.createObjectStore(ST); };
      r.onsuccess = function () { if (done) return; done = true; clearTimeout(t); res(r.result); };
      r.onerror = function () { if (done) return; done = true; clearTimeout(t); rej(r.error || new Error('idb error')); };
      r.onblocked = function () { if (done) return; done = true; clearTimeout(t); rej(new Error('idb blocked')); };
    });
  }
  function loadAllIdb() {
    return new Promise(function (res, rej) {
      var tx = db.transaction(ST, 'readonly'), out = {};
      var c = tx.objectStore(ST).openCursor();
      c.onsuccess = function () {
        var cur = c.result;
        if (cur) { out[cur.key] = cur.value; cur.continue(); }
      };
      tx.oncomplete = function () { res(out); };
      tx.onerror = function () { rej(tx.error); };
      tx.onabort = function () { rej(tx.error || new Error('abort')); };
    });
  }
  function lsAvailable() {
    try { var k = LSP + '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  }
  function loadAllLs() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf(LSP) === 0 && k !== LSP + '__t') {
        try { out[k.slice(LSP.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
      }
    }
    return out;
  }
  function begin() { pending++; }
  function end() {
    pending--;
    if (pending <= 0) { pending = 0; var w = waiters; waiters = []; w.forEach(function (f) { f(); }); }
  }
  function lsWrite(k, v, del) {
    try {
      if (del) localStorage.removeItem(LSP + k); else localStorage.setItem(LSP + k, JSON.stringify(v));
      return true;
    } catch (e) { MX.err(e); return false; }
  }
  function warn() {
    if (warned) return;
    warned = true;
    if (MX.toast) MX.toast('儲存失敗（空間不足？）請盡快匯出備份', 6000);
  }
  function idbFailed(k, v, del) {
    idbBad = true;
    if (!lsWrite(k, v, del)) warn();
  }
  function persist(k, v, del) {
    if (mode === 'idb' && !idbBad) {
      begin();
      try {
        var tx = db.transaction(ST, 'readwrite'), s = tx.objectStore(ST);
        if (del) s.delete(k); else s.put(v, k);
        tx.oncomplete = end;
        tx.onerror = function () { MX.err(tx.error); idbFailed(k, v, del); end(); };
        tx.onabort = function () { MX.err(tx.error); idbFailed(k, v, del); end(); };
      } catch (e) { MX.err(e); idbFailed(k, v, del); end(); }
    } else if (mode === 'idb' || mode === 'ls') {
      if (!lsWrite(k, v, del)) warn();
    }
  }
  // Entries parked in localStorage (IndexedDB timed out or failed earlier) are newer than what IndexedDB holds.
  function mergeLsIntoIdb() {
    if (!lsAvailable()) return;
    var ls = loadAllLs(), keys = Object.keys(ls);
    if (!keys.length) return;
    keys.forEach(function (k) { mem[k] = ls[k]; persist(k, ls[k], false); });
    Store.idle().then(function () {
      if (idbBad) return;
      keys.forEach(function (k) { try { localStorage.removeItem(LSP + k); } catch (e) { /* ignore */ } });
    });
  }

  var Store = MX.Store = {
    init: async function () {
      try {
        db = await open();
        mem = await loadAllIdb();
        mode = 'idb';
        try { db.onclose = function () { idbBad = true; }; db.onversionchange = function () { idbBad = true; db.close(); }; } catch (x) { /* ignore */ }
        try { mergeLsIntoIdb(); } catch (x) { MX.err(x); }
      } catch (e) {
        MX.err(e);
        db = null;
        if (lsAvailable()) { mode = 'ls'; mem = loadAllLs(); } else { mode = 'mem'; mem = {}; }
      }
      return mode;
    },
    mode: function () { return mode; },
    get: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : undefined; },
    set: function (k, v) { mem[k] = v; persist(k, v, false); },
    del: function (k) { delete mem[k]; persist(k, null, true); },
    keys: function (prefix) { return Object.keys(mem).filter(function (k) { return k.indexOf(prefix || '') === 0; }); },
    idle: function () { return new Promise(function (res) { if (pending === 0) res(); else waiters.push(res); }); },
    // Keys under LOCAL_ONLY (downloaded library data, update bookkeeping) are not part of a backup and survive an import.
    exportAll: function () { var o = {}; Object.keys(mem).forEach(function (k) { if (!LOCAL_ONLY.test(k)) o[k] = mem[k]; }); return o; },
    clearAll: function () { Object.keys(mem).slice().forEach(function (k) { if (!LOCAL_ONLY.test(k)) Store.del(k); }); },
    importAll: function (entries) {
      Store.clearAll();
      Object.keys(entries).forEach(function (k) { Store.set(k, entries[k]); });
    }
  };
})();
