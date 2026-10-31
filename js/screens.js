(function () {
  'use strict';
  var MX = window.MX, h = MX.h, Model = MX.Model, Store = MX.Store, Lib = MX.Library;
  var S = MX.Screens = {};
  var APK_URL = 'https://github.com/chitintim/chinese-handwriting-app/releases/latest/download/moxie.apk';
  var RELEASES_URL = 'https://github.com/chitintim/chinese-handwriting-app/releases';     // the fallback when the APK link does nothing
  var ADV_KEY = 'setupAdv:v2';       // 進階選項 of the setup screen is open (device-local: not in a backup)
  var GITHUB_URL = 'https://github.com/chitintim/chinese-handwriting-app';       // 關於 · GitHub (the APK's WebView hands every external https link to the system browser: MainActivity.handleNavigation)
  var ROW_H = 98;          // one list row (88 px + 10 px margin, see .lrow)
  var ROW_H_PHONE = 140;   // the same in the phone layout (132 px + 8 px margin)
  var CROW_H = 84;         // one compact shelf row on the home screen (76 px + 8 px margin, .lrow.compact)
  var WIDE_CARDS = 4;      // cards per shelf row on the wide (laptop) layout
  var SHELF_MAX = 3;       // rows of a shelf on the home screen (the rest is behind 全部)

  // A screen: top bar = 返回 (top left, never at the bottom edge), title, extra buttons (right); then an optional breadcrumb line crumbs = [[label, hash], ...] (the last one is the page itself).
  function screen(root, title, backHash, extra, crumbs) {
    var el = h('div', { class: 'screen' });
    var top = h('div', { class: 'topbar' });
    if (backHash) top.appendChild(h('button', { text: '返回', class: 'backbtn', 'data-act': 'back', onclick: function () { location.hash = backHash; } }));
    top.appendChild(h('h1', { class: 'grow', text: title }));
    if (extra) extra.forEach(function (n) { top.appendChild(n); });
    el.appendChild(top);
    if (crumbs && crumbs.length) el.appendChild(crumbRow(crumbs));
    root.appendChild(el);
    return el;
  }
  function crumbRow(crumbs) {
    var row = h('div', { class: 'crumbs', 'data-role': 'crumbs' });
    crumbs.forEach(function (c, i) {
      if (i) row.appendChild(h('span', { class: 'sep', text: '〉' }));
      if (i < crumbs.length - 1) row.appendChild(h('button', { class: 'crumb', 'data-act': 'crumb', text: c[0], onclick: function () { location.hash = c[1]; } }));
      else row.appendChild(h('span', { class: 'here', text: c[0] }));
    });
    return row;
  }
  function assign(t, s) { Object.keys(s).forEach(function (k) { t[k] = s[k]; }); return t; }

  // ---- routes: #/<name>/<a>/<b>?query ; ids are URL-encoded
  function H(name, a, b, q) {
    return '#/' + [name, a, b].filter(Boolean).map(encodeURIComponent).join('/') + (q ? '?' + q : '');
  }
  S.hash = H;
  function qs(query) {
    var o = {};
    String(query || '').split('&').forEach(function (p) { if (p) { var i = p.indexOf('='); o[decodeURIComponent(i < 0 ? p : p.slice(0, i))] = i < 0 ? '' : decodeURIComponent(p.slice(i + 1)); } });
    return o;
  }
  function libScript() { return Model.settings.libScript === 'simp' ? 'simp' : 'trad'; }
  function T(v) { return v ? (v[libScript()] || v.trad || '') : ''; }
  function uiFont(script) { return MX.Draw.uiFam(script || libScript()); }
  // where 返回 goes from a text's pages: its chapter list, or its category
  S.backFor = function (textId) {
    var e = Lib.entry(textId);
    if (!e) return '#/';
    if (e.custom) return H('lib', Lib.CUSTOM);
    return e.sections > 1 ? H('text', textId) : H('lib', e.category);
  };
  function catCrumbs(e) {
    var cat = e ? Lib.category(e.custom ? Lib.CUSTOM : e.category) : null;
    return [['首頁', '#/'], [cat ? T(cat.title) : '書庫', cat ? H('lib', cat.id) : '#/']];
  }
  function dateOf(ts) { return ts ? MX.fmtDate(ts) : '—'; }

  // ---- paged lists (no scrolling on e-ink): as many rows as fit below what is already on the screen. A list is re-rendered in place (search, sort, pager) and keeps its state
  // in the URL (history.replaceState: Back never steps through pages). o = {state:{p,...}, rows(state)->nodes, link(state)->hash, rowH, reserve, empty(state)->node}
  function pagedHost(el, o) {
    var host = h('div', { 'data-role': 'listhost' }), st = o.state, rowH = o.rowH || (MX.Device.isPhone() ? ROW_H_PHONE : ROW_H), reserve = o.reserve === undefined ? 80 : o.reserve;
    el.appendChild(host);
    function sync() { try { history.replaceState(null, '', o.link(st)); } catch (e) { /* ignore */ } }
    function render() {
      host.innerHTML = '';
      var rows = o.rows(st);
      if (!rows.length) { if (o.empty) host.appendChild(o.empty(st)); return; }
      var top = host.getBoundingClientRect().top + 2, pb = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      var per = Math.max(3, Math.min(40, Math.floor((el.clientHeight - pb - top - reserve) / rowH)));
      if (MX.Device.isWide()) per *= 2;       // two columns on the wide layout
      var pages = Math.max(1, Math.ceil(rows.length / per));
      st.p = MX.clamp(parseInt(st.p, 10) || 1, 1, pages);
      var box = h('div', { 'data-role': 'list', 'data-per': per });
      rows.slice((st.p - 1) * per, st.p * per).forEach(function (r) { box.appendChild(r); });
      host.appendChild(box);
      if (pages > 1) {
        host.appendChild(h('div', { class: 'pager', 'data-role': 'pager' }, [
          h('button', { 'data-act': 'ppage-prev', text: '上一頁', disabled: st.p <= 1 ? true : null, onclick: function () { st.p--; render(); sync(); } }),
          h('div', { class: 'ctr', 'data-role': 'pager-ctr', text: st.p + ' / ' + pages }),
          h('button', { 'data-act': 'ppage-next', text: '下一頁', disabled: st.p >= pages ? true : null, onclick: function () { st.p++; render(); sync(); } })
        ]));
      }
    }
    return { render: render, sync: sync, host: host, state: st };
  }
  function empty(msg, hint) {
    return h('div', { class: 'empty', 'data-role': 'empty' }, [h('div', { class: 'et', text: msg }), hint ? h('div', { class: 'eh', text: hint }) : null]);
  }
  // a list row: main part (title, meta; tap = primary) + buttons [{label, act, primary, onclick} | {node}]
  function lrow(o) {
    var main = h('div', { class: 'lmain', onclick: o.open }, [
      h('div', { class: 't', text: o.title, 'data-role': 'title' }),
      h('div', { class: 'm', 'data-role': 'meta', text: o.meta || '' }),
      o.pct === undefined ? null : h('div', { class: 'lbar', 'data-role': 'card-bar' }, [h('i', { style: 'width:' + o.pct + '%' })])      // only the wide layout's cards show it
    ]);
    if (o.font) main.style.cssText = 'font-family:' + o.font;
    var btns = h('div', { class: 'lbtns' });
    (o.buttons || []).forEach(function (b) {
      btns.appendChild(b.node || h('button', { class: b.primary ? 'on' : '', 'data-act': b.act, text: b.label, onclick: b.onclick }));
    });
    var attrs = { class: 'lrow' + (o.compact ? ' compact' : '') };
    Object.keys(o.attrs || {}).forEach(function (k) { attrs[k] = o.attrs[k]; });
    return h('div', attrs, [main, btns]);
  }
  function pctOf(copy) { return copy && copy.total ? Math.floor(100 * copy.filled / copy.total) : 0; }
  function notesBtn(textId, sectionId, script) {
    return { label: '解說', act: 'notes', onclick: function () { location.hash = H('notes', textId, sectionId || 'main'); } };
  }

  // 匯出 for a copy from a list (loads its text and ink first): the 匯出作品 sheet
  S.exportCopy = async function (c) {
    var txt = await Lib.getView(c.textId, Model.sid(c));
    Model.loadInk(c);
    Model.upgradeKeys(c, txt);
    MX.Export.openSheet(MX.Export.ctx(c, txt, MX.Layout.cellsFor(txt, c)));
  };
  function exportBtn(c) { return { label: '匯出', act: 'export', onclick: function () { S.exportCopy(c).catch(function (e) { MX.err(e); MX.toast('匯出失敗'); }); } }; }

  // buttons of a (text, section) row: 繼續/開始, 解說 (when there are notes), 收藏
  function sectionButtons(textId, sectionId, favSec, onFav) {
    var copy = Model.activeCopy(textId, sectionId), bs = [];
    bs.push({ label: copy ? '繼續' : '開始', act: 'start', primary: true,
      onclick: function () { location.hash = copy ? H('practice', copy.id) : H('setup', textId, sectionId); } });
    if (Lib.hasNotes(textId, sectionId)) bs.push(notesBtn(textId, sectionId));
    if (copy && copy.filled > 0) bs.push(exportBtn(copy));
    bs.push({ node: MX.favButton(textId, favSec, onFav) });
    return bs;
  }
  function sectionMeta(textId, sectionId, chars, prefix) {
    var copy = Model.activeCopy(textId, sectionId);
    return (prefix ? prefix + ' · ' : '') + chars + '字 · 進度 ' + pctOf(copy) + '% · 已抄 ' + Model.doneCount(textId, sectionId) + ' 遍';
  }
  function scriptOf(textId, sectionId) {
    var copy = Model.activeCopy(textId, sectionId);
    return copy ? copy.cfg.script : libScript();
  }
  function startHash(textId, sectionId) {
    var c = Model.activeCopy(textId, sectionId);
    return c ? H('practice', c.id) : H('setup', textId, sectionId);
  }
  // title of "text · section" for a multi-section text, filled in once the text is loaded
  function refineTitle(row, textId, sectionId) {
    Lib.getText(textId).then(function (t) {
      var sec = t.sections.filter(function (s) { return s.id === sectionId; })[0];
      var el = row.querySelector('[data-role=title]');
      if (sec && el && row.parentNode) el.textContent = T(t.title) + (t.sections.length > 1 ? ' · ' + T(sec.title) : '');
    }).catch(function () { /* the text title stays */ });
  }

  // ---- the shelves (home + their full pages)
  function resumeRow(c, compact) {
    var e = Lib.entry(c.textId);
    var r = lrow({
      title: T(e.title), meta: '進度 ' + pctOf(c) + '% · 最後書寫 ' + dateOf(c.updatedAt), font: uiFont(c.cfg.script), compact: compact, pct: pctOf(c),
      attrs: { 'data-role': 'resume', 'data-copy': c.id, 'data-text': null }, open: function () { location.hash = H('practice', c.id); },
      buttons: [{ label: '繼續', act: 'resume', primary: true, onclick: function () { location.hash = H('practice', c.id); } }, exportBtn(c)]
    });
    if (e.sections > 1) refineTitle(r, c.textId, Model.sid(c));
    return r;
  }
  function favRow(f, compact, onFav) {
    var e = Lib.entry(f.textId);
    if (!e) return null;
    var multi = e.sections > 1, sec = f.sectionId, r;
    if (sec) {
      var copy = Model.activeCopy(f.textId, sec);
      r = lrow({
        title: T(e.title), meta: '進度 ' + pctOf(copy) + '% · 已抄 ' + Model.doneCount(f.textId, sec) + ' 遍', font: uiFont(scriptOf(f.textId, sec)), compact: compact, pct: pctOf(copy),
        attrs: { 'data-role': 'fav', 'data-fav-text': f.textId, 'data-fav-section': sec }, open: function () { location.hash = startHash(f.textId, sec); },
        buttons: [{ label: copy ? '繼續' : '開始', act: 'start', primary: true, onclick: function () { location.hash = startHash(f.textId, sec); } },
          { node: MX.favButton(f.textId, sec, onFav) }]
      });
      refineTitle(r, f.textId, sec);
      return r;
    }
    var byline = [T(e.author), T(e.dynasty)].filter(Boolean).join(' ');
    var prog = multi ? Math.floor(100 * Model.textProgress(f.textId, e.sections)) : pctOf(Model.activeCopy(f.textId, 'main'));
    return lrow({
      title: T(e.title), meta: (byline ? byline + ' · ' : '') + e.chars + '字 · 進度 ' + prog + '%', font: uiFont(), compact: compact, pct: prog,
      attrs: { 'data-role': 'fav', 'data-fav-text': f.textId }, open: function () { location.hash = multi ? H('text', f.textId) : startHash(f.textId, 'main'); },
      buttons: [multi ? { label: '章節', act: 'sections', primary: true, onclick: function () { location.hash = H('text', f.textId); } }
        : { label: Model.activeCopy(f.textId, 'main') ? '繼續' : '開始', act: 'start', primary: true, onclick: function () { location.hash = startHash(f.textId, 'main'); } },
        { node: MX.favButton(f.textId, null, onFav) }]
    });
  }
  function resumeItems() { return Model.recent().filter(function (c) { return Lib.entry(c.textId); }); }
  function favItems() { return Model.favs().filter(function (f) { return Lib.entry(f.textId); }); }

  // ------------------------------------------------------------------ home
  S.home = function (root, query) {
    var el = screen(root, '墨 · 抄經', null, [
      h('button', { text: '搜尋', 'data-act': 'search', onclick: function () { location.hash = '#/search'; } }),
      h('button', { text: '筆測', 'data-act': 'pentest', onclick: function () { location.hash = '#/pentest'; } }),
      h('button', { text: '設定', 'data-act': 'settings', onclick: function () { location.hash = '#/settings'; } })
    ]);
    el.setAttribute('data-screen', 'home');
    if (MX.updateReady) {
      el.appendChild(h('div', { class: 'card update', 'data-role': 'update' }, [
        h('div', { class: 'm', text: '有新版本可用。', style: 'margin-bottom:8px' }),
        h('button', { class: 'on big', 'data-act': 'reload', text: '重新載入以更新', onclick: function () { location.reload(); } })
      ]));
    }
    // iOS Safari, not installed to the Home Screen: the browser may delete site data after about 7 days without a visit
    if (MX.Device.needsInstallTip()) {
      el.appendChild(h('div', { class: 'card tip', 'data-role': 'ios-tip' }, [
        h('div', { class: 't', text: '加到主畫面，保護你的字跡' }),
        h('div', { class: 'm', text: 'Safari 可能在約 7 天沒開啟後清除網站資料。請按分享鈕，選「加入主畫面」，之後從主畫面圖示開啟：字跡才會長期保存，也能全螢幕書寫。也請定期到「設定 → 資料」匯出備份。' }),
        h('div', { class: 'btnrow' }, [
          h('button', { class: 'on', text: '知道了', 'data-act': 'tip-ok', onclick: function () { MX.Device.dismissInstallTip(); MX.route(); } }),
          h('button', { text: '去備份', 'data-act': 'tip-backup', onclick: function () { MX.Device.dismissInstallTip(); location.hash = '#/settings'; } })
        ])
      ]));
    }
    var apkCard = MX.Update.apkCard(), libCard = MX.Update.libCard();
    if (apkCard) el.appendChild(apkCard);
    if (libCard) el.appendChild(libCard);

    // shelves: 繼續書寫 and 收藏. Their rows are added last, as many as the screen has room for (see below). Landscape: shelves left, 書庫 right.
    var wrap = h('div', { class: 'homewrap' }), colA = h('div', { class: 'hcol' }), colB = h('div', { class: 'hcol' });
    wrap.appendChild(colA); wrap.appendChild(colB);
    el.appendChild(wrap);
    var rItems = resumeItems(), fItems = favItems();
    function shelf(kind, title, items, emptyMsg) {
      var box = h('div', { class: 'shelf', 'data-shelf': kind });
      var head = h('div', { class: 'shead' }, [h('h2', { text: title, 'data-role': 'shelf-title' })]);
      if (items.length) head.appendChild(h('button', { 'data-act': 'shelf-all', text: '全部 ' + items.length, onclick: function () { location.hash = H('shelf', kind); } }));
      box.appendChild(head);
      var rows = h('div', { 'data-role': 'shelf-rows' });
      box.appendChild(rows);
      if (!items.length) rows.appendChild(h('div', { class: 'note', 'data-role': 'shelf-empty', text: emptyMsg }));
      colA.appendChild(box);
      return rows;
    }
    var rRows = shelf('resume', '繼續書寫', rItems, '還沒有進行中的字帖。從下面的書庫選一篇開始。');
    var fRows = shelf('fav', '收藏', fItems, '還沒有收藏。點文本或章節旁的星號，加進這裡。');

    // 書庫: category tiles
    colB.appendChild(h('div', { class: 'shead' }, [h('h2', { text: '書庫' })]));
    var tiles = h('div', { class: 'tiles', 'data-role': 'tiles' });
    Lib.categories().forEach(function (c) {
      var n = Lib.texts(c.id).length, done = 0;
      Lib.texts(c.id).forEach(function (e) { done += Model.doneCount(e.id); });
      var meta = c.custom ? (n ? n + ' 篇' : '貼上文字') : n + ' 篇';
      var t = h('button', { class: 'tile', 'data-cat': c.id, 'data-act': 'open', style: 'font-family:' + uiFont(), onclick: function () { location.hash = H('lib', c.id); } }, [
        h('div', { class: 't', text: T(c.title) }),
        h('div', { class: 'm', text: meta, title: done ? '已抄 ' + done + ' 遍' : null })
      ]);
      tiles.appendChild(t);
    });
    if (!tiles.children.length) tiles.appendChild(h('p', { text: '文庫是空的。' }));
    colB.appendChild(tiles);
    if (!window.MoBridge) {
      // hosted web app only: offer the Android app (hidden inside the APK)
      el.appendChild(h('div', { class: 'card install compactcard', 'data-role': 'apk-install' }, [
        h('div', { class: 'ct' }, [h('div', { class: 't', text: '安裝 App (APK)' }), h('div', { class: 'm', text: '安裝到平板，可離線使用。' })]),
        h('a', { class: 'btnlink', 'data-act': 'apk', href: APK_URL, text: '安裝 App (APK)' }),
        h('a', { class: 'btnlink plain', 'data-act': 'apk-help', href: 'download/', text: '安裝步驟' }),
        // a plain link (no download attribute, no target): the browser's own download manager handles it; if nothing happens, the note says what to do
        h('div', { class: 'note apkfb', 'data-role': 'apk-fallback' }, ['若下載無反應：長按連結 → 下載連結，或開啟 ', h('a', { class: 'flink', 'data-act': 'apk-releases', href: RELEASES_URL, text: 'GitHub Releases 頁面' })])
      ]));
    }
    var ver = (document.querySelector('meta[name=mx-version]') || {}).content || '';
    el.appendChild(h('div', { class: 'note vernote', text: '版本 ' + ver + ' · 字帖庫 ' + Lib.version() + ' · 儲存：' + Store.mode() }));
    // the intro card at the very end of the screen (inside the .screen bottom padding: never in the bottom edge dead zone; wide layout: a two-column card under the header). Black text.
    // Title, a short story (English + 中文), the ask, and two separate big links: 關於與隨喜 (opens the intro dialog) and GitHub. On the 電子紙 tablet the 中文 line comes first and the English one is smaller (keeps the shelves above the fold).
    var compactIntro = !MX.Device.isWide() && !MX.Device.isPhone() && Model.settings.screenType === 'eink';
    var iEn = h('p', { class: 'ien', lang: 'en', 'data-role': 'intro-en', text: 'Hey, it\'s Tim 👋 I vibe-coded this while sitting with my mom in hospital. She\'s a devoted Buddhist, and 抄心經 is close to her heart. It started as one sutra and grew into a little library of texts to trace.' });
    var iZh = h('p', { class: 'izh', lang: 'zh', 'data-role': 'intro-zh', text: '在醫院陪媽媽的日子裡做的小工具，由一篇《心經》開始，慢慢變成一個小字帖庫。' });
    el.appendChild(h('div', { class: 'intro' + (compactIntro ? ' compact' : ''), 'data-role': 'home-intro' }, [
      h('div', { class: 'i1', 'data-role': 'intro-title', text: '墨字帖 · 抄經、臨帖的描紅練習' }),
      h('div', { class: 'ibodies' }, compactIntro ? [iZh, iEn] : [iEn, iZh]),
      h('div', { class: 'i3', 'data-role': 'intro-ask', text: 'Free, always. If you like it, please consider a kind donation to Dana-Farber, or a visit to 西方寺 — 如覺得有用，歡迎隨喜。' }),
      h('div', { class: 'i4', 'data-role': 'intro-links' }, [
        h('a', { class: 'ilink', 'data-act': 'about', href: '#/about', onclick: function (e) { e.preventDefault(); if (MX.Intro) MX.Intro.open(); } }, ['關於與隨喜', MX.icon('tri-r', 12)]),
        h('a', { class: 'ilink', 'data-act': 'github', href: GITHUB_URL, target: '_blank', rel: 'noopener', text: 'GitHub' })
      ])
    ]));

    // rows: whatever height is left, shared between the two shelves (at least one row each when they have any)
    if (rItems.length) rRows.innerHTML = '';
    if (fItems.length) fRows.innerHTML = '';
    var last = el.lastElementChild, pb = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    var left = el.clientHeight - pb - (last ? last.getBoundingClientRect().bottom : 0) - 6;
    if (getComputedStyle(wrap).display === 'flex') left += Math.max(0, colB.getBoundingClientRect().bottom - colA.getBoundingClientRect().bottom);     // side by side: the shelves may grow down to the end of the 書庫 column
    if (MX.Device.isWide()) {
      // wide layout: each shelf is one row of WIDE_CARDS uniform cards (the rest is behind 全部)
      rItems.slice(0, WIDE_CARDS).forEach(function (c) { rRows.appendChild(resumeRow(c, true)); });
      fItems.slice(0, WIDE_CARDS).forEach(function (f) { var r = favRow(f, true, function () { MX.route(); }); if (r) fRows.appendChild(r); });
    } else if (rItems.length || fItems.length) {
      var total = Math.max(0, Math.floor(left / (MX.Device.isPhone() ? 132 : CROW_H))), a = 0, b = 0, progress = true;
      if (rItems.length) a = 1;
      if (fItems.length) b = 1;
      total -= a + b;
      while (total > 0 && progress) {
        progress = false;
        if (a < rItems.length && a < SHELF_MAX && total > 0) { a++; total--; progress = true; }
        if (b < fItems.length && b < SHELF_MAX && total > 0) { b++; total--; progress = true; }
      }
      rItems.slice(0, a).forEach(function (c) { rRows.appendChild(resumeRow(c, true)); });
      fItems.slice(0, b).forEach(function (f) {
        var r = favRow(f, true, function () { MX.route(); });
        if (r) fRows.appendChild(r);
      });
    }
  };

  // ------------------------------------------------------------------ a full shelf (all copies in progress / all favourites)
  S.shelf = function (root, kind, query) {
    var isFav = kind === 'fav', title = isFav ? '收藏' : '繼續書寫';
    var el = screen(root, title, '#/', null, [['首頁', '#/'], [title, H('shelf', kind)]]);
    el.setAttribute('data-screen', 'shelf');
    el.setAttribute('data-shelf', kind);
    var q = qs(query), pl;
    pl = pagedHost(el, {
      state: { p: parseInt(q.p, 10) || 1 }, link: function (st) { return H('shelf', kind, null, st.p > 1 ? 'p=' + st.p : ''); },
      rows: function () {
        if (!isFav) return resumeItems().map(function (c) { return resumeRow(c, false); });
        return favItems().map(function (f) { return favRow(f, false, function () { pl.render(); }); }).filter(Boolean);
      },
      empty: function () { return isFav ? empty('還沒有收藏', '點文本或章節旁的星號，加進這裡。') : empty('還沒有進行中的字帖', '從書庫選一篇開始。'); }
    });
    pl.render();
  };

  // ------------------------------------------------------------------ text lists: a category, and the search page
  var SORTS = [['def', '預設'], ['chars', '字數'], ['prog', '進度']];
  function textProgressOf(e) {
    return e.sections > 1 ? Model.textProgress(e.id, e.sections) : Model.copyFrac(Model.activeCopy(e.id, 'main'));
  }
  function sortEntries(list, mode) {
    var idx = list.map(function (e, i) { return { e: e, i: i, prog: textProgressOf(e) }; });
    if (mode === 'chars') idx.sort(function (a, b) { return (b.e.chars - a.e.chars) || (a.i - b.i); });
    else if (mode === 'prog') idx.sort(function (a, b) { return (b.prog - a.prog) || (a.i - b.i); });
    return idx.map(function (x) { return x.e; });
  }
  function matches(e, q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return true;
    return [e.title, e.author, e.dynasty].some(function (v) { return v && ((v.trad || '').toLowerCase().indexOf(q) >= 0 || (v.simp || '').toLowerCase().indexOf(q) >= 0); });
  }
  function textRow(e, onFav) {
    var multi = e.sections > 1, buttons = [], meta, custom = !!e.custom;
    var byline = [T(e.author), T(e.dynasty)].filter(Boolean).join(' ');
    if (multi) {
      meta = (byline ? byline + ' · ' : '') + e.chars + '字 · ' + e.sections + '章 · 已完成 ' + Model.sectionsDone(e.id) + '/' + e.sections + ' · 進度 ' +
        Math.floor(100 * Model.textProgress(e.id, e.sections)) + '% · 已抄 ' + Model.doneCount(e.id) + ' 遍' + (Lib.hasNotes(e.id) ? ' · 有解說' : '');
      buttons.push({ label: '章節', act: 'sections', primary: true, onclick: function () { location.hash = H('text', e.id); } });
      buttons.push({ node: MX.favButton(e.id, null, onFav) });
    } else {
      meta = sectionMeta(e.id, 'main', e.chars, byline);
      buttons = sectionButtons(e.id, 'main', null, onFav);
    }
    if (custom) buttons.splice(buttons.length - 1, 0, { label: '編輯', act: 'edit-custom', onclick: function () { location.hash = H('custom', e.id); } });
    return lrow({
      title: T(e.title), meta: meta, font: uiFont(multi ? libScript() : scriptOf(e.id, 'main')), attrs: { 'data-text': e.id },
      open: function () { location.hash = multi ? H('text', e.id) : startHash(e.id, 'main'); },
      buttons: buttons
    });
  }
  // sort (預設 / 字數 / 進度) + title search box; `entries` = function returning the candidate entries
  function textList(el, o) {
    var q0 = qs(o.query), st = { p: parseInt(q0.p, 10) || 1, s: SORTS.some(function (x) { return x[0] === q0.s; }) ? q0.s : 'def', q: q0.q || '' }, pl;
    var ctl = h('div', { class: 'ctl', 'data-role': 'controls' });
    var seg = null;
    if (o.sortable !== false) {
      seg = MX.Form.seg(SORTS, st.s, function (v) { st.s = v; st.p = 1; pl.render(); pl.sync(); }, false);
      ctl.appendChild(MX.Form.row('排序', seg, 'sort'));
    }
    var input = h('input', { type: 'text', value: st.q, placeholder: '搜尋書名、作者、朝代', 'data-role': 'search', 'aria-label': '搜尋', maxlength: '30' });
    input.addEventListener('input', function () { st.q = input.value; st.p = 1; pl.render(); pl.sync(); });
    ctl.appendChild(h('div', { class: 'frow searchrow', 'data-k': 'search' }, [input]));
    el.appendChild(ctl);
    pl = pagedHost(el, {
      state: st, link: function (s) { return o.link(s); },
      rows: function (s) {
        var list = o.entries().filter(function (e) { return matches(e, s.q); });
        if (!String(s.q || '').trim() && o.needQuery) return [];
        return sortEntries(list, s.s).map(function (e) { return textRow(e, function () { /* the star flips in place */ }); });
      },
      empty: function (s) { return o.empty(s); }
    });
    pl.render();
    return { input: input, pl: pl };
  }

  S.category = function (root, catId, query) {
    var cat = Lib.category(catId);
    if (!cat) { location.hash = '#/'; return; }
    var custom = catId === Lib.CUSTOM;
    var el = screen(root, T(cat.title), '#/', null, [['首頁', '#/'], [T(cat.title), H('lib', catId)]]);
    el.setAttribute('data-screen', 'category');
    el.setAttribute('data-cat', catId);
    if (custom) {
      el.appendChild(h('div', { class: 'btnrow' }, [h('button', { class: 'on big', 'data-act': 'new-custom', text: '新增自訂文本', onclick: function () { location.hash = H('custom', 'new'); } })]));
      el.appendChild(h('div', { class: 'note', text: '貼上任何文字，繁體、簡體都照原樣使用。只存在這台裝置，會包含在資料備份中。' }));
    }
    textList(el, {
      query: query, entries: function () { return Lib.texts(catId); }, link: function (s) { return H('lib', catId, null, listQuery(s)); },
      empty: function (s) { return s.q ? empty('找不到「' + s.q + '」', '換個關鍵字，或清除搜尋。') : empty(custom ? '還沒有自訂文本' : '這個分類沒有文本', custom ? '按上面的「新增自訂文本」貼上自己的文字。' : ''); }
    });
  };
  function listQuery(s) {
    var a = [];
    if (s.p > 1) a.push('p=' + s.p);
    if (s.s && s.s !== 'def') a.push('s=' + s.s);
    if (s.q) a.push('q=' + encodeURIComponent(s.q));
    return a.join('&');
  }

  S.search = function (root, query) {
    var el = screen(root, '搜尋', '#/', null, [['首頁', '#/'], ['搜尋', '#/search']]);
    el.setAttribute('data-screen', 'search');
    var r = textList(el, {
      query: query, needQuery: true, entries: function () { return ((Lib.index && Lib.index.texts) || []).concat(Lib.texts(Lib.CUSTOM)); },
      link: function (s) { return H('search', null, null, listQuery(s)); },
      empty: function (s) { return s.q ? empty('找不到「' + s.q + '」', '試試書名的一個字，如「心」「論」。') : empty('輸入書名、作者或朝代', '找到的文本會列在這裡（含自訂文本）。'); }
    });
    try { r.input.focus(); } catch (e) { /* ignore */ }
  };

  // ------------------------------------------------------------------ text: its sections
  S.text = function (root, textId, query) {
    var entry = Lib.entry(textId);
    if (!entry) { location.hash = '#/'; return; }
    var cats = catCrumbs(entry);
    var extra = [MX.favButton(textId, null, null, true)];
    if (Model.archived(textId).length) extra.push(h('button', { text: '存檔 (' + Model.archived(textId).length + ')', 'data-act': 'archives', onclick: function () { location.hash = H('archives', textId); } }));
    var el = screen(root, T(entry.title), H('lib', entry.custom ? Lib.CUSTOM : entry.category), extra, cats.concat([[T(entry.title), H('text', textId)]]));
    el.setAttribute('data-screen', 'text');
    el.setAttribute('data-text-id', textId);
    var byline = [T(entry.author), T(entry.dynasty)].filter(Boolean).join(' ');
    if (byline) el.appendChild(h('div', { class: 'note', text: byline }));
    if (T(entry.description)) el.appendChild(h('div', { class: 'note', text: T(entry.description) }));
    var sum = h('div', { class: 'note', 'data-role': 'summary' });
    el.appendChild(sum);
    Lib.getText(textId).then(function (text) {
      if (!el.parentNode) return;
      var doneSecs = 0, total = text.sections.length;
      text.sections.forEach(function (s) { if (Model.doneCount(textId, s.id) > 0) doneSecs++; });
      sum.textContent = '共 ' + total + ' 章 · ' + entry.chars + ' 字 · 已完成 ' + doneSecs + ' / ' + total + ' 章 · 已抄 ' + Model.doneCount(textId) + ' 遍';
      el.appendChild(h('div', { class: 'bar', style: 'margin-top:0' }, [h('i', { style: 'width:' + Math.floor(100 * doneSecs / total) + '%' })]));
      var q = qs(query);
      var pl = pagedHost(el, {
        state: { p: parseInt(q.p, 10) || 1 }, link: function (st) { return H('text', textId, null, st.p > 1 ? 'p=' + st.p : ''); },
        rows: function () {
          return text.sections.map(function (s) {
            var sec = s, by = sec.author ? T(sec.author) : '';
            return lrow({
              title: T(sec.title), meta: sectionMeta(textId, sec.id, Lib.sectionChars(sec), by), font: uiFont(scriptOf(textId, sec.id)),
              attrs: { 'data-section': sec.id, 'data-notes': Lib.hasNotes(textId, sec.id) ? '1' : null }, buttons: sectionButtons(textId, sec.id, sec.id),
              open: function () { location.hash = startHash(textId, sec.id); }
            });
          });
        }
      });
      pl.render();
    }).catch(function (e) {
      MX.err(e);
      el.appendChild(h('p', { text: '無法載入文本：' + String(e && e.message || e) }));
    });
  };

  // ------------------------------------------------------------------ setup
  S.setup = function (root, textId, sectionId, query) {
    var entry = Lib.entry(textId);
    if (!entry) { location.hash = '#/'; return; }
    sectionId = sectionId || 'main';
    var copy = Model.activeCopy(textId, sectionId);
    if (copy) Model.loadInk(copy);
    var locked = !!(copy && Model.recount(copy) > 0);
    var d = assign({}, copy ? copy.cfg : Model.textCfg(textId));
    var crumbs = catCrumbs(entry);
    if (entry.sections > 1) crumbs.push([T(entry.title), H('text', textId)]);
    crumbs.push(['設定', H('setup', textId, sectionId)]);
    var el = screen(root, T(entry.title), S.backFor(textId), null, crumbs);
    el.setAttribute('data-screen', 'setup');
    el.setAttribute('data-section', sectionId);
    // Layout of this screen: title (+ section) and the size estimate, ONE big start button right under them (繼續上次 + a quieter 重新開始 when there is ink),
    // the two essentials (字體, 模式), the small links, and a collapsed 進階選項 (everything else; open/closed is remembered per device, static, no animation).
    var info = h('div', { class: 'note scount', 'data-role': 'cellcount' });
    function cellsOf(txt) { return MX.Layout.cellsFor(txt, { cfg: d, createdAt: copy ? copy.createdAt : Date.now() }); }
    var viewP = Lib.getView(textId, sectionId);
    viewP.then(function (v) {
      if (!el.parentNode) return;
      if (v.multi) el.querySelector('h1').textContent = T(v.textTitle) + ' · ' + T(v.sectionTitle);
    }).catch(function () { /* shown below */ });
    // an estimate of the pages in the tablet / laptop layout (the phone shows one cell per page: no page count there)
    function pagesOf(cells) {
      if (MX.Device.isPhone()) return 0;
      var dm = MX.Layout.DIMS[d.size] || MX.Layout.DIMS.M, portrait = window.innerWidth < window.innerHeight, cols = portrait ? dm[0] : dm[1], rows = portrait ? dm[1] : dm[0];
      return MX.Layout.paginate(cells, { dir: d.dir === 'h' ? 'h' : 'v', cols: cols, rows: rows, perPage: cols * rows }).length;
    }
    // the advanced choices that differ from the defaults, in words (shown under the collapsed 進階選項 row)
    var advSum = h('div', { class: 'note advsum', 'data-role': 'adv-summary' });
    function advSummary() {
      var D = Model.DEF_CFG, get = function (k) { return d[k] === undefined ? D[k] : d[k]; };
      var differs = ['box', 'guide', 'grid', 'size', 'dir', 'punct', 'title', 'sign'].some(function (k) { return get(k) !== D[k]; });
      if (!differs) return '';
      var size = MX.Form.CFG.filter(function (f) { return f.k === 'size'; })[0].opts.filter(function (o) { return o[0] === get('size'); })[0];
      var parts = [get('guide') === false ? '無格線' : (get('grid') === 'tian' ? '田字格' : '米字格')];
      if (get('box') === false) parts.push('無外框');
      parts.push(get('dir') === 'h' ? '橫書' : '直書', (size ? size[1].split(' ')[0] : '中') + '格');
      if (get('punct') === 'show') parts.push('顯示標點');
      if (get('title') === false) parts.push('無標題');
      parts.push(get('sign') === false ? '無落款' : '含落款');
      return parts.join(' · ');
    }
    function refreshAdv() { advSum.textContent = advSummary(); advSum.hidden = !advSum.textContent || advOpen(); }
    function refreshInfo() {
      viewP.then(function (txt) {
        var cells = cellsOf(txt), pg = pagesOf(cells);
        info.textContent = '約 ' + cells.length + ' 字' + (pg ? ' · ' + pg + ' 頁' : '');
        info.setAttribute('data-cells', String(cells.length));
      }).catch(function (e) { info.textContent = '無法載入文本：' + (e && e.message || e); });
      refreshAdv();
    }
    el.appendChild(info);
    // actions first (no hunting for a button at the bottom of a long form)
    var inprog = !!(copy && Model.recount(copy) > 0);
    var row = h('div', { class: 'btnrow actions startrow' });
    row.appendChild(h('button', {
      class: 'on big startbtn', 'data-act': 'go', text: inprog ? '繼續上次（' + Model.recount(copy) + ' / ' + (copy.total || 0) + '）' : '開始抄寫',
      onclick: async function () {
        var txt = await Lib.getView(textId, sectionId), c = copy;
        Model.saveTextCfg(textId, d);
        if (!c) {
          c = Model.create(textId, d, '', 0, sectionId);
          c.total = MX.Layout.cellsFor(txt, c).length;
          Model.saveMeta(c);
        } else {
          var contentChanged = MX.Model.CONTENT_KEYS.some(function (k) { return c.cfg[k] !== d[k]; });
          c.cfg = assign({}, d);
          if (contentChanged && !locked) c.pos = 0;
          c.total = MX.Layout.cellsFor(txt, c).length;
          Model.saveMeta(c);
        }
        location.hash = H('practice', c.id);
      }
    }));
    if (copy && inprog) {
      row.appendChild(h('button', {
        class: 'restartbtn', 'data-act': 'newcopy', text: '重新開始',
        onclick: async function () {
          var ok = await MX.confirm('將目前這一遍存檔，重新開始新的一遍？', '重新開始', '重新開始');
          if (!ok) return;
          Model.archive(copy);
          location.replace(H('setup', textId, sectionId, 'new=' + Date.now()));
        }
      }));
    }
    el.appendChild(row);
    // the essentials: 字體 (繁 / 简) and 模式 (描 / 臨 / 默)
    var ESS = ['script', 'mode'], cfgFields = MX.Form.CFG;
    el.appendChild(MX.Form.build(cfgFields.filter(function (f) { return ESS.indexOf(f.k) >= 0; }), d, locked, refreshInfo));
    if (locked) el.appendChild(h('div', { class: 'note', text: '已開始書寫：字體需「重新開始」才能更改。' }));
    var row2 = h('div', { class: 'btnrow secondary' });
    row2.appendChild(MX.favButton(textId, entry.sections > 1 ? sectionId : null, null, true));
    if (Lib.hasNotes(textId, sectionId)) row2.appendChild(h('button', { text: '解說', 'data-act': 'notes', onclick: function () { location.hash = H('notes', textId, sectionId); } }));
    var arch = Model.archived(textId, sectionId).length;
    if (arch) row2.appendChild(h('button', { text: '存檔 (' + arch + ')', 'data-act': 'archives', onclick: function () { location.hash = H('archives', textId, sectionId); } }));

    try { if (Store.get('setupAdv:v1') !== undefined) Store.del('setupAdv:v1'); } catch (e) { /* ignore */ }       // reset once: the old flag is gone, 進階選項 starts collapsed
    // 進階選項: collapsed by default; the choice is remembered per device (Store `setupAdv:v2`, device-local; v1 is deleted once)
    function advOpen() { try { return !!Store.get(ADV_KEY); } catch (e) { return false; } }
    var adv = h('div', { class: 'advbody', id: 'setup-adv', 'data-role': 'adv-body' });
    var advBtn = h('button', { type: 'button', class: 'advbtn', 'data-act': 'adv', 'aria-controls': 'setup-adv', onclick: function () {
      try { if (advOpen()) Store.del(ADV_KEY); else Store.set(ADV_KEY, 1); } catch (e) { MX.err(e); }
      syncAdv();
    } });
    function syncAdv() {
      var open = advOpen();
      adv.hidden = !open;
      advBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      advBtn.innerHTML = '';
      advBtn.appendChild(h('span', { text: '進階選項' }));
      advBtn.appendChild(MX.icon(open ? 'tri-u' : 'tri-d', 18));
      refreshAdv();
    }
    el.appendChild(advBtn);
    el.appendChild(advSum);
    adv.appendChild(MX.Form.build(cfgFields.filter(function (f) { return ESS.indexOf(f.k) < 0; }), d, locked, refreshInfo));
    var signHold = h('div');
    adv.appendChild(signHold);
    viewP.then(function (v) {
      signHold.appendChild(h('h2', { text: '署名與落款' }));
      signHold.appendChild(MX.Form.signBlock(Model.settings, d, v.category === 'buddhist', function () { Model.saveSettings(); refreshInfo(); }));
    }).catch(function () { /* the cell count shows the error */ });
    el.appendChild(adv);
    if (MX.Device.isPhone()) adv.insertBefore(row2, adv.firstChild); else el.appendChild(row2);       // 收藏 / 解說 / 存檔: on a phone they are inside 進階選項 (nothing but the essentials above the fold)
    syncAdv();
    refreshInfo();
  };

  // ------------------------------------------------------------------ custom text editor
  S.custom = function (root, id) {
    var isNew = !id || id === 'new', old = isNew ? null : Store.get('custom:' + id);
    if (!isNew && !(old && old.id)) { location.hash = H('lib', Lib.CUSTOM); return; }
    var el = screen(root, isNew ? '新增自訂文本' : '編輯自訂文本', H('lib', Lib.CUSTOM));
    el.setAttribute('data-screen', 'custom');
    var used = !isNew && (Object.keys(Model.copies).some(function (k) { return Model.copies[k].textId === id; }) || Model.doneCount(id) > 0);
    var title = h('input', { type: 'text', value: old ? old.title : '', placeholder: '標題', maxlength: '40', 'data-role': 'custom-title' });
    var body = h('textarea', { class: 'cbody', placeholder: '貼上或輸入要練習的文字', 'data-role': 'custom-body', disabled: used ? true : null });
    body.value = old ? old.body : '';
    var msg = h('div', { class: 'note', 'data-role': 'custom-msg' });
    var count = h('div', { class: 'note', 'data-role': 'custom-count' });
    function recount() {
      var n = 0;
      Array.from(body.value).forEach(function (c) { if (MX.Closing.isCJK(c)) n++; });
      count.textContent = '漢字 ' + n + ' 個（上限 ' + Lib.MAX_CUSTOM + ' 字）';
    }
    body.addEventListener('input', recount);
    el.appendChild(MX.Form.row('標題', title));
    el.appendChild(body);
    el.appendChild(count);
    if (used) el.appendChild(h('div', { class: 'note', text: '已有抄寫紀錄，內文不能再改（標題可以）。要換內文請新增另一篇。' }));
    el.appendChild(msg);
    recount();
    var btns = h('div', { class: 'btnrow', style: 'margin-top:12px' });
    btns.appendChild(h('button', { class: 'on big', 'data-act': 'save-custom', text: '儲存',
      onclick: function () {
        var r = Lib.saveCustom(isNew ? null : id, title.value, used ? old.body : body.value);
        if (r.error) { msg.textContent = r.error; return; }
        MX.toast('已儲存');
        location.hash = H('lib', Lib.CUSTOM);
      } }));
    if (!isNew) {
      btns.appendChild(h('button', { class: 'big', 'data-act': 'delete-custom', text: '刪除',
        onclick: async function () {
          var ok = await MX.confirm('刪除這篇自訂文本和它的所有抄寫紀錄？無法復原。', '刪除', '刪除自訂文本');
          if (!ok) return;
          Object.keys(Model.copies).map(function (k) { return Model.copies[k]; }).filter(function (c) { return c.textId === id; }).forEach(function (c) { Model.remove(c); });
          Store.keys('done:').forEach(function (k) { var dn = Store.get(k); if (dn && dn.textId === id) Store.del(k); });
          Store.del('textcfg:' + id);
          Lib.removeCustom(id);
          location.hash = H('lib', Lib.CUSTOM);
        } }));
    }
    el.appendChild(btns);
  };

  // ------------------------------------------------------------------ app settings
  // Every change applies and is saved at once (no save button). 完成 floats at the top right (fixed: visible while scrolling); the sections have an index at the top.
  S.settings = function (root) {
    var el = h('div', { class: 'screen settings' });
    root.appendChild(el);
    el.setAttribute('data-screen', 'settings');
    var st = Model.settings;
    function save() { Model.saveSettings(); }
    function done() { if (history.length > 1) history.back(); else location.hash = '#/'; }
    el.appendChild(h('button', { class: 'on floatdone', 'data-act': 'done', text: '完成', onclick: done }));
    el.appendChild(h('div', { class: 'topbar' }, [h('h1', { class: 'grow', text: '設定' })]));
    el.appendChild(h('div', { class: 'note', 'data-role': 'autosave-note', text: '變更會立即套用並自動儲存。' }));
    var G = {};
    MX.Form.GROUPS.forEach(function (g) { G[g.id] = g; });
    var index = h('div', { class: 'sindex', 'data-role': 'section-index' });
    el.appendChild(index);
    var sections = {};
    function section(id) {
      var box = h('section', { class: 'sect', 'data-sect': id }, [h('h2', { text: G[id].title })]);
      sections[id] = box;
      el.appendChild(box);
      index.appendChild(h('button', { type: 'button', text: G[id].title, 'data-act': 'goto-' + id, onclick: function () {
        // jump (no animation): the section's top at the top of the screen
        el.scrollTop = box.offsetTop - 70;
      } }));
      return box;
    }
    var ws = null;
    function groupForm(id, onChange) {
      return MX.Form.build(MX.Form.fields(G[id].keys), st, false, function (k) {
        save();
        if (ws && (k === 'brush' || k === 'inkWidth' || k === 'pressRange')) ws.update();
        if (onChange) onChange(k);
      });
    }
    section('write').appendChild(groupForm('write'));
    sections.write.appendChild(h('div', { class: 'note', 'data-role': 'stroke-tap-note', text: MX.Form.GROUP_NOTES.write }));
    var b = section('brush');
    ws = MX.Form.widthSample(st);
    b.appendChild(groupForm('brush'));
    b.appendChild(h('div', { class: 'note', text: '粗細＝平常力道的線寬；筆壓幅度＝力道輕重讓線變細變粗的程度。校準只對應筆壓，不改線寬（筆測頁）。' }));
    b.appendChild(ws.el);
    section('grid').appendChild(groupForm('grid'));
    section('sign').appendChild(MX.Form.signBlock(st, null, null, function () { save(); }));
    var n = section('notes');
    n.appendChild(groupForm('notes'));
    n.appendChild(h('div', { class: 'note', text: '完成一章後自動顯示該章解說；對照模式在抄寫時於旁邊（橫向）或下方（直向）顯示要旨與字詞。' }));
    section('display').appendChild(groupForm('display', function (k) {
      if (k === 'screenType') MX.Form.syncSeg(el, 'gridLook', st.gridLook);       // the preset also sets the grid style
    }));
    sections.display.appendChild(h('div', { class: 'note', 'data-role': 'display-note', text: MX.Form.GROUP_NOTES.display }));

    // ---- 資料
    var dat = section('data');
    var file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', 'data-role': 'import-file',
      onchange: function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = async function () {
          var ok = await MX.confirm('匯入會取代此裝置上的所有資料。', '匯入', '匯入備份');
          if (!ok) return;
          try {
            var cnt = MX.Export.importText(String(fr.result));
            MX.toast('已匯入 ' + cnt + ' 筆');
            location.hash = '#/';
          } catch (e) { MX.toast('匯入失敗：' + e.message); }
        };
        fr.readAsText(f);
        file.value = '';
      } });
    dat.appendChild(h('div', { class: 'btnrow' }, [
      h('button', { text: '匯出資料 (JSON)', 'data-act': 'export-json', onclick: function () { MX.Export.saveJson().catch(function (e) { MX.err(e); MX.toast('匯出失敗'); }); } }),
      h('button', { text: '匯入資料', 'data-act': 'import-json', onclick: function () { file.click(); } }),
      file
    ]));
    dat.appendChild(h('div', { class: 'note', text: '資料只存在這台裝置，不會上傳。備份包含抄寫進度、字跡、收藏和自訂文本。' }));

    // ---- 關於 (+ updates)
    var ab = section('about');
    var ver = (document.querySelector('meta[name=mx-version]') || {}).content || '';
    var native = window.MoBridge ? MX.Update.current() : '';
    ab.appendChild(h('div', { class: 'note', 'data-role': 'version', text: (native ? 'App 版本 ' + native + ' · ' : '') + '網頁版本 ' + ver + ' · 字帖庫 ' + Lib.version() }));
    var out = h('div', { 'data-role': 'upd-result' });
    function result(msg) { out.innerHTML = ''; if (typeof msg === 'string') out.appendChild(h('div', { class: 'note', 'data-role': 'upd-msg', text: msg })); else if (msg) out.appendChild(msg); }
    var row = h('div', { class: 'btnrow' });
    row.appendChild(h('button', { text: '檢查更新', 'data-act': 'check-update', onclick: function () {
      result('檢查中…');
      if (window.MoBridge) {
        MX.Update.checkApk(true).then(function (r) {
          if (r.status === 'new') result(MX.Update.apkCard());
          else if (r.status === 'current') result('已是最新版本（' + r.version + '）');
          else result('檢查失敗：無法連線（沒有網路？）');
        });
      } else if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (!reg) { result('網頁版目前沒有啟用離線快取。'); return null; }
          return reg.update().then(function () { result(MX.updateReady ? '有新版本：回到首頁按「重新載入以更新」。' : '已檢查：目前是最新版本。'); });
        }).catch(function () { result('檢查失敗：無法連線（沒有網路？）'); });
      } else result('此環境無法檢查更新。');
    } }));
    if (window.MoBridge) {
      row.appendChild(h('button', { text: '檢查字帖庫更新', 'data-act': 'check-lib', onclick: function () {
        result('檢查中…');
        MX.Update.checkLib(true).then(function (r) {
          if (r.status === 'new') result(MX.Update.libCard());
          else if (r.status === 'current') result('字帖庫已是最新（版本 ' + r.version + '）');
          else result('檢查失敗：無法連線（沒有網路？）');
        });
      } }));
    }
    row.appendChild(h('button', { text: '筆測頁', 'data-act': 'pentest', onclick: function () { location.hash = '#/pentest'; } }));
    ab.appendChild(row);
    ab.appendChild(out);
    ab.appendChild(h('div', { class: 'btnrow', 'data-role': 'about-links' }, [
      h('button', { text: '關於與隨喜', 'data-act': 'about', onclick: function () { if (MX.Intro) MX.Intro.open(); } }),
      h('a', { class: 'btnlink plain', 'data-act': 'about-github', href: GITHUB_URL, target: '_blank', rel: 'noopener', text: '完整介紹 · GitHub' })
    ]));
    ab.appendChild(h('div', { class: 'note', 'data-role': 'font-credit', text: MX.Notes.CREDITS.font }));
    ab.appendChild(h('div', { class: 'note', 'data-role': 'stroke-credit', text: MX.Notes.CREDITS.stroke }));
  };

  // ------------------------------------------------------------------ archives (of one section; no section = all sections of the text)
  S.archives = function (root, textId, sectionId) {
    var entry = Lib.entry(textId);
    var el = screen(root, '存檔 · ' + (entry ? T(entry.title) : ''), S.backFor(textId));
    el.setAttribute('data-screen', 'archives');
    var list = Model.archived(textId, sectionId);
    if (!list.length) el.appendChild(h('p', { text: '沒有存檔。' }));
    list.forEach(function (c) {
      var card = h('div', { class: 'card', 'data-copy': c.id }, [
        h('div', { class: 't', text: MX.fmtDate(c.archivedAt || c.updatedAt) }),
        h('div', { class: 'm', text: (c.cfg.script === 'simp' ? '简体' : '繁體') + ' · ' + { trace: '描', copy: '臨', recall: '默' }[c.cfg.mode] +
          ' · ' + c.filled + '/' + c.total + '格' + (c.completedAt ? ' · 已完成' : '') })
      ]);
      card.appendChild(h('div', { class: 'btnrow' }, [
        h('button', { text: '檢視', 'data-act': 'view', onclick: function () { location.hash = H('view', c.id); } }),
        h('button', { text: '匯出', 'data-act': 'export', onclick: function () { S.exportCopy(c).catch(function (e) { MX.err(e); MX.toast('匯出失敗'); }); } }),
        h('button', { text: '刪除', 'data-act': 'delete', onclick: async function () {
          var ok = await MX.confirm('刪除這份存檔？無法復原。', '刪除', '刪除存檔');
          if (!ok) return;
          Model.remove(c);
          location.hash = H('archives', textId, sectionId, 'r=' + Date.now());
        } })
      ]));
      el.appendChild(card);
    });
  };
})();
