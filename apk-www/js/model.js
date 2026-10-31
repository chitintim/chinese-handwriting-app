(function () {
  'use strict';
  var MX = window.MX;
  var Store = MX.Store;

  var DEF_SETTINGS = {
    acceptTouch: false, inkWidth: 'mthin', tplStyle: 'fill', tplTone: 'mid', gridLook: 'dots', gridDensity: 'mid', tplSize: 'md', tplFont: 'ukai', autoFlip: true, flipDelay: '2',
    name: '', perf: false, pressure: 'auto', autoNext: true, touchPrompted: false,
    brush: 'xiu', custom: null, picked: {}, curve: 'mid', stab: 'light', pressFloor: 0, pressN: 0, pressLo: 0, pressHi: 0, pressCal: false, pressMx: [],
    edgeBottom: '3.5', edgeSide: '1', exp: null, libScript: 'trad',
    sigDate: 'gz', sigWord: '', sigDizi: true, sigHui: false
  };
  var DEF_CFG = {
    script: 'trad', mode: 'trace', grid: 'mi', box: true, guide: true, size: 'M', dir: 'v', punct: 'hide',
    title: true, closing: false, sign: true
  };
  var CONTENT_KEYS = ['script'];       // title / 落款 can be switched any time: their ink has its own keys (t<i> / s<i>), the body's never shift

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
  var META = ['id', 'textId', 'sectionId', 'status', 'createdAt', 'updatedAt', 'cfg', 'signStr', 'pos', 'activeMs',
    'filled', 'total', 'completedAt', 'archivedAt', 'bodyN', 'nTitle', 'nSign', 'keyv'];

  var M = MX.Model = {
    CONTENT_KEYS: CONTENT_KEYS, normCfg: normCfg, DEF_CFG: DEF_CFG, DEF_SETTINGS: DEF_SETTINGS,
    copies: {},

    // Library sections: a copy / completion record without sectionId (everything stored before the multi-text library) belongs to section 'main'.
    sid: function (c) { return (c && c.sectionId) || 'main'; },
    SCHEMA: 4,

    init: function () {
      // Stored-data schema marker. Records only ever gain optional fields (defaults are merged below).
      //   1 -> 2: copy:* and done:* records get sectionId 'main' (the heart sutra's only section; nothing else existed before); the template glyph size
      //           default moved from 中 0.70 (key 'm') to 中 0.75 (key 'md'), so a stored 'm' (the old default) becomes 'md'. Ink, cfg and tallies are untouched.
      //   2 -> 3: new pen defaults 秀麗筆 / 筆粗 中細. settings.picked = {brush, inkWidth} marks a value the user chose explicitly. Settings stored by older builds hold the old
      //           defaults (毛筆, 中) whether chosen or not, so those become the new defaults; any other stored value was a deliberate choice and is kept (picked).
      //           Ink is raw samples, so old strokes simply re-render with the current style.
      //   3 -> 4: title (標題) and 落款 are on by default; the per-text config template of older builds stored the old defaults (off) whether chosen or not, so a stored
      //           title / sign of false becomes true there (copies keep their own config). Ink keys: copies get keyv 2 when first opened (Model.upgradeKeys).
      var sv = Store.get('schema');
      if (!(sv >= M.SCHEMA)) M.migrate(sv || 0);
      M.settings = assign({}, DEF_SETTINGS, Store.get('settings'));
      M.settings.picked = assign({}, M.settings.picked);      // own copy (never the DEF_SETTINGS object)
      if (M.settings.tplStyle === 'dotted') M.settings.tplStyle = 'dots';   // older builds: dotted outline -> halftone dots
      M.applyEdge();
      M.copies = {};
      Store.keys('copy:').forEach(function (k) {
        var c = Store.get(k);
        if (c && c.id) { c.cfg = assign({}, DEF_CFG, normCfg(c.cfg)); if (!c.sectionId) c.sectionId = 'main'; M.copies[c.id] = c; }
      });
    },
    migrate: function (from) {
      if (from < 2) {
        var st = Store.get('settings');
        if (st && st.tplSize === 'm') { st.tplSize = 'md'; Store.set('settings', st); }
        Store.keys('copy:').forEach(function (k) {
          var c = Store.get(k);
          if (c && !c.sectionId) { c.sectionId = 'main'; Store.set(k, c); }
        });
        Store.keys('done:').forEach(function (k) {
          var d = Store.get(k);
          if (d && !d.sectionId) { d.sectionId = 'main'; Store.set(k, d); }
        });
      }
      if (from < 3) {
        var s3 = Store.get('settings');
        if (s3 && typeof s3 === 'object') {
          s3.picked = s3.picked && typeof s3.picked === 'object' ? s3.picked : {};
          if (s3.brush === undefined || s3.brush === 'mao') delete s3.brush; else s3.picked.brush = true;
          if (s3.inkWidth === undefined || s3.inkWidth === 'mid') delete s3.inkWidth; else s3.picked.inkWidth = true;
          Store.set('settings', s3);
        }
      }
      if (from < 4) {
        Store.keys('textcfg:').forEach(function (k) {
          var t = Store.get(k);
          if (t && typeof t === 'object') { if (t.title === false) t.title = true; if (t.sign === false) t.sign = true; Store.set(k, t); }
        });
      }
      Store.set('schema', M.SCHEMA);
    },
    saveSettings: function () { Store.set('settings', M.settings); M.applyEdge(); },
    // Edge safe margins as CSS variables so toolbars, dialogs and scrolling screens keep clear of the screen edge too (see Layout.insets).
    applyEdge: function () {
      try {
        var e = MX.Layout.edgePct(M.settings), st = document.documentElement.style;
        st.setProperty('--edge-b', e.b + 'vh'); st.setProperty('--edge-t', e.s + 'vh');
        st.setProperty('--edge-l', e.s + 'vw'); st.setProperty('--edge-r', e.s + 'vw');
      } catch (e) { MX.err(e); }
    },
    textCfg: function (textId) { var s = Store.get('textcfg:' + textId); return assign({}, DEF_CFG, s ? normCfg(assign({}, s)) : s); },
    saveTextCfg: function (textId, cfg) { Store.set('textcfg:' + textId, assign({}, cfg)); },

    // Copies are keyed by text + section (+ script, which lives in cfg.script): at most one active copy per section is shown in the UI.
    // sectionId defaults to 'main'; script is optional (any script).
    activeCopy: function (textId, sectionId, script) {
      var best = null, sec = sectionId || 'main';
      Object.keys(M.copies).forEach(function (id) {
        var c = M.copies[id];
        if (c.textId === textId && M.sid(c) === sec && c.status === 'active' && (!script || c.cfg.script === script) && (!best || c.createdAt > best.createdAt)) best = c;
      });
      return best;
    },
    // sectionId undefined = all sections of the text
    archived: function (textId, sectionId) {
      return Object.keys(M.copies).map(function (id) { return M.copies[id]; })
        .filter(function (c) { return c.textId === textId && c.status === 'archived' && (!sectionId || M.sid(c) === sectionId); })
        .sort(function (a, b) { return (b.archivedAt || 0) - (a.archivedAt || 0); });
    },
    doneCount: function (textId, sectionId, script) {
      return Store.keys('done:').filter(function (k) {
        var d = Store.get(k);
        return d && d.textId === textId && (!sectionId || (d.sectionId || 'main') === sectionId) && (!script || d.script === script);
      }).length;
    },
    doneList: function () { return Store.keys('done:').map(function (k) { return Store.get(k); }); },
    // active copies, most recently written first (the home screen's 繼續 rows)
    recent: function () {
      return Object.keys(M.copies).map(function (id) { return M.copies[id]; })
        .filter(function (c) { return c.status === 'active' && c.filled > 0 && !c.completedAt; })
        .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    },

    create: function (textId, cfg, signStr, total, sectionId) {
      var now = Date.now();
      var c = {
        id: MX.uid(), textId: textId, sectionId: sectionId || 'main', status: 'active', createdAt: now, updatedAt: now,
        cfg: assign({}, DEF_CFG, cfg), signStr: signStr || '', pos: 0, activeMs: 0,
        filled: 0, total: total || 0, completedAt: null, archivedAt: null, keyv: 2
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
        var v = Store.get(k), a = [];
        if (v && v.length) v.forEach(function (st) { var d = MX.Ink.decode(st); if (d) a.push(d); });   // v1 flat [x,y,p] and v2 {v:2,d} strokes -> in-memory stride-6
        if (a.length) c.ink[k.slice(pre.length)] = a;
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
    // Cells that hold ink, among the cells the copy has now (body 0..bodyN-1, title t0.. when enabled, 落款 s0.. when enabled). With `cells` (the current cell list)
    // the sizes are refreshed first: total = body + title + 落款 cells that exist, so a switched-off title / 落款 does not count toward completion.
    recount: function (c, cells) {
      var n = 0, nb = c.total, nt = 0, ns = 0, hasT = false;
      if (cells) {
        nb = 0;
        cells.forEach(function (x) { if (x.sec === 'title') nt++; else if (x.sec === 'sign') ns++; else nb++; });
        c.bodyN = nb; c.nTitle = nt; c.nSign = ns; c.total = cells.length;
      } else if (c.bodyN !== undefined) { nb = c.bodyN; nt = c.nTitle || 0; ns = c.nSign || 0; }
      Object.keys(c.ink || {}).forEach(function (k) {
        if (!c.ink[k].length) return;
        var t = k.charAt(0), i = +k.slice(1);
        if (t === 't') { if (i < nt) n++; } else if (t === 's') { if (i < ns) n++; } else if (+k < nb) n++;
      });
      c.filled = n;
      return n;
    },
    // Ink keys v2 (copies made before the title / 落款 had cells of their own): the old key was the position in the cell list, which counted the title cells in front of
    // the body. Needs the text (title length). Title ink -> t<i>, 落款 ink -> s<i>, body ink -> its index in the body. Stored under the new keys, old ones removed.
    upgradeKeys: function (c, text) {
      if (c.keyv >= 2) return c;
      M.loadInk(c);
      var cfg = c.cfg || {}, script = cfg.script === 'simp' ? 'simp' : 'trad', nT = 0, nS = 0, nB, old = c.ink, out = {}, pre = 'ink:' + c.id + ':', cnt = function (str) { return Array.from(str || '').filter(function (ch) { return !/\s/.test(ch); }).length; };
      if (cfg.title && text && text.title) nT = cnt(text.title[script]);
      if (cfg.sign && c.signStr) nS = cnt(c.signStr);
      nB = Math.max(0, (c.total || 0) - nT - nS);
      if (nT || nS) {
        Object.keys(old).forEach(function (k) {
          var i = +k, nk = i < nT ? 't' + i : (i >= nT + nB ? 's' + (i - nT - nB) : String(i - nT));
          out[nk] = old[k];
        });
        Object.keys(old).forEach(function (k) { Store.del(pre + k); });
        c.ink = out;
        Object.keys(out).forEach(function (k) { Store.set(pre + k, out[k].map(MX.Ink.encode)); });
      }
      c.keyv = 2; c.bodyN = nB; c.nTitle = nT; c.nSign = nS;
      M.saveMeta(c);
      return c;
    },
    flush: function (c) {
      if (!c) return;
      if (c._dirty) {
        Object.keys(c._dirty).forEach(function (idx) {
          var key = 'ink:' + c.id + ':' + idx, v = c.ink[idx];
          if (v && v.length) Store.set(key, v.map(MX.Ink.encode)); else Store.del(key);   // stored as v2 {v:2,d} strokes
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
        id: MX.uid(), copyId: c.id, textId: c.textId, sectionId: M.sid(c), script: c.cfg.script, mode: c.cfg.mode,
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
