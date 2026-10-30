(function () {
  'use strict';
  var MX = window.MX, h = MX.h, Model = MX.Model, Store = MX.Store;
  var S = MX.Screens = {};

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

  // ------------------------------------------------------------------ home
  S.home = function (root) {
    var el = screen(root, '墨 · 抄經', null, [
      h('button', { text: '筆測', 'data-act': 'pentest', onclick: function () { location.hash = '#/pentest'; } }),
      h('button', { text: '設定', 'data-act': 'settings', onclick: function () { location.hash = '#/settings'; } })
    ]);
    el.setAttribute('data-screen', 'home');
    var texts = MX.Library.texts();
    texts.forEach(function (t) {
      var cfg = Model.textCfg(t.id), copy = Model.activeCopy(t.id);
      if (copy) cfg = copy.cfg;
      var pct = copy && copy.total ? Math.floor(100 * copy.filled / copy.total) : 0;
      var done = Model.doneCount(t.id), arch = Model.archived(t.id).length;
      var title = t.title[cfg.script === 'simp' ? 'simp' : 'trad'];
      var card = h('div', { class: 'card', 'data-text': t.id }, [
        h('div', { class: 't', text: title, style: 'font-family:' + MX.Draw.fam(cfg.script) }),
        h('div', { class: 'm', 'data-role': 'meta', text: t.chars + '字 · 進度 ' + pct + '% · 已抄 ' + done + ' 遍' }),
        h('div', { class: 'bar' }, [h('i', { style: 'width:' + pct + '%' })])
      ]);
      var row = h('div', { class: 'btnrow' });
      row.appendChild(h('button', {
        class: 'on', 'data-act': 'start', text: copy ? '繼續' : '開始',
        onclick: function () { location.hash = copy ? '#/practice/' + copy.id : '#/setup/' + t.id; }
      }));
      row.appendChild(h('button', { 'data-act': 'setup', text: '設定', onclick: function () { location.hash = '#/setup/' + t.id; } }));
      if (arch) row.appendChild(h('button', { 'data-act': 'archives', text: '存檔 (' + arch + ')', onclick: function () { location.hash = '#/archives/' + t.id; } }));
      card.appendChild(row);
      if (t.description) card.appendChild(h('div', { class: 'note', text: t.description }));
      el.appendChild(card);
    });
    if (!texts.length) el.appendChild(h('p', { text: '文庫是空的。' }));
    var ver = (document.querySelector('meta[name=mx-version]') || {}).content || '';
    el.appendChild(h('div', { class: 'note', text: (MX.Library.offline() ? '離線版 · ' : '') + '版本 ' + ver + ' · 儲存：' + Store.mode() }));
  };

  // ------------------------------------------------------------------ setup
  S.setup = function (root, textId, query) {
    var entry = MX.Library.entry(textId);
    if (!entry) { location.hash = '#/'; return; }
    var copy = Model.activeCopy(textId);
    if (copy) Model.loadInk(copy);
    var locked = !!(copy && Model.recount(copy) > 0);
    var d = assign({}, copy ? copy.cfg : Model.textCfg(textId));
    var el = screen(root, '設定 · ' + entry.title.trad, '#/');
    el.setAttribute('data-screen', 'setup');
    var info = h('div', { class: 'note', 'data-role': 'cellcount' });
    function signStr() { return d.sign ? MX.Closing.signLine(d.script, Model.settings.name) : ''; }
    function refreshInfo() {
      MX.Library.getText(textId).then(function (txt) {
        var cells = MX.Layout.buildCells(txt, d, signStr());
        info.textContent = '共 ' + cells.length + ' 格';
      });
    }
    el.appendChild(MX.Form.build(MX.Form.CFG, d, locked, refreshInfo));
    if (locked) el.appendChild(h('div', { class: 'note', text: '已開始書寫：字體、標題頁、迴向、落款需「新抄一遍」才能更改。' }));
    el.appendChild(info);
    refreshInfo();
    var row = h('div', { class: 'btnrow', style: 'margin-top:16px' });
    row.appendChild(h('button', {
      class: 'on big', 'data-act': 'go', text: copy ? '確定並繼續' : '開始抄寫',
      onclick: async function () {
        var txt = await MX.Library.getText(textId), c = copy;
        Model.saveTextCfg(textId, d);
        if (!c) {
          var ss = signStr();
          c = Model.create(textId, d, ss, MX.Layout.buildCells(txt, d, ss).length);
        } else {
          var contentChanged = MX.Model.CONTENT_KEYS.some(function (k) { return c.cfg[k] !== d[k]; });
          c.cfg = assign({}, d);
          if (contentChanged && !locked) {
            c.signStr = signStr();
            c.total = MX.Layout.buildCells(txt, c.cfg, c.signStr).length;
            c.pos = 0;
          }
          Model.saveMeta(c);
        }
        location.hash = '#/practice/' + c.id;
      }
    }));
    if (copy) {
      row.appendChild(h('button', {
        class: 'big', 'data-act': 'newcopy', text: '新抄一遍',
        onclick: async function () {
          var ok = await MX.confirm('將目前這一遍存檔，重新開始新的一遍？', '新抄一遍', '新抄一遍');
          if (!ok) return;
          Model.archive(copy);
          location.replace('#/setup/' + textId + '?new=' + Date.now());
        }
      }));
    }
    el.appendChild(row);
  };

  // ------------------------------------------------------------------ app settings
  S.settings = function (root) {
    var el = screen(root, '設定', '#/');
    el.setAttribute('data-screen', 'settings');
    var st = Model.settings;
    el.appendChild(MX.Form.build(MX.Form.SETTINGS, st, false, function () { Model.saveSettings(); }));
    var nameIn = h('input', { type: 'text', value: st.name || '', placeholder: '落款姓名（選填）', 'data-role': 'name',
      oninput: function () { st.name = nameIn.value; Model.saveSettings(); } });
    el.appendChild(MX.Form.row('姓名', nameIn));
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
    el.appendChild(h('div', { class: 'note', text: '資料只存在這台裝置，不會上傳。' }));
    el.appendChild(h('div', { class: 'btnrow', style: 'margin-top:14px' }, [
      h('button', { text: '筆測頁', 'data-act': 'pentest', onclick: function () { location.hash = '#/pentest'; } })
    ]));
  };

  // ------------------------------------------------------------------ archives
  S.archives = function (root, textId) {
    var entry = MX.Library.entry(textId);
    var el = screen(root, '存檔 · ' + (entry ? entry.title.trad : ''), '#/');
    el.setAttribute('data-screen', 'archives');
    var list = Model.archived(textId);
    if (!list.length) el.appendChild(h('p', { text: '沒有存檔。' }));
    list.forEach(function (c) {
      var card = h('div', { class: 'card', 'data-copy': c.id }, [
        h('div', { class: 't', text: MX.fmtDate(c.archivedAt || c.updatedAt) }),
        h('div', { class: 'm', text: (c.cfg.script === 'simp' ? '简体' : '繁體') + ' · ' + { trace: '描', copy: '臨', recall: '默' }[c.cfg.mode] +
          ' · ' + c.filled + '/' + c.total + '格' + (c.completedAt ? ' · 已完成' : '') })
      ]);
      card.appendChild(h('div', { class: 'btnrow' }, [
        h('button', { text: '檢視', 'data-act': 'view', onclick: function () { location.hash = '#/view/' + c.id; } }),
        h('button', { text: '匯出', 'data-act': 'export', onclick: async function () {
          var txt = await MX.Library.getText(c.textId);
          Model.loadInk(c);
          var cells = MX.Layout.buildCells(txt, c.cfg, c.signStr);
          MX.Export.openSheet(MX.Export.ctx(c, txt, cells), 0, window.innerWidth < window.innerHeight);
        } }),
        h('button', { text: '刪除', 'data-act': 'delete', onclick: async function () {
          var ok = await MX.confirm('刪除這份存檔？無法復原。', '刪除', '刪除存檔');
          if (!ok) return;
          Model.remove(c);
          location.hash = '#/archives/' + textId + '?r=' + Date.now();
        } })
      ]));
      el.appendChild(card);
    });
  };
})();
