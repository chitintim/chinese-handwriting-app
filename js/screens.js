(function () {
  'use strict';
  var MX = window.MX, h = MX.h, Model = MX.Model, Store = MX.Store, Lib = MX.Library;
  var S = MX.Screens = {};
  var APK_URL = 'https://github.com/chitintim/chinese-handwriting-app/releases/latest/download/moxie.apk';
  var ROW_H = 98;          // one list row (88 px + 10 px margin, see .lrow)

  function screen(root, title, backHash, extra) {
    var el = h('div', { class: 'screen' });
    var top = h('div', { class: 'topbar' }, [h('h1', { class: 'grow', text: title })]);
    if (extra) extra.forEach(function (n) { top.appendChild(n); });
    if (backHash) top.appendChild(h('button', { text: '返回', 'data-act': 'back', onclick: function () { location.hash = backHash; } }));
    el.appendChild(top);
    root.appendChild(el);
    return el;
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
  // where 返回 goes from a text's pages: its chapter list, or its category
  S.backFor = function (textId) {
    var e = Lib.entry(textId);
    if (!e) return '#/';
    if (e.custom) return H('lib', Lib.CUSTOM);
    return e.sections > 1 ? H('text', textId) : H('lib', e.category);
  };

  // ---- paged lists (no scrolling on e-ink): as many rows as fit below what is already on the screen
  function fitRows(el, reserve) {
    var last = el.lastElementChild, top = last ? last.getBoundingClientRect().bottom + 10 : 0;
    var pb = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    var n = Math.floor((el.clientHeight - pb - top - reserve) / ROW_H);
    return Math.max(3, Math.min(40, n));
  }
  function pagerBar(el, total, per, page, link) {
    var pages = Math.max(1, Math.ceil(total / per));
    if (pages < 2) return;
    el.appendChild(h('div', { class: 'pager', 'data-role': 'pager' }, [
      h('button', { 'data-act': 'ppage-prev', text: '上一頁', disabled: page <= 1 ? true : null, onclick: function () { location.replace(link(page - 1)); } }),
      h('div', { class: 'ctr', 'data-role': 'pager-ctr', text: page + ' / ' + pages }),
      h('button', { 'data-act': 'ppage-next', text: '下一頁', disabled: page >= pages ? true : null, onclick: function () { location.replace(link(page + 1)); } })
    ]));
  }
  // rows[]: fully built row nodes. reserve: px kept free below the list for the pager and whatever follows.
  function pagedList(el, rows, query, link, reserve) {
    var q = qs(query), per = fitRows(el, reserve), pages = Math.max(1, Math.ceil(rows.length / per));
    var page = MX.clamp(parseInt(q.p, 10) || 1, 1, pages);
    var box = h('div', { 'data-role': 'list', 'data-per': per });
    rows.slice((page - 1) * per, page * per).forEach(function (r) { box.appendChild(r); });
    el.appendChild(box);
    pagerBar(el, rows.length, per, page, link);
    return box;
  }
  // a list row: main part (title, meta; tap = primary) + buttons [{label, act, primary, onclick}]
  function lrow(o) {
    var main = h('div', { class: 'lmain', onclick: o.open }, [
      h('div', { class: 't', text: o.title, 'data-role': 'title' }),
      h('div', { class: 'm', 'data-role': 'meta', text: o.meta || '' })
    ]);
    if (o.font) main.style.cssText = 'font-family:' + o.font;
    var btns = h('div', { class: 'lbtns' });
    (o.buttons || []).forEach(function (b) {
      btns.appendChild(h('button', { class: b.primary ? 'on' : '', 'data-act': b.act, text: b.label, onclick: b.onclick }));
    });
    var attrs = { class: 'lrow' };
    Object.keys(o.attrs || {}).forEach(function (k) { attrs[k] = o.attrs[k]; });
    return h('div', attrs, [main, btns]);
  }
  function pctOf(copy) { return copy && copy.total ? Math.floor(100 * copy.filled / copy.total) : 0; }

  // buttons of a (text, section) row: 繼續/開始, 設定, 存檔 (n)
  function sectionButtons(textId, sectionId) {
    var copy = Model.activeCopy(textId, sectionId), arch = Model.archived(textId, sectionId).length, bs = [];
    bs.push({ label: copy ? '繼續' : '開始', act: 'start', primary: true,
      onclick: function () { location.hash = copy ? H('practice', copy.id) : H('setup', textId, sectionId); } });
    bs.push({ label: '設定', act: 'setup', onclick: function () { location.hash = H('setup', textId, sectionId); } });
    if (arch) bs.push({ label: '存檔 (' + arch + ')', act: 'archives', onclick: function () { location.hash = H('archives', textId, sectionId); } });
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

  // ------------------------------------------------------------------ home
  S.home = function (root, query) {
    var el = screen(root, '墨 · 抄經', null, [
      h('button', { text: '筆測', 'data-act': 'pentest', onclick: function () { location.hash = '#/pentest'; } }),
      h('button', { text: '設定', 'data-act': 'settings', onclick: function () { location.hash = '#/settings'; } })
    ]);
    el.setAttribute('data-screen', 'home');
    var reserve = 76;
    if (MX.updateReady) {
      el.appendChild(h('div', { class: 'card update', 'data-role': 'update' }, [
        h('div', { class: 'm', text: '有新版本可用。', style: 'margin-bottom:8px' }),
        h('button', { class: 'on big', 'data-act': 'reload', text: '重新載入以更新', onclick: function () { location.reload(); } })
      ]));
    }
    var apkCard = MX.Update.apkCard(), libCard = MX.Update.libCard();
    if (apkCard) el.appendChild(apkCard);
    if (libCard) el.appendChild(libCard);

    // 繼續: the copies written most recently (up to two)
    var recent = Model.recent().filter(function (c) { return Lib.entry(c.textId); }).slice(0, 2);
    recent.forEach(function (c) {
      var e = Lib.entry(c.textId), r = lrow({
        title: '繼續：' + T(e.title), meta: '進度 ' + pctOf(c) + '%', font: MX.Draw.fam(c.cfg.script),
        attrs: { 'data-role': 'resume', 'data-copy': c.id }, open: function () { location.hash = H('practice', c.id); },
        buttons: [{ label: '繼續', act: 'resume', primary: true, onclick: function () { location.hash = H('practice', c.id); } }]
      });
      el.appendChild(r);
      if (e.sections > 1) {
        Lib.getText(e.id).then(function (t) {
          var sec = t.sections.filter(function (s) { return s.id === Model.sid(c); })[0];
          if (sec && r.parentNode) r.querySelector('[data-role=title]').textContent = '繼續：' + T(t.title) + ' · ' + T(sec.title);
        }).catch(function () { /* ignore */ });
      }
    });
    if (!window.MoBridge) reserve += 200;      // the install card below the list
    reserve += 40;                              // version note
    var rows = Lib.categories().map(function (c) {
      var n = Lib.texts(c.id).length, done = 0;
      Lib.texts(c.id).forEach(function (e) { done += Model.doneCount(e.id); });
      return lrow({
        title: T(c.title), meta: c.custom ? (n ? n + ' 篇 · 貼上自己的文字練習' : '貼上自己的文字練習') : n + ' 篇 · 已抄 ' + done + ' 遍',
        font: MX.Draw.fam(libScript()), attrs: { 'data-cat': c.id }, open: function () { location.hash = H('lib', c.id); },
        buttons: [{ label: '開啟', act: 'open', primary: true, onclick: function () { location.hash = H('lib', c.id); } }]
      });
    });
    if (rows.length) pagedList(el, rows, query, function (p) { return '#/?p=' + p; }, reserve);
    else el.appendChild(h('p', { text: '文庫是空的。' }));
    if (!window.MoBridge) {
      // hosted web app only: offer the Android app (hidden inside the APK)
      el.appendChild(h('div', { class: 'card install', 'data-role': 'apk-install' }, [
        h('div', { class: 't', text: '安裝 App (APK)' }),
        h('div', { class: 'm', text: '安裝到平板，可離線使用。' }),
        h('a', { class: 'btnlink', 'data-act': 'apk', href: APK_URL, text: '安裝 App (APK)' }),
        h('a', { class: 'btnlink plain', 'data-act': 'apk-help', href: 'download/', text: '安裝步驟' })
      ]));
    }
    var ver = (document.querySelector('meta[name=mx-version]') || {}).content || '';
    el.appendChild(h('div', { class: 'note', text: '版本 ' + ver + ' · 字帖庫 ' + Lib.version() + ' · 儲存：' + Store.mode() }));
  };

  // ------------------------------------------------------------------ category: its texts
  S.category = function (root, catId, query) {
    var cat = Lib.category(catId);
    if (!cat) { location.hash = '#/'; return; }
    var el = screen(root, T(cat.title), '#/');
    el.setAttribute('data-screen', 'category');
    el.setAttribute('data-cat', catId);
    var custom = catId === Lib.CUSTOM;
    if (custom) {
      el.appendChild(h('div', { class: 'btnrow' }, [h('button', { class: 'on big', 'data-act': 'new-custom', text: '新增自訂文本', onclick: function () { location.hash = H('custom', 'new'); } })]));
      el.appendChild(h('div', { class: 'note', text: '貼上任何文字，繁體、簡體都照原樣使用。只存在這台裝置，會包含在資料備份中。' }));
    }
    var rows = Lib.texts(catId).map(function (e) {
      var multi = e.sections > 1, buttons = [], meta;
      var byline = [T(e.author), T(e.dynasty)].filter(Boolean).join(' ');
      if (multi) {
        meta = (byline ? byline + ' · ' : '') + e.chars + '字 · ' + e.sections + '章 · 已抄 ' + Model.doneCount(e.id) + ' 遍';
        buttons.push({ label: '章節', act: 'sections', primary: true, onclick: function () { location.hash = H('text', e.id); } });
      } else {
        meta = sectionMeta(e.id, 'main', e.chars, byline);
        buttons = sectionButtons(e.id, 'main');
      }
      if (custom) buttons.push({ label: '編輯', act: 'edit-custom', onclick: function () { location.hash = H('custom', e.id); } });
      return lrow({
        title: T(e.title), meta: meta, font: MX.Draw.fam(multi ? libScript() : scriptOf(e.id, 'main')), attrs: { 'data-text': e.id },
        open: function () { location.hash = multi ? H('text', e.id) : (Model.activeCopy(e.id, 'main') ? H('practice', Model.activeCopy(e.id, 'main').id) : H('setup', e.id, 'main')); },
        buttons: buttons
      });
    });
    if (rows.length) pagedList(el, rows, query, function (p) { return H('lib', catId, null, 'p=' + p); }, 76);
    else el.appendChild(h('p', { class: 'note', 'data-role': 'empty', text: custom ? '還沒有自訂文本。' : '這個分類沒有文本。' }));
  };

  // ------------------------------------------------------------------ text: its sections
  S.text = function (root, textId, query) {
    var entry = Lib.entry(textId);
    if (!entry) { location.hash = '#/'; return; }
    var el = screen(root, T(entry.title), H('lib', entry.custom ? Lib.CUSTOM : entry.category));
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
      var rows = text.sections.map(function (s) {
        var sec = s, by = sec.author ? T(sec.author) : '';
        return lrow({
          title: T(sec.title), meta: sectionMeta(textId, sec.id, Lib.sectionChars(sec), by), font: MX.Draw.fam(scriptOf(textId, sec.id)),
          attrs: { 'data-section': sec.id }, buttons: sectionButtons(textId, sec.id),
          open: function () { var c = Model.activeCopy(textId, sec.id); location.hash = c ? H('practice', c.id) : H('setup', textId, sec.id); }
        });
      });
      pagedList(el, rows, query, function (p) { return H('text', textId, null, 'p=' + p); }, 76);
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
    var el = screen(root, '設定 · ' + T(entry.title), S.backFor(textId));
    el.setAttribute('data-screen', 'setup');
    el.setAttribute('data-section', sectionId);
    var info = h('div', { class: 'note', 'data-role': 'cellcount' });
    function cellsOf(txt) { return MX.Layout.cellsFor(txt, { cfg: d, createdAt: copy ? copy.createdAt : Date.now() }); }
    var viewP = Lib.getView(textId, sectionId);
    viewP.then(function (v) {
      if (!el.parentNode) return;
      if (v.multi) el.querySelector('h1').textContent = '設定 · ' + T(v.textTitle) + ' · ' + T(v.sectionTitle);
    }).catch(function () { /* shown below */ });
    function refreshInfo() {
      viewP.then(function (txt) {
        var cells = cellsOf(txt);
        info.textContent = '共 ' + cells.length + ' 格';
      }).catch(function (e) { info.textContent = '無法載入文本：' + (e && e.message || e); });
    }
    var signHold = h('div');
    el.appendChild(signHold);
    viewP.then(function (v) {
      signHold.appendChild(MX.Form.signBlock(Model.settings, d, v.category === 'buddhist', function () { Model.saveSettings(); refreshInfo(); }));
    }).catch(function () { /* the cell count shows the error */ });
    el.appendChild(MX.Form.build(MX.Form.CFG, d, locked, refreshInfo));
    if (locked) el.appendChild(h('div', { class: 'note', text: '已開始書寫：字體需「新抄一遍」才能更改。' }));
    el.appendChild(info);
    refreshInfo();
    var row = h('div', { class: 'btnrow', style: 'margin-top:16px' });
    row.appendChild(h('button', {
      class: 'on big', 'data-act': 'go', text: copy ? '確定並繼續' : '開始抄寫',
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
    if (copy) {
      row.appendChild(h('button', {
        class: 'big', 'data-act': 'newcopy', text: '新抄一遍',
        onclick: async function () {
          var ok = await MX.confirm('將目前這一遍存檔，重新開始新的一遍？', '新抄一遍', '新抄一遍');
          if (!ok) return;
          Model.archive(copy);
          location.replace(H('setup', textId, sectionId, 'new=' + Date.now()));
        }
      }));
    }
    el.appendChild(row);
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
  S.settings = function (root) {
    var el = screen(root, '設定', '#/');
    el.setAttribute('data-screen', 'settings');
    var st = Model.settings;
    el.appendChild(MX.Form.signBlock(st, null, null, function () { Model.saveSettings(); }));
    el.appendChild(MX.Form.build(MX.Form.SETTINGS, st, false, function () { Model.saveSettings(); }));
    el.appendChild(MX.Form.row('文庫顯示', MX.Form.seg([['trad', '繁體'], ['simp', '简体']], st.libScript === 'simp' ? 'simp' : 'trad',
      function (v) { st.libScript = v; Model.saveSettings(); }), 'libScript'));

    // ---- updates
    el.appendChild(h('h2', { text: '更新' }));
    var ver = (document.querySelector('meta[name=mx-version]') || {}).content || '';
    var native = window.MoBridge ? MX.Update.current() : '';
    el.appendChild(h('div', { class: 'note', 'data-role': 'version', text: (native ? 'App 版本 ' + native + ' · ' : '') + '網頁版本 ' + ver + ' · 字帖庫 ' + Lib.version() }));
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
    el.appendChild(row);
    el.appendChild(out);

    el.appendChild(h('h2', { text: '資料備份' }));
    var file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', 'data-role': 'import-file',
      onchange: function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = async function () {
          var ok = await MX.confirm('匯入會取代此裝置上的所有資料。', '匯入', '匯入備份');
          if (!ok) return;
          try {
            var n = MX.Export.importText(String(fr.result));
            MX.toast('已匯入 ' + n + ' 筆');
            location.hash = '#/';
          } catch (e) { MX.toast('匯入失敗：' + e.message); }
        };
        fr.readAsText(f);
        file.value = '';
      } });
    el.appendChild(h('div', { class: 'btnrow' }, [
      h('button', { text: '匯出資料 (JSON)', 'data-act': 'export-json', onclick: function () { MX.Export.saveJson().catch(function (e) { MX.err(e); MX.toast('匯出失敗'); }); } }),
      h('button', { text: '匯入資料', 'data-act': 'import-json', onclick: function () { file.click(); } }),
      file
    ]));
    el.appendChild(h('div', { class: 'note', text: '資料只存在這台裝置，不會上傳。備份包含抄寫進度、字跡和自訂文本。' }));
    el.appendChild(h('div', { class: 'btnrow', style: 'margin-top:14px' }, [
      h('button', { text: '筆測頁', 'data-act': 'pentest', onclick: function () { location.hash = '#/pentest'; } })
    ]));
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
        h('button', { text: '匯出', 'data-act': 'export', onclick: async function () {
          var txt = await Lib.getView(c.textId, Model.sid(c));
          Model.loadInk(c);
          Model.upgradeKeys(c, txt);
          MX.Export.openSheet(MX.Export.ctx(c, txt, MX.Layout.cellsFor(txt, c)));
        } }),
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
