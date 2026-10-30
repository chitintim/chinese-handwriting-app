(function () {
  'use strict';
  var MX = window.MX;
  var current = null;

  function root() { return document.getElementById('app'); }
  function parse() {
    var raw = (location.hash || '#/').slice(1);
    var q = '', i = raw.indexOf('?');
    if (i >= 0) { q = raw.slice(i + 1); raw = raw.slice(0, i); }
    var parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
    return { name: parts[0] || 'home', arg: parts[1] || '', query: q };
  }
  function teardown() {
    if (MX.Practice) MX.Practice.hide();
    if (MX.PenTest) MX.PenTest.hide();
    MX.Model.flushAll();
    var layer = MX.layer();
    layer.innerHTML = '';
    root().innerHTML = '';
  }
  function route() {
    teardown();
    var r = parse(), el = root();
    current = r.name;
    try {
      switch (r.name) {
        case 'practice': MX.Practice.show(el, r.arg, { readOnly: false }); break;
        case 'view': MX.Practice.show(el, r.arg, { readOnly: true }); break;
        case 'setup': MX.Screens.setup(el, r.arg, r.query); break;
        case 'settings': MX.Screens.settings(el); break;
        case 'archives': MX.Screens.archives(el, r.arg); break;
        case 'pentest': MX.PenTest.show(el); break;
        default: MX.Screens.home(el);
      }
    } catch (e) {
      MX.err(e);
      el.appendChild(MX.h('div', { class: 'screen' }, [MX.h('h1', { text: '發生錯誤' }), MX.h('p', { class: 'mono', text: String(e && e.stack || e) }),
        MX.h('button', { text: '返回', onclick: function () { location.hash = '#/'; } })]));
    }
  }
  MX.route = route;

  async function boot() {
    var el = root();
    try {
      await MX.Store.init();
      MX.Model.init();
      await MX.Library.load();
    } catch (e) {
      MX.err(e);
      el.appendChild(MX.h('div', { class: 'screen' }, [
        MX.h('h1', { text: '無法載入文庫' }),
        MX.h('p', { text: '請用網址開啟，或使用「離線版」單一檔案。' }),
        MX.h('p', { class: 'mono', text: String(e && e.message || e) }),
        MX.h('button', { text: '重試', onclick: function () { location.reload(); } })
      ]));
      return;
    }
    window.addEventListener('hashchange', route);
    window.addEventListener('pagehide', function () { MX.Model.flushAll(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) MX.Model.flushAll(); });
    // native wrapper: Activity.onPause (the WebView may never see pagehide/visibilitychange before the process is killed)
    window.addEventListener('mo-pause', function () { MX.Model.flushAll(); });
    // native wrapper: Back button. true = handled here (the app stays open), false = let Android close the app.
    window.__moHandleBack = function () {
      try {
        if (MX.closeTopModal()) return true;
        if (current && current !== 'home') {
          if (history.length > 1) history.back(); else location.hash = '#/';
          return true;
        }
      } catch (e) { MX.err(e); }
      return false;
    };
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
    route();
    MX.ready = true;
  }
  boot();
})();
