(function () {
  'use strict';
  var MX = window.MX, h = MX.h, Store = MX.Store;
  // In-app update detection for the Android app (window.MoBridge present). The hosted web app updates through its service worker instead
  // (the 有新版本 card of main.js). Two independent things are checked, at most once per 24 h at launch (silently, nothing shown when offline)
  // and on demand from 設定:
  //   * a new APK: GitHub's latest release (tag_name compared with MoBridge.version()) -> MoBridge.downloadAndInstall(url)
  //   * a newer library: the Pages library/index.json (`version`) -> new / changed text files are stored on the device (Library.setOta)
  var REPO = 'chitintim/chinese-handwriting-app';
  var API_URL = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  var APK_FALLBACK = 'https://github.com/' + REPO + '/releases/latest/download/moxie.apk';
  var PAGES_LIB = 'https://chitintim.github.io/chinese-handwriting-app/library/';
  var DAY = 24 * 3600 * 1000;

  var U = MX.Update = {
    URLS: { api: API_URL, apk: APK_FALLBACK, lib: PAGES_LIB },
    apk: null,          // {tag, version, notes, url, page} when a newer release exists
    lib: null,          // {version, raw, entries: [changed/new index entries]} when a newer library exists
    dl: { state: 'idle', progress: 0, message: '' },     // native download state (mo-update events)
    libState: { state: 'idle', done: 0, total: 0 },
    dismissed: false,

    // "1.2.3", "v1.2.3", "1.2.3+10203", "1.2.3-dev" -> [1,2,3] (null if not a version)
    parse: function (s) {
      var m = /(\d+)\.(\d+)\.(\d+)/.exec(String(s === undefined || s === null ? '' : s));
      return m ? [+m[1], +m[2], +m[3]] : null;
    },
    cmp: function (a, b) {
      for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
      return 0;
    },
    bridge: function () { return window.MoBridge || null; },
    current: function () {
      var b = U.bridge();
      try { return b && typeof b.version === 'function' ? String(b.version()) : ''; } catch (e) { return ''; }
    },
    plain: function (md) {
      return String(md || '').replace(/\r\n?/g, '\n').replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/\*\*|__|`/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500);
    },

    // ---- bookkeeping: when was each check last made (not part of the backup)
    stamp: function (k) { var s = Store.get('sys:update') || {}; return s[k] || 0; },
    setStamp: function (k) { var s = Store.get('sys:update') || {}; s[k] = Date.now(); Store.set('sys:update', s); },
    due: function (k) { return Date.now() - U.stamp(k) >= DAY; },

    // ---- APK
    // manual: ignore the 24 h limit and report the outcome. Resolves {status: 'new'|'current'|'error'|'unsupported'|'skipped'}.
    checkApk: function (manual) {
      var b = U.bridge();
      if (!b) return Promise.resolve({ status: 'unsupported' });
      if (!manual && !U.due('apk')) return Promise.resolve({ status: 'skipped' });
      return fetch(API_URL, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (rel) {
        U.setStamp('apk');
        var latest = U.parse(rel && rel.tag_name), cur = U.parse(U.current());
        if (!latest || !cur) return { status: 'error' };
        if (U.cmp(latest, cur) <= 0) { U.apk = null; return { status: 'current', version: cur.join('.') }; }
        var url = APK_FALLBACK;
        (rel.assets || []).forEach(function (a) { if (a && a.name === 'moxie.apk' && a.browser_download_url) url = a.browser_download_url; });
        U.apk = { tag: String(rel.tag_name), version: latest.join('.'), notes: U.plain(rel.body), url: url, page: rel.html_url || '' };
        U.dismissed = false;
        return { status: 'new', version: U.apk.tag };
      }).catch(function (e) { return { status: 'error', error: String(e && e.message || e) }; });
    },
    // native: MoBridge.downloadAndInstall(url) reports back with `mo-update` window events
    startUpdate: function () {
      var b = U.bridge();
      if (!U.apk || !b || typeof b.downloadAndInstall !== 'function') return false;
      U.onNative({ state: 'downloading', progress: 0 });
      var r;
      try { r = String(b.downloadAndInstall(U.apk.url)); } catch (e) { r = 'error:' + (e && e.message || e); }
      if (/^error/.test(r)) U.onNative({ state: 'error', message: r.replace(/^error:?\s*/, '') });
      return true;
    },
    onNative: function (d) {
      d = d || {};
      U.dl = { state: String(d.state || 'idle'), progress: Math.max(0, Math.min(100, +d.progress || 0)), message: String(d.message || '') };
      U.paint();
    },
    statusText: function () {
      var d = U.dl;
      switch (d.state) {
        case 'downloading': return MX.t('下載中… {n}%', { n: Math.round(d.progress) });
        case 'downloaded': case 'installing': return MX.t('下載完成，正在開啟安裝程式…');
        case 'permission': return MX.t('請在設定中允許本 App「安裝未知應用程式」，然後返回，再按一次「更新」。');
        case 'error': return MX.t('更新失敗：{msg}。可改用下方「用瀏覽器下載」。', { msg: d.message || MX.t('未知錯誤') });
        case 'canceled': return MX.t('已取消。');
        default: return '';
      }
    },
    // update the open card in place (no re-render, no animation)
    paint: function () {
      var st = document.querySelector('[data-role=upd-status]'), btn = document.querySelector('[data-role=apk-update] [data-act=update]');
      if (st) st.textContent = U.statusText();
      if (btn) btn.disabled = U.dl.state === 'downloading';
    },
    // the card of the home screen ('' when nothing to offer)
    apkCard: function () {
      if (!U.apk || U.dismissed) return null;
      var a = U.apk;
      return h('div', { class: 'card update', 'data-role': 'apk-update' }, [
        h('div', { class: 't', text: MX.t('有新版本 {tag}', { tag: a.tag }) }),
        h('div', { class: 'm', text: MX.t('目前版本 {ver} · 更新會保留所有抄寫資料', { ver: (U.parse(U.current()) || ['?']).join('.') }) }),
        a.notes ? h('div', { class: 'notes', 'data-role': 'upd-notes', text: a.notes }) : null,
        h('div', { class: 'btnrow' }, [
          h('button', { class: 'on big', 'data-act': 'update', text: MX.t('更新'), disabled: U.dl.state === 'downloading' ? true : null, onclick: function () { U.startUpdate(); } }),
          h('button', { 'data-act': 'later', text: MX.t('稍後'), onclick: function () { U.dismissed = true; if (MX.route) MX.route(); } }),
          h('a', { class: 'btnlink plain', 'data-act': 'update-browser', href: a.url, text: MX.t('用瀏覽器下載') })
        ]),
        h('div', { class: 'note', 'data-role': 'upd-status', text: U.statusText() })
      ]);
    },

    // ---- library
    checkLib: function (manual) {
      if (!U.bridge()) return Promise.resolve({ status: 'unsupported' });
      if (!manual && !U.due('lib')) return Promise.resolve({ status: 'skipped' });
      return fetch(PAGES_LIB + 'index.json', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (raw) {
        U.setStamp('lib');
        var rem = MX.Library.normIndex(raw), have = MX.Library.index;
        if (!(rem.version > MX.Library.version())) { U.lib = null; return { status: 'current', version: MX.Library.version() }; }
        var local = {};
        have.texts.forEach(function (e) { local[e.id] = JSON.stringify(e); });
        var entries = rem.texts.filter(function (e) { return local[e.id] !== JSON.stringify(e); });
        U.lib = { version: rem.version, raw: raw, entries: entries, n: entries.length };
        U.libState = { state: 'idle', done: 0, total: entries.length };
        return { status: 'new', version: rem.version };
      }).catch(function (e) { return { status: 'error', error: String(e && e.message || e) }; });
    },
    // download the new / changed texts, then switch to the new index (all or nothing)
    downloadLib: async function () {
      var lib = U.lib;
      if (!lib || U.libState.state === 'running') return false;
      U.libState = { state: 'running', done: 0, total: lib.entries.length };
      U.paintLib();
      var texts = {};
      try {
        for (var i = 0; i < lib.entries.length; i++) {
          var e = lib.entries[i], r = await fetch(PAGES_LIB + e.file, { cache: 'no-store' });
          if (!r.ok) throw new Error(e.file + ' ' + r.status);
          var t = await r.json();
          if (!t || t.id !== e.id) throw new Error('bad text ' + e.id);
          texts[e.id] = t;
          U.libState.done = i + 1;
          U.paintLib();
        }
        MX.Library.setOta(lib.raw, texts);
        U.libState = { state: 'done', done: lib.entries.length, total: lib.entries.length };
        U.lib = null;
      } catch (err) {
        U.libState = { state: 'error', done: U.libState.done, total: lib.entries.length, message: String(err && err.message || err) };
      }
      if (MX.route) MX.route();
      return U.libState.state === 'done';
    },
    libStatusText: function () {
      var s = U.libState;
      if (s.state === 'running') return MX.t('下載中… {done} / {total}', { done: s.done, total: s.total });
      if (s.state === 'error') return MX.t('下載失敗：{msg}。請稍後再試。', { msg: s.message || '' });
      if (s.state === 'done') return MX.t('字帖庫已更新。');
      return '';
    },
    paintLib: function () {
      var st = document.querySelector('[data-role=lib-status]'), btn = document.querySelector('[data-role=lib-update] [data-act=lib-download]');
      if (st) st.textContent = U.libStatusText();
      if (btn) btn.disabled = U.libState.state === 'running';
    },
    libCard: function () {
      if (!U.lib) return null;
      return h('div', { class: 'card update', 'data-role': 'lib-update' }, [
        h('div', { class: 't', text: MX.t('字帖庫有更新') }),
        h('div', { class: 'm', text: MX.t('字帖庫版本 {ver}（目前 {cur}）· 新增或更新 {n} 篇', { ver: U.lib.version, cur: MX.Library.version(), n: U.lib.n }) }),
        h('div', { class: 'btnrow' }, [
          h('button', { class: 'on big', 'data-act': 'lib-download', text: MX.t('下載'), disabled: U.libState.state === 'running' ? true : null, onclick: function () { U.downloadLib(); } })
        ]),
        h('div', { class: 'note', 'data-role': 'lib-status', text: U.libStatusText() })
      ]);
    },

    // Launch check: silent, at most once per 24 h per kind; re-renders the home screen when something was found.
    auto: function () {
      if (!U.bridge()) return Promise.resolve();
      return Promise.all([U.checkApk(false), U.checkLib(false)]).then(function (res) {
        if (res.some(function (r) { return r.status === 'new'; }) && MX.route && MX.isHome && MX.isHome()) MX.route();
      });
    }
  };
  window.addEventListener('mo-update', function (e) { U.onNative(e && e.detail); });
})();
