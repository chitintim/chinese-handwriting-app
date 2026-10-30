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
      : [{ id: 'all', title: { trad: '文庫', simp: '文库' } }];
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
      description: dual(n + '字')
    };
  }

  var L = MX.Library = {
    CUSTOM: CUSTOM, MAX_CUSTOM: MAX_CUSTOM,
    index: null,            // the library index in force (bundled, or the downloaded one when newer)
    bundledVersion: 0,
    otaActive: false,
    dual: dual,

    load: async function () {
      var raw = await fetchJson('library/index.json');
      var bundled = normIndex(raw);
      L.bundledVersion = bundled.version;
      L.index = bundled;
      L.applyOta();
      return L.index;
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
      cats.push({ id: CUSTOM, title: { trad: '自訂', simp: '自定义' }, custom: true });
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
        id: text.id, textId: text.id, sectionId: sec.id, custom: !!text.custom, multi: multi,
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

    // ---- custom texts (stored on this device only, part of the JSON backup; the same characters in both scripts)
    validateCustom: function (title, body) {
      title = String(title || '').trim();
      body = String(body || '').replace(/\r\n?/g, '\n').trim();
      if (!title) return { error: '請輸入標題' };
      if (cjkCount(body) < 1) return { error: '內文要有漢字' };
      if (Array.from(body).length > MAX_CUSTOM) return { error: '內文太長（上限 ' + MAX_CUSTOM + ' 字）' };
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
