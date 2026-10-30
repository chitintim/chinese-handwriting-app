(function () {
  'use strict';
  var MX = window.MX;
  var cache = {};
  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  MX.Library = {
    index: null,
    offline: function () { return !!window.__LIBRARY__; },
    load: async function () {
      if (window.__LIBRARY__) this.index = window.__LIBRARY__.index;
      else this.index = await fetchJson('library/index.json');
      return this.index;
    },
    texts: function () { return (this.index && this.index.texts) || []; },
    entry: function (id) {
      var t = this.texts();
      for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
      return null;
    },
    getText: async function (id) {
      if (cache[id]) return cache[id];
      var e = this.entry(id);
      if (!e) throw new Error('unknown text ' + id);
      var t;
      if (window.__LIBRARY__) t = window.__LIBRARY__.texts[id];
      else t = await fetchJson('library/' + e.file);
      if (!t) throw new Error('missing text ' + id);
      cache[id] = t;
      return t;
    }
  };
})();
