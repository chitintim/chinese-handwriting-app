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
    load: async function () {
      this.index = await fetchJson('library/index.json');
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
      var t = await fetchJson('library/' + e.file);
      cache[id] = t;
      return t;
    }
  };
})();
