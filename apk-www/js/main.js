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
    return { name: parts[0] || 'home', arg: parts[1] || '', arg2: parts[2] || '', query: q };
  }
  function teardown() {
    if (MX.Practice) MX.Practice.hide();
    if (MX.PenTest) MX.PenTest.hide();
    if (MX.Notes) MX.Notes.hide();
    MX.Model.flushAll();
    var layer = MX.layer();
    layer.innerHTML = '';
    root().innerHTML = '';
  }
  // the practice view is built asynchronously: an error there must not leave a blank page (the same error screen as a synchronous one)
  function guard(el, p) {
    if (!p || !p.catch) return;
    p.catch(function (e) {
      MX.err(e);
      if (el.querySelector('.screen')) return;
      el.appendChild(MX.h('div', { class: 'screen' }, [MX.h('h1', { text: MX.t('發生錯誤') }), MX.h('p', { class: 'mono', text: String(e && e.stack || e) }),
        MX.h('button', { text: MX.t('返回'), onclick: function () { location.hash = '#/'; } })]));
    });
  }
  function route() {
    teardown();
    var r = parse(), el = root(), oldAbout = false;
    // the old #/about (there is no 關於 page any more): the home screen with the dialog over it; the address goes back to #/ (no new history entry)
    if (r.name === 'about') {
      oldAbout = true; r = { name: 'home', arg: '', arg2: '', query: '' };
      try { history.replaceState(history.state, '', location.pathname + location.search + '#/'); } catch (e) { /* ignore */ }
    }
    current = r.name;
    try {
      switch (r.name) {
        case 'practice': guard(el, MX.Practice.show(el, r.arg, { readOnly: false })); break;
        case 'view': guard(el, MX.Practice.show(el, r.arg, { readOnly: true })); break;
        case 'setup': MX.Screens.setup(el, r.arg, r.arg2 || 'main', r.query); break;
        case 'lib': MX.Screens.category(el, r.arg, r.query); break;
        case 'text': MX.Screens.text(el, r.arg, r.query); break;
        case 'shelf': MX.Screens.shelf(el, r.arg, r.query); break;
        case 'search': MX.Screens.search(el, r.query); break;
        case 'notes': MX.Notes.show(el, r.arg, r.arg2 || 'main', r.query); break;
        case 'custom': MX.Screens.custom(el, r.arg); break;
        case 'settings': MX.Screens.settings(el); break;
        case 'archives': MX.Screens.archives(el, r.arg, r.arg2); break;
        case 'works': MX.Screens.works(el, r.query); break;
        case 'pentest': MX.PenTest.show(el); break;
        default: MX.Screens.home(el, r.query);
      }
    } catch (e) {
      MX.err(e);
      el.appendChild(MX.h('div', { class: 'screen' }, [MX.h('h1', { text: MX.t('發生錯誤') }), MX.h('p', { class: 'mono', text: String(e && e.stack || e) }),
        MX.h('button', { text: MX.t('返回'), onclick: function () { location.hash = '#/'; } })]));
    }
    // the first-visit intro: opens over the home screen only (never over practice / pen test / an export), stays open across a re-render, closes when the route leaves for practice
    try { if (oldAbout && MX.Intro) MX.Intro.open(); if (MX.Intro) MX.Intro.onRoute(r.name); } catch (e) { MX.err(e); }
    try { MX.toastShowPending(); } catch (e) { MX.err(e); }       // a message about what happened just before the route changed (e.g. 上一遍已存入我的作品)
  }
  MX.route = route;
  MX.isHome = function () { return current === 'home'; };

  async function boot() {
    var el = root();
    try {
      await MX.Store.init();
      MX.Model.init();
      await MX.Library.load();
      await MX.Draw.loadCoverage();
    } catch (e) {
      MX.err(e);
      el.appendChild(MX.h('div', { class: 'screen' }, [
        MX.h('h1', { text: MX.t('無法載入文庫') }),
        MX.h('p', { text: MX.t('請檢查網路連線後重試，或安裝 App (APK)。') }),
        MX.h('p', { class: 'mono', text: String(e && e.message || e) }),
        MX.h('button', { text: MX.t('重試'), onclick: function () { location.reload(); } })
      ]));
      return;
    }
    window.addEventListener('hashchange', route);
    // the layout mode flipped (版面 setting, a window resized across 520 px): draw the current screen again in the other layout (not under a pen that is writing)
    var reflow = function () {
      if (MX.Practice && MX.Practice.busy()) { setTimeout(reflow, 400); return; }
      var sc = document.querySelector('#app > .screen'), top = sc ? sc.scrollTop : 0;
      if (MX.Practice) MX.Practice.rememberPos();
      route();
      sc = document.querySelector('#app > .screen');
      if (sc && top) sc.scrollTop = top;
    };
    MX.Device.onChange(function () { if (MX.ready) reflow(); });
    // the interface language changed (繁 / 简 / EN): the same redraw; the open practice page, the ink and the settings stay (the page is rebuilt from the stored copy)
    MX.I18n.onChange(function () { if (MX.ready) reflow(); });
    window.addEventListener('pagehide', function () { MX.Model.flushAll(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) MX.Model.flushAll(); });
    // native wrapper: Activity.onPause (the WebView may never see pagehide/visibilitychange before the process is killed)
    window.addEventListener('mo-pause', function () { MX.Model.flushAll(); });
    // native wrapper: Back button. true = handled here (the app stays open), false = let Android close the app.
    window.__moHandleBack = function () {
      try {
        if (MX.Intro && MX.Intro.isOpen()) { MX.Intro.close('back'); return true; }
        if (MX.closeTopModal()) return true;
        if (current && current !== 'home') {
          if (history.length > 1) history.back(); else location.hash = '#/';
          return true;
        }
      } catch (e) { MX.err(e); }
      return false;
    };
    // anonymous visit count (GoatCounter: no cookies, no personal data): one count per app start, only on the hosted site (path /) and in the APK
    // when online (path /apk); never with Do Not Track, never on localhost / test servers
    MX.visitPath = function (host, apk, dnt) {
      if (dnt === '1' || dnt === 'yes') return null;
      if (host === 'chitintim.github.io') return '/';
      return apk && host === 'appassets.androidplatform.net' ? '/apk' : null;
    };
    function countVisit() {
      try {
        var path = MX.visitPath(location.hostname, !!window.MoBridge, navigator.doNotTrack || window.doNotTrack);
        if (!path || navigator.onLine === false) return;
        window.goatcounter = { no_onload: true };
        var sc = document.createElement('script');
        sc.async = true; sc.src = 'https://gc.zgo.at/count.js'; sc.setAttribute('data-goatcounter', 'https://moxie.goatcounter.com/count');
        sc.onload = function () { try { window.goatcounter.count({ path: path, title: '墨字帖' }); } catch (e) { /* ignore */ } };
        document.head.appendChild(sc);
      } catch (e) { /* never matters */ }
    }
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
    route();
    MX.ready = true;
    try { MX.Model.backfillFp(); } catch (e) { MX.err(e); }       // copies from before the text fingerprint get the current library text's (schema 8)
    registerSw();
    countVisit();
    // APK: look for a newer release / library (at most once per 24 h, silent when offline)
    if (window.MoBridge) { try { MX.Update.auto().catch(function () { /* offline */ }); } catch (e) { MX.err(e); } }
  }

  // Service worker: hosted (http/https) web app only, never inside the native wrapper or file://.
  // A new version installs in the background (versioned cache, skipWaiting + clients.claim); the page then shows an
  // "update available" card on the home screen (no automatic reload, so ink is never lost mid-stroke).
  function registerSw() {
    var flag = document.querySelector('meta[name=mx-sw]');
    if (window.MoBridge || !flag || flag.content !== '1' || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    try {
      var had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!had) { had = true; return; }       // first install claiming this page: nothing to update
        MX.updateReady = true;
        if (current === 'home') route();
      });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        var check = function () { try { reg.update().catch(function () { /* offline */ }); } catch (e) { /* ignore */ } };
        document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
      }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }
  boot();
})();
