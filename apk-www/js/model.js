(function () {
  'use strict';
  var MX = window.MX;
  var Store = MX.Store;

  var DEF_SETTINGS = {
    inkWidth: 'thin', tplStyle: 'fill', tplTone: 'mid', gridLook: 'dots', gridDensity: 'mid', tplSize: 'md', tplFont: 'ukai', autoFlip: true, flipDelay: '2',
    name: '', perf: false, pressure: 'auto', autoNext: true, touchPrompted: false,
    brush: 'mao', custom: null, picked: {}, stab: 'light', pressFloor: 0, pressN: 0, pressLo: 0, pressHi: 0, pressCal: false, pressMx: [], pressMd: [], pressNm: 0, pressKnots: null, pressRange: 'mid',
    edgeBottom: '3.5', edgeSide: (MX.Device && MX.Device.env().ios) ? '2' : '1',     // iOS: keep the cells clear of Safari's edge-swipe-back
    screenType: '', exp: null, libScript: 'trad',
    sigDate: 'gz', sigWord: '', sigDizi: true, sigHui: false,
    autoNotes: true, sideNotes: false, strokeTap: true, strokeSpeed: 'mid',
    layoutMode: 'auto', inputMode: 'auto', phoneAuto: true, lowLat: 'auto',
    cfgDefault: null          // 新字帖預設: the copy choices (CFG_KEYS) a text that was never started begins with; null = the built-in DEF_CFG
  };
  var DEF_CFG = {
    script: 'trad', mode: 'trace', grid: 'mi', box: true, guide: true, size: 'M', dir: 'v', punct: 'hide',
    title: true, closing: false, sign: true
  };
  var CFG_KEYS = ['script', 'mode', 'grid', 'box', 'guide', 'size', 'dir', 'punct', 'title', 'sign'];       // the choices of the setup screen (what 新字帖預設 and a text's remembered choices hold)
  var CONTENT_KEYS = ['script'];       // title / 落款 can be switched any time: their ink has its own keys (t<i> / s<i>), the body's never shift

  // Older records used grid: mi | tian | fang | none. Now: grid = guide style (mi | tian), box = outer cell border, guide = inner lines.
  function normCfg(c) {
    if (!c) return c;
    if (c.grid === 'fang') { c.grid = 'mi'; if (c.guide === undefined) c.guide = false; }
    else if (c.grid === 'none') { c.grid = 'mi'; if (c.box === undefined) c.box = false; if (c.guide === undefined) c.guide = false; }
    return c;
  }

  // the withdrawn 觸控板書寫 (laptop trackpad writing, SPEC revision 15): its settings and its one-time banner flag are removed
  var PAD_KEYS = ['padMode', 'padFine', 'padGain'];
  // 書寫工具 from the two switches it replaced: 手指書寫 on -> 手指; else 手機手指書寫 off -> 觸控筆; else 自動 (the old defaults)
  function legacyInput(s) { return s.acceptTouch === true ? 'touch' : (s.phoneTouch === false ? 'pen' : 'auto'); }

  function pickCfg(c) {
    var o = {};
    CFG_KEYS.forEach(function (k) { if (c && c[k] !== undefined) o[k] = c[k]; });
    return o;
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
    CONTENT_KEYS: CONTENT_KEYS, CFG_KEYS: CFG_KEYS, normCfg: normCfg, DEF_CFG: DEF_CFG, DEF_SETTINGS: DEF_SETTINGS,
    copies: {},

    // Library sections: a copy / completion record without sectionId (everything stored before the multi-text library) belongs to section 'main'.
    sid: function (c) { return (c && c.sectionId) || 'main'; },
    SCHEMA: 7,

    init: function () {
      // Stored-data schema marker. Records only ever gain optional fields (defaults are merged below).
      //   1 -> 2: copy:* and done:* records get sectionId 'main' (the heart sutra's only section; nothing else existed before); the template glyph size
      //           default moved from 中 0.70 (key 'm') to 中 0.75 (key 'md'), so a stored 'm' (the old default) becomes 'md'. Ink, cfg and tallies are untouched.
      //   2 -> 3: new pen defaults 秀麗筆 / 筆粗 中細. settings.picked = {brush, inkWidth} marks a value the user chose explicitly. Settings stored by older builds hold the old
      //           defaults (毛筆, 中) whether chosen or not, so those become the new defaults; any other stored value was a deliberate choice and is kept (picked).
      //           Ink is raw samples, so old strokes simply re-render with the current style.
      //   3 -> 4: title (標題) and 落款 are on by default; the per-text config template of older builds stored the old defaults (off) whether chosen or not, so a stored
      //           title / sign of false becomes true there (copies keep their own config). Ink keys: copies get keyv 2 when first opened (Model.upgradeKeys).
      //   4 -> 5: new pen defaults 毛筆 / 筆粗 細 (user feedback on 0.5.2). Every stored settings object holds the defaults of the build that wrote it (brush 'xiu' / 'mao', inkWidth 'mthin' / 'mid' ...)
      //           whether chosen or not; settings.picked marks what the user chose explicitly in the UI. Anything not picked is dropped, so it follows the current default.
      //   5 -> 6: copy choices have one rule (docs/SPEC.md "Choices and memory"): the text's own remembered choices (textcfg:<id>), else 新字帖預設 (settings.cfgDefault, new, starts empty),
      //           else the built-in DEF_CFG. Stored text templates are normalised once (legacy grid values 方格 / 無) so a text's sections compare exactly; nothing else is rewritten.
      //   6 -> 7: one 書寫工具 setting (settings.inputMode: auto | pen | touch on a touch device; docs/SPEC.md "Input type") replaces the two overlapping switches 手指書寫 (acceptTouch,
      //           default off, tablet layout) and 手機手指書寫 (phoneTouch, default on, phone layout): acceptTouch true -> 'touch'; else phoneTouch false -> 'pen'; else 'auto' (= what both defaults did).
      //           Both old keys are removed, and so are the settings of the withdrawn 觸控板書寫 (padMode / padFine / padGain) and its banner flag sys:padTip. Nothing else is touched; the choice is device-level (a backup neither carries nor overwrites it).
      var sv = Store.get('schema');
      if (!(sv >= M.SCHEMA)) M.migrate(sv || 0);
      M.settings = assign({}, DEF_SETTINGS, Store.get('settings'));
      var raw = Store.get('settings');
      if (raw && typeof raw === 'object' && raw.inputMode === undefined) M.settings.inputMode = legacyInput(raw);       // settings written before 書寫工具 (also a backup of an older build)
      if (['auto', 'pen', 'touch'].indexOf(M.settings.inputMode) < 0) M.settings.inputMode = 'auto';       // 書寫工具
      PAD_KEYS.concat(['acceptTouch', 'phoneTouch']).forEach(function (k) { delete M.settings[k]; });
      M.settings.picked = assign({}, M.settings.picked);      // own copy (never the DEF_SETTINGS object)
      if (M.settings.tplStyle === 'dotted') M.settings.tplStyle = 'dots';   // older builds: dotted outline -> halftone dots
      if (MX.Device) MX.Device.apply(); else M.applyEdge();
      if (M.settings.screenType !== 'eink' && M.settings.screenType !== 'normal') {      // 螢幕類型: first start on this device
        M.settings.screenType = MX.Device ? MX.Device.defaultScreen() : 'eink';
        if (M.settings.screenType === 'normal' && !(M.settings.picked && M.settings.picked.gridLook)) M.settings.gridLook = 'light';
      }                  // layout mode (版面) + edge margins
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
      if (from < 5) {
        var s5 = Store.get('settings');
        if (s5 && typeof s5 === 'object') {
          var pk = s5.picked && typeof s5.picked === 'object' ? s5.picked : {};
          if (!pk.brush) delete s5.brush;
          if (!pk.inkWidth) delete s5.inkWidth;
          // the pressure model changed (one clear model: 粗細 = size at normal pressure, 校準 = 輕 / 平常 / 重 map): an old two-stroke calibration saturated normal writing, so it is dropped
          // (the adaptive range is learned again); 筆壓 輕 / 中 / 重 (curve) is gone
          if (s5.pressCal && !s5.pressKnots) { s5.pressCal = false; s5.pressLo = 0; s5.pressHi = 0; }
          s5.pressMx = []; s5.pressMd = []; s5.pressNm = 0;
          delete s5.curve;
          Store.set('settings', s5);
        }
      }
      if (from < 6) {
        Store.keys('textcfg:').forEach(function (k) {
          var t = Store.get(k);
          if (t && typeof t === 'object') Store.set(k, normCfg(assign({}, t)));
        });
        var s6 = Store.get('settings');
        if (s6 && typeof s6 === 'object' && s6.cfgDefault === undefined) { s6.cfgDefault = null; Store.set('settings', s6); }
      }
      if (from < 7) {
        var s7 = Store.get('settings');
        if (s7 && typeof s7 === 'object') {
          if (s7.inputMode !== 'auto' && s7.inputMode !== 'pen' && s7.inputMode !== 'touch') s7.inputMode = legacyInput(s7);
          PAD_KEYS.concat(['acceptTouch', 'phoneTouch']).forEach(function (k) { delete s7[k]; });
          Store.set('settings', s7);
        }
      }
      if (from < 7) Store.del('sys:padTip');
      Store.set('schema', M.SCHEMA);
    },
    saveSettings: function () { Store.set('settings', M.settings); if (MX.Device) MX.Device.refresh(); else M.applyEdge(); },
    // Edge safe margins as CSS variables so toolbars, dialogs and scrolling screens keep clear of the screen edge too (see Layout.insets).
    applyEdge: function () {
      try {
        var e = MX.Layout.edgePct(M.settings), st = document.documentElement.style;
        if (MX.Device && MX.Device.isPhone()) {
          // phone layout: the notch / home indicator / rounded corners (env safe-area insets, 0 elsewhere) plus a small margin; no pen dead zone to avoid
          st.setProperty('--edge-b', 'calc(env(safe-area-inset-bottom, 0px) + 6px)'); st.setProperty('--edge-t', 'calc(env(safe-area-inset-top, 0px) + 4px)');
          st.setProperty('--edge-l', 'calc(env(safe-area-inset-left, 0px) + 6px)'); st.setProperty('--edge-r', 'calc(env(safe-area-inset-right, 0px) + 6px)');
          return;
        }
        st.setProperty('--edge-b', e.b + 'vh'); st.setProperty('--edge-t', e.s + 'vh');
        st.setProperty('--edge-l', e.s + 'vw'); st.setProperty('--edge-r', e.s + 'vw');
      } catch (e) { MX.err(e); }
    },
    // 螢幕類型 preset: 電子紙 = black dotted guides (survive the fast refresh mode); 一般螢幕 = light grey solid guides. 格線樣式 can still be changed afterwards.
    applyScreenType: function (st, v) {
      st.screenType = v === 'normal' ? 'normal' : 'eink';
      st.gridLook = st.screenType === 'normal' ? 'light' : 'dots';
      return st;
    },
    // ---- copy choices (字體 模式 格線 方向 格大小 標點 標題 落款), one rule for every screen:
    //   1. a copy that has ink keeps its own choices (cfg);
    //   2. otherwise the text's remembered choices (textcfg:<textId>: saved when a section is started and when they are changed while writing; every section of the text shares them);
    //   3. a text that was never started begins with 新字帖預設 (settings.cfgDefault, set in 設定 or by 設為預設 in the setup screen);
    //   4. without that, the built-in DEF_CFG.
    // The app settings (筆觸, 螢幕類型, 署名 ...) are global and never part of a copy's choices.
    defaultCfg: function () {
      var d = M.settings && M.settings.cfgDefault;
      return assign({}, DEF_CFG, d && typeof d === 'object' ? normCfg(pickCfg(d)) : null);
    },
    setDefaultCfg: function (cfg) { M.settings.cfgDefault = cfg ? pickCfg(cfg) : null; M.saveSettings(); },
    hasTextCfg: function (textId) { return !!Store.get('textcfg:' + textId); },
    textCfg: function (textId) { var s = Store.get('textcfg:' + textId); return assign(M.defaultCfg(), s ? normCfg(assign({}, s)) : null); },
    saveTextCfg: function (textId, cfg) { Store.set('textcfg:' + textId, assign({}, cfg)); },
    // where the choices a text starts with come from: 'text' | 'default' | 'builtin'
    cfgSource: function (textId) { return M.hasTextCfg(textId) ? 'text' : (M.settings.cfgDefault ? 'default' : 'builtin'); },

    // ---- sections of one text: 'doing' = an active copy with ink that is not complete, 'done' = written to the end at least once, 'todo' = nothing written yet
    sectionState: function (textId, sectionId) {
      var c = M.activeCopy(textId, sectionId);
      if (c && c.completedAt) return 'done';
      if (c && c.filled > 0) return 'doing';
      return M.doneCount(textId, sectionId) > 0 ? 'done' : 'todo';
    },
    // the section to offer next: the one written most recently and not finished (繼續), else the first one with nothing written (開始), else the first one again (all 'done'); ids = the text's section ids in order
    nextSection: function (textId, ids) {
      var doing = null, i;
      M.recent().forEach(function (c) { if (!doing && c.textId === textId && ids.indexOf(M.sid(c)) >= 0) doing = M.sid(c); });
      if (doing) return { id: doing, state: 'doing' };
      for (i = 0; i < ids.length; i++) if (M.sectionState(textId, ids[i]) === 'todo') return { id: ids[i], state: 'todo' };
      return { id: ids[0], state: 'done' };
    },

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

    // ---- favourites (收藏): text level (fav:<textId>) and section level (fav:<textId>:<sectionId>); part of the JSON backup like every other key
    favKey: function (textId, sectionId) { return 'fav:' + textId + (sectionId ? ':' + sectionId : ''); },
    isFav: function (textId, sectionId) { return !!Store.get(M.favKey(textId, sectionId)); },
    setFav: function (textId, sectionId, on) {
      var k = M.favKey(textId, sectionId);
      if (on) Store.set(k, { textId: textId, sectionId: sectionId || null, ts: Date.now() }); else Store.del(k);
      return !!on;
    },
    toggleFav: function (textId, sectionId) { return M.setFav(textId, sectionId, !M.isFav(textId, sectionId)); },
    // newest first: [{textId, sectionId|null, ts}]
    favs: function () {
      return Store.keys('fav:').map(function (k) { return Store.get(k); }).filter(function (f) { return f && f.textId; })
        .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    },
    // share (0..1) of an active copy that is written; a completed copy counts as 1
    copyFrac: function (c) { return !c ? 0 : (c.completedAt ? 1 : (c.total ? Math.min(1, c.filled / c.total) : 0)); },
    // progress of a whole text (0..1): the mean of its sections' active copies (sections without a copy count 0); nSec = number of sections
    textProgress: function (textId, nSec) {
      var seen = {}, sum = 0;
      Object.keys(M.copies).forEach(function (id) { var c = M.copies[id]; if (c.textId === textId && c.status === 'active') seen[M.sid(c)] = 1; });
      Object.keys(seen).forEach(function (sid) { sum += M.copyFrac(M.activeCopy(textId, sid)); });
      return nSec > 0 ? Math.min(1, sum / nSec) : 0;
    },
    // number of different sections of the text that have been completed at least once
    sectionsDone: function (textId) {
      var seen = {};
      Store.keys('done:').forEach(function (k) { var d = Store.get(k); if (d && d.textId === textId) seen[d.sectionId || 'main'] = 1; });
      return Object.keys(seen).length;
    },
    // newest write time (ms) among the text's copies
    lastWritten: function (textId) {
      var t = 0;
      Object.keys(M.copies).forEach(function (id) { var c = M.copies[id]; if (c.textId === textId && c.filled > 0 && (c.updatedAt || 0) > t) t = c.updatedAt; });
      return t;
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
