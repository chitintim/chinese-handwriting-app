(function () {
  'use strict';
  var MX = window.MX;
  var Store = MX.Store;

  var DEF_SETTINGS = {
    acceptTouch: false, inkWidth: 'mid', tplStyle: 'fill', tplTone: 'mid', tplSize: 'm', tplFont: 'ukai', autoFlip: true, flipDelay: '2',
    name: '', perf: false, pressure: 'auto', autoNext: true, touchPrompted: false
  };
  var DEF_CFG = {
    script: 'trad', mode: 'trace', grid: 'mi', box: true, guide: true, size: 'M', dir: 'v', punct: 'hide',
    title: false, closing: false, sign: false
  };
  var CONTENT_KEYS = ['script', 'title', 'closing', 'sign'];

  // Older records used grid: mi | tian | fang | none. Now: grid = guide style (mi | tian), box = outer cell border, guide = inner lines.
  function normCfg(c) {
    if (!c) return c;
    if (c.grid === 'fang') { c.grid = 'mi'; if (c.guide === undefined) c.guide = false; }
    else if (c.grid === 'none') { c.grid = 'mi'; if (c.box === undefined) c.box = false; if (c.guide === undefined) c.guide = false; }
    return c;
  }

  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) Object.keys(s).forEach(function (k) { t[k] = s[k]; });
    }
    return t;
  }
  var META = ['id', 'textId', 'status', 'createdAt', 'updatedAt', 'cfg', 'signStr', 'pos', 'activeMs',
    'filled', 'total', 'completedAt', 'archivedAt'];

  var M = MX.Model = {
    CONTENT_KEYS: CONTENT_KEYS, normCfg: normCfg, DEF_CFG: DEF_CFG, DEF_SETTINGS: DEF_SETTINGS,
    copies: {},

    init: function () {
      // Stored-data schema marker. Records only ever gain optional fields (defaults are merged below), so
      // schema 1 needs no migration; put future migrations here, keyed on the stored value.
      var sv = Store.get('schema');
      if (!(sv >= 1)) Store.set('schema', 1);
      M.settings = assign({}, DEF_SETTINGS, Store.get('settings'));
      M.copies = {};
      Store.keys('copy:').forEach(function (k) {
        var c = Store.get(k);
        if (c && c.id) { c.cfg = assign({}, DEF_CFG, normCfg(c.cfg)); M.copies[c.id] = c; }
      });
    },
    saveSettings: function () { Store.set('settings', M.settings); },
    textCfg: function (textId) { var s = Store.get('textcfg:' + textId); return assign({}, DEF_CFG, s ? normCfg(assign({}, s)) : s); },
    saveTextCfg: function (textId, cfg) { Store.set('textcfg:' + textId, assign({}, cfg)); },

    activeCopy: function (textId) {
      var best = null;
      Object.keys(M.copies).forEach(function (id) {
        var c = M.copies[id];
        if (c.textId === textId && c.status === 'active' && (!best || c.createdAt > best.createdAt)) best = c;
      });
      return best;
    },
    archived: function (textId) {
      return Object.keys(M.copies).map(function (id) { return M.copies[id]; })
        .filter(function (c) { return c.textId === textId && c.status === 'archived'; })
        .sort(function (a, b) { return (b.archivedAt || 0) - (a.archivedAt || 0); });
    },
    doneCount: function (textId) {
      return Store.keys('done:').filter(function (k) { var d = Store.get(k); return d && d.textId === textId; }).length;
    },
    doneList: function () { return Store.keys('done:').map(function (k) { return Store.get(k); }); },

    create: function (textId, cfg, signStr, total) {
      var now = Date.now();
      var c = {
        id: MX.uid(), textId: textId, status: 'active', createdAt: now, updatedAt: now,
        cfg: assign({}, DEF_CFG, cfg), signStr: signStr || '', pos: 0, activeMs: 0,
        filled: 0, total: total || 0, completedAt: null, archivedAt: null
      };
      c.ink = {};
      M.copies[c.id] = c;
      M.saveMeta(c);
      return c;
    },
    // ink is kept per cell under "ink:<copyId>:<cell>"; loaded lazily
    loadInk: function (c) {
      if (c.ink) return c;
      c.ink = {};
      var pre = 'ink:' + c.id + ':';
      Store.keys(pre).forEach(function (k) {
        var v = Store.get(k);
        if (v && v.length) c.ink[k.slice(pre.length)] = v;
      });
      return c;
    },
    saveMeta: function (c) {
      var o = {};
      META.forEach(function (k) { o[k] = c[k]; });
      Store.set('copy:' + c.id, o);
    },
    markDirty: function (c, idx) {
      if (!c._dirty) c._dirty = {};
      c._dirty[idx] = 1;
      c.updatedAt = Date.now();
    },
    recount: function (c) {
      var n = 0;
      Object.keys(c.ink || {}).forEach(function (k) {
        if (c.ink[k].length && +k < c.total) n++;
      });
      c.filled = n;
      return n;
    },
    flush: function (c) {
      if (!c) return;
      if (c._dirty) {
        Object.keys(c._dirty).forEach(function (idx) {
          var key = 'ink:' + c.id + ':' + idx, v = c.ink[idx];
          if (v && v.length) Store.set(key, v); else Store.del(key);
        });
        c._dirty = null;
      }
      M.saveMeta(c);
    },
    archive: function (c) {
      M.flush(c);
      c.status = 'archived'; c.archivedAt = Date.now();
      M.saveMeta(c);
    },
    remove: function (c) {
      Store.keys('ink:' + c.id + ':').forEach(function (k) { Store.del(k); });
      Store.del('copy:' + c.id);
      delete M.copies[c.id];
    },
    addDone: function (c) {
      var d = {
        id: MX.uid(), copyId: c.id, textId: c.textId, script: c.cfg.script, mode: c.cfg.mode,
        date: new Date().toISOString(), ts: Date.now(), duration: c.activeMs
      };
      Store.set('done:' + d.id, d);
      return d;
    },
    pending: function () { return Object.keys(M.copies).map(function (k) { return M.copies[k]; }); },
    flushAll: function () {
      Object.keys(M.copies).forEach(function (id) { if (M.copies[id]._dirty) M.flush(M.copies[id]); });
    }
  };
})();
