(function () {
  'use strict';
  var MX = window.MX, Store = MX.Store;
  var cache = {};
  var CUSTOM = 'custom';          // the pseudo category (and id prefix) of texts the user typed in
  var MAX_CUSTOM = 30000;         // characters

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  // {trad, simp} from a {trad, simp} object or a plain string (either schema)
  function dual(v) {
    if (v && typeof v === 'object') return { trad: String(v.trad || v.simp || ''), simp: String(v.simp || v.trad || '') };
    var s = v === undefined || v === null ? '' : String(v);
    return { trad: s, simp: s };
  }
  // Both schemas are understood: the previous one had no categories / sections (title + body at the top of the text, a plain description).
  function normIndex(raw) {
    var cats = raw.categories && raw.categories.length ? raw.categories.map(function (c) { return { id: c.id, title: dual(c.title) }; })
      : [{ id: 'all', title: { trad: '文庫', simp: '文库', en: 'Library 文庫' } }];
    var texts = (raw.texts || []).map(function (e) {
      return {
        id: e.id, category: e.category || cats[0].id, title: dual(e.title), author: dual(e.author), dynasty: dual(e.dynasty), file: e.file,
        chars: e.chars || 0, sections: e.sections || 1, description: dual(e.description)
      };
    });
    return { version: raw.version || 0, categories: cats, texts: texts };
  }
  function normText(t) {
    var secs = t.sections && t.sections.length ? t.sections : [{ id: 'main', title: t.title, body: t.body }];
    return {
      id: t.id, title: dual(t.title), author: dual(t.author), dynasty: dual(t.dynasty), source: t.source || '', license: t.license || '', notes: t.notes || '',
      sections: secs.map(function (s) {
        return { id: s.id, title: dual(s.title), body: dual(s.body), author: s.author ? dual(s.author) : null };
      })
    };
  }
  function cjkCount(s) {
    var n = 0;
    Array.from(s || '').forEach(function (c) { if (MX.Closing.isCJK(c)) n++; });
    return n;
  }
  function customText(c) {
    return {
      id: c.id, title: dual(c.title), author: dual(''), dynasty: dual(''), source: '自訂', license: '', notes: '', custom: true,
      sections: [{ id: 'main', title: dual(c.title), body: dual(c.body), author: null }]
    };
  }
  function customEntry(c) {
    var n = cjkCount(c.body);
    return {
      id: c.id, category: CUSTOM, title: dual(c.title), author: dual(''), dynasty: dual(''), file: '', chars: n, sections: 1, custom: true,
      description: dual('')
    };
  }

  // ---- explanations (解說): library/notes/<textId>.json, listed by library/notes/manifest.json (written by the build from the files that exist; absent = no notes at all)
  var notesCache = {};
  function normNote(v) { return v && (v.trad || v.simp) ? dual(v) : null; }
  function normNotes(raw) {
    var secs = {};
    Object.keys((raw && raw.sections) || {}).forEach(function (id) {
      var s = raw.sections[id] || {};
      secs[id] = {
        summary: normNote(s.summary), translation: normNote(s.translation), background: normNote(s.background),
        keyLines: (s.keyLines || []).filter(function (k) { return k && k.line; }).map(function (k) { return { line: dual(k.line), note: normNote(k.note) }; }),
        glossary: (s.glossary || []).filter(function (g) { return g && g.term; }).map(function (g) { return { term: dual(g.term), note: normNote(g.note) }; })
      };
    });
    return { id: raw && raw.id, disclaimer: normNote(raw && raw.disclaimer), sections: secs };
  }

  var L = MX.Library = {
    CUSTOM: CUSTOM, MAX_CUSTOM: MAX_CUSTOM,
    index: null,            // the library index in force (bundled, or the downloaded one when newer)
    bundledVersion: 0,
    otaActive: false,
    notesIdx: {},            // {textId: {sectionId: true}} from library/notes/manifest.json
    dual: dual,

    load: async function () {
      var raw = await fetchJson('library/index.json');
      var bundled = normIndex(raw);
      L.bundledVersion = bundled.version;
      L.index = bundled;
      L.applyOta();
      await L.loadNotesManifest();
      return L.index;
    },
    loadNotesManifest: async function () {
      L.notesIdx = {};
      try {
        var m = await fetchJson('library/notes/manifest.json');
        (m && m.texts || []).forEach(function (t) {
          if (!t || !t.id) return;
          var o = {};
          (t.sections || []).forEach(function (sid) { o[sid] = true; });
          L.notesIdx[t.id] = o;
        });
      } catch (e) { L.notesIdx = {}; }       // no notes shipped (or offline without a cache): the app works without
      return L.notesIdx;
    },
    // true when a 解說 exists for the section (sectionId omitted: for any section of the text)
    hasNotes: function (textId, sectionId) {
      var o = L.notesIdx[textId];
      if (!o) return false;
      return sectionId ? !!o[sectionId] : Object.keys(o).length > 0;
    },
    notesSections: function (textId) { return Object.keys(L.notesIdx[textId] || {}); },
    getNotes: async function (textId) {
      if (notesCache[textId]) return notesCache[textId];
      var n = normNotes(await fetchJson('library/notes/' + encodeURIComponent(textId) + '.json'));
      notesCache[textId] = n;
      return n;
    },
    // the notes of one section ({summary, translation, keyLines, glossary, background} + disclaimer), null when there are none
    getSectionNotes: async function (textId, sectionId) {
      if (!L.hasNotes(textId, sectionId)) return null;
      var n = await L.getNotes(textId), s = n.sections[sectionId || 'main'];
      return s ? { summary: s.summary, translation: s.translation, background: s.background, keyLines: s.keyLines, glossary: s.glossary, disclaimer: n.disclaimer } : null;
    },
    // entries (library + 自訂) whose title / author / dynasty contain q (either script, case-insensitive)
    search: function (q) {
      q = String(q || '').trim().toLowerCase();
      if (!q) return [];
      var all = ((L.index && L.index.texts) || []).concat(L.customs().map(customEntry));
      return all.filter(function (e) {
        return [e.title, e.author, e.dynasty].some(function (v) { return v && ((v.trad || '').toLowerCase().indexOf(q) >= 0 || (v.simp || '').toLowerCase().indexOf(q) >= 0); });
      });
    },
    // Downloaded library (APK): a newer index than the bundled one wins; an older one (the app was updated past it) is dropped.
    applyOta: function () {
      var ota = Store.get('ota:index');
      L.otaActive = false;
      if (!ota) return;
      if (!(ota.version > L.bundledVersion)) {
        Store.keys('ota:').forEach(function (k) { Store.del(k); });
        return;
      }
      L.index = normIndex(ota);
      L.otaActive = true;
      cache = {};
    },
    version: function () { return L.index ? L.index.version : 0; },

    customs: function () {
      return Store.keys('custom:').map(function (k) { return Store.get(k); }).filter(function (c) { return c && c.id; })
        .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    },
    // categories as shown on the home screen: the library's, then 自訂 (always, so a new text can be added)
    categories: function () {
      var cats = (L.index ? L.index.categories : []).filter(function (c) { return L.texts(c.id).length > 0; });
      cats.push({ id: CUSTOM, title: { trad: '自訂', simp: '自定义', en: 'My texts 自訂' }, custom: true });
      return cats;
    },
    category: function (id) {
      var c = L.categories();
      for (var i = 0; i < c.length; i++) if (c[i].id === id) return c[i];
      return null;
    },
    texts: function (catId) {
      if (catId === CUSTOM) return L.customs().map(customEntry);
      var t = (L.index && L.index.texts) || [];
      return catId ? t.filter(function (e) { return e.category === catId; }) : t;
    },
    entry: function (id) {
      var i, t = (L.index && L.index.texts) || [];
      for (i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
      var c = Store.get('custom:' + id);
      return c && c.id ? customEntry(c) : null;
    },
    isCustom: function (id) { return /^custom-/.test(id); },

    getText: async function (id) {
      var c = Store.get('custom:' + id);
      if (c && c.id) return customText(c);
      if (cache[id]) return cache[id];
      var e = L.entry(id);
      if (!e) throw new Error('unknown text ' + id);
      var ota = L.otaActive ? Store.get('ota:text:' + id) : null;
      var t = normText(ota || await fetchJson('library/' + e.file));
      cache[id] = t;
      return t;
    },
    // A text restricted to one section, shaped like the single texts of the previous schema ({title, body}): what Layout.buildCells and the
    // export take. For a multi-section text the title is the section's title. null if the section does not exist.
    view: function (text, sectionId) {
      var secs = text.sections, sec = null, i;
      for (i = 0; i < secs.length; i++) if (secs[i].id === (sectionId || 'main')) sec = secs[i];
      if (!sec) return null;
      var multi = secs.length > 1;
      return {
        id: text.id, textId: text.id, sectionId: sec.id, custom: !!text.custom, multi: multi, category: (L.entry(text.id) || {}).category || (text.custom ? 'custom' : ''),
        title: multi ? sec.title : text.title, textTitle: text.title, sectionTitle: sec.title,
        short: multi ? { trad: text.title.trad + '-' + sec.title.trad, simp: text.title.simp + '-' + sec.title.simp } : null,
        author: sec.author || text.author, dynasty: text.dynasty, body: sec.body,
        sections: secs.map(function (s) { return s.id; })
      };
    },
    getView: async function (textId, sectionId) {
      var v = L.view(await L.getText(textId), sectionId);
      if (!v) throw new Error('unknown section ' + sectionId);
      return v;
    },
    sectionChars: function (sec) { return cjkCount(sec.body.trad); },
    // Text fingerprint: a short hash of exactly what decides where a cell's ink sits, the CJK characters of the section's body in the copy's script (punctuation and spaces
    // never take a cell) plus the cell layout version. A copy stores it when it is made; if the library text later differs, the ink may no longer match its characters.
    // FP_LAYOUT changes only if the way cells are numbered changes (Layout.buildCells keys).
    FP_LAYOUT: 1,
    fingerprint: function (view, script) {
      var sc = script === 'simp' ? 'simp' : 'trad', body = view && view.body ? view.body[sc] : '';
      return MX.hash53(L.FP_LAYOUT + '|' + sc + '|' + Array.from(body || '').filter(function (c) { return MX.Closing.isCJK(c); }).join(''));
    },

    // ---- custom texts (stored on this device only, part of the JSON backup; the same characters in both scripts)
    validateCustom: function (title, body) {
      title = String(title || '').trim();
      body = String(body || '').replace(/\r\n?/g, '\n').trim();
      if (!title) return { error: MX.t('請輸入標題') };
      if (cjkCount(body) < 1) return { error: MX.t('內文要有漢字') };
      if (Array.from(body).length > MAX_CUSTOM) return { error: MX.t('內文太長（上限 {n} 字）', { n: MAX_CUSTOM }) };
      return { title: title.slice(0, 40), body: body };
    },
    saveCustom: function (id, title, body) {
      var v = L.validateCustom(title, body);
      if (v.error) return v;
      var old = id ? Store.get('custom:' + id) : null, now = Date.now();
      var c = { id: old ? old.id : 'custom-' + MX.uid(), title: v.title, body: v.body, createdAt: old ? old.createdAt : now, updatedAt: now };
      Store.set('custom:' + c.id, c);
      delete cache[c.id];
      return { id: c.id };
    },
    removeCustom: function (id) { Store.del('custom:' + id); delete cache[id]; },

    // ---- downloaded library (APK): see MX.Update
    setOta: function (rawIndex, texts) {
      Object.keys(texts).forEach(function (id) { Store.set('ota:text:' + id, texts[id]); });
      Store.set('ota:index', rawIndex);
      L.applyOta();
    },
    normIndex: normIndex
  };
})();
