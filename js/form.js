(function () {
  'use strict';
  var MX = window.MX, h = MX.h;

  var ONOFF = [[true, '開'], [false, '關']];
  var F = MX.Form = {
    // per-copy config fields; content=true ones are locked once the copy has ink
    CFG: [
      { k: 'script', label: '字體', content: true, opts: [['trad', '繁體'], ['simp', '简体']] },
      { k: 'box', label: '外框', opts: [[true, '有'], [false, '無']] },
      { k: 'guide', label: '格線', opts: [[true, '有'], [false, '無']] },
      { k: 'grid', label: '格線形狀', opts: [['mi', '米字格'], ['tian', '田字格']] },
      { k: 'size', label: '格大小', opts: [['XL', '特大 3×4'], ['L', '大 4×5'], ['ML', '中大 5×7'], ['M', '中 6×8'], ['S', '小 8×10'], ['XS', '特小 10×13']] },
      { k: 'dir', label: '方向', opts: [['v', '直書'], ['h', '橫書']] },
      { k: 'punct', label: '標點', opts: [['hide', '隱藏'], ['show', '顯示']] },
      { k: 'mode', label: '模式', opts: [['trace', '描'], ['copy', '臨'], ['recall', '默']] },
      { k: 'title', label: '標題', opts: ONOFF }
    ],
    SETTINGS: [
      { k: 'brush', label: '筆觸', pick: true, opts: [['mao', '毛筆'], ['classic', '經典'], ['xiu', '秀麗筆'], ['ying', '硬筆'], ['gang', '鋼筆'], ['custom', '自訂']] },
      { k: 'tune', label: '調校', button: '筆觸調校…' },
      { k: 'inkWidth', label: '粗細', pick: true, opts: [['thin', '細'], ['mthin', '中細'], ['mid', '中'], ['thick', '粗']] },
      { k: 'pressRange', label: '筆壓幅度', opts: [['small', '小'], ['mid', '中'], ['large', '大']] },
      { k: 'stab', label: '防抖', opts: [['off', '關'], ['light', '輕'], ['mid', '中']] },
      { k: 'tplStyle', label: '描紅樣式', opts: [['fill', '灰色'], ['dots', '網點'], ['outline', '空心']] },
      { k: 'tplFont', label: '字體', opts: [['ukai', '楷書'], ['tw', '正楷'], ['msz', '行楷'], ['wk', '硬筆']] },
      { k: 'screenType', label: '螢幕類型', opts: [['eink', '電子紙'], ['normal', '一般螢幕']] },
      { k: 'gridLook', label: '格線樣式', opts: [['dots', '點線(黑)'], ['light', '實線淺灰'], ['black', '實線黑']] },
      { k: 'gridDensity', label: '點線疏密', opts: [['sparse', '疏'], ['mid', '中'], ['dense', '密']] },
      { k: 'tplSize', label: '字大小', opts: [['s', '小'], ['m', '中小'], ['md', '中'], ['l', '大'], ['xl', '特大']] },
      { k: 'tplTone', label: '深淺', opts: [['light', '淺'], ['mid', '中'], ['dark', '深']] },
      { k: 'pressure', label: '壓感', opts: [['auto', '自動'], ['off', '固定']] },
      { k: 'lowLat', label: '低延遲筆跡（實驗）', opts: [['auto', '自動'], ['on', '開'], ['off', '關']] },
      { k: 'layoutMode', label: '版面', opts: [['auto', '自動'], ['tablet', '平板'], ['phone', '手機']] },
      { k: 'acceptTouch', label: '手指書寫', opts: ONOFF },
      { k: 'phoneTouch', label: '手機手指書寫', opts: ONOFF },
      { k: 'strokeTap', label: '雙擊看筆順', opts: ONOFF },
      { k: 'perf', label: '效能模式', opts: ONOFF },
      { k: 'autoFlip', label: '自動翻頁', opts: ONOFF },
      { k: 'phoneAuto', label: '自動下一字（手機）', opts: ONOFF },
      { k: 'flipDelay', label: '翻頁等待', opts: [['1', '1秒'], ['1.5', '1.5秒'], ['2', '2秒'], ['3', '3秒']] },
      { k: 'autoNext', label: '翻頁鈕', opts: ONOFF },
      { k: 'edgeBottom', label: '邊緣留白 下', opts: [['0', '0%'], ['2', '2%'], ['3.5', '3.5%'], ['5', '5%'], ['8', '8%']] },
      { k: 'edgeSide', label: '邊緣留白 左右上', opts: [['0', '0%'], ['1', '1%'], ['2', '2%'], ['3', '3%']] },
      { k: 'libScript', label: '文庫顯示', opts: [['trad', '繁體'], ['simp', '简体']] },
      { k: 'autoNotes', label: '完成後顯示解說', opts: ONOFF },
      { k: 'sideNotes', label: '對照模式', opts: ONOFF }
    ],
    // The app settings screen / the practice sheet group the SETTINGS fields (the 署名落款 block, 資料 and 關於 are built by the screen itself)
    GROUPS: [
      { id: 'write', title: '書寫', keys: ['acceptTouch', 'phoneTouch', 'strokeTap', 'autoFlip', 'phoneAuto', 'flipDelay', 'autoNext'] },
      { id: 'brush', title: '筆觸', keys: ['brush', 'tune', 'inkWidth', 'pressRange', 'stab', 'pressure'] },
      { id: 'grid', title: '格線', keys: ['gridLook', 'gridDensity'] },
      { id: 'sign', title: '署名落款', keys: [] },
      { id: 'notes', title: '解說', keys: ['autoNotes', 'sideNotes'] },
      { id: 'display', title: '顯示', keys: ['layoutMode', 'lowLat', 'screenType', 'libScript', 'tplStyle', 'tplFont', 'tplSize', 'tplTone', 'edgeBottom', 'edgeSide', 'perf'] },
      { id: 'data', title: '資料', keys: [] },
      { id: 'about', title: '關於', keys: [] }
    ],
    // the explanation under a settings group (shown by the settings screen and the practice sheet)
    GROUP_NOTES: {
      write: '雙擊看筆順：筆不在旁邊時，用手指在格子上快速點兩下，顯示該字的筆順動畫。「手指書寫」開啟時此手勢停用，請改用工具列的「筆順」鈕。手機版面預設可用手指書寫（「手機手指書寫」），雙擊手勢停用，請按「筆順」鈕。',
      display: '螢幕類型：電子紙＝黑色點線格（電子紙快速刷新也看得清楚）；一般螢幕＝淺灰實線格。選擇時會一併換上對應的格線樣式。版面：自動＝螢幕短邊小於 520 像素時用手機版面（一次寫一個字），否則用平板版面。兩種版面的字跡通用，可以在任一種繼續同一份字帖。低延遲筆跡（實驗）：自動＝只在 iReader 電子紙平板上使用低延遲畫布；其他 Android 平板的某些顯示晶片會把書寫層畫成全黑，所以預設關閉。若書寫區變黑請設為「關」。下次進入書寫頁面才生效。'
    },
    fields: function (keys) {
      return keys.map(function (k) { return F.SETTINGS.filter(function (f) { return f.k === k; })[0]; }).filter(Boolean);
    },
    // 署名 + 落款 block: the name (any script, as typed; the one name used by 落款 and the 印章), and how the 落款 is written. st = the settings object (name, sigDate, sigWord,
    // sigDizi, sigHui), cfg = the copy's config (adds the per-copy 落款 on/off row; null in the app settings), buddhist = true / false for a text of that kind, null = not known (all rows).
    // onChange(k) after every change. Date = the copy's start date, fixed when the copy was made.
    signBlock: function (st, cfg, buddhist, onChange) {
      var box = h('div', { 'data-role': 'sign-block' }), ch = function (k) { if (onChange) onChange(k); };
      var inp = h('input', { type: 'text', value: st.name || '', placeholder: '輸入姓名（落款與印章用）', maxlength: '20', 'data-role': 'name',
        oninput: function () { st.name = inp.value; ch('name'); } });
      box.appendChild(F.row('署名', inp, 'name'));
      if (cfg) box.appendChild(F.row('落款', F.seg(ONOFF, cfg.sign !== false, function (v) { cfg.sign = v; ch('sign'); }), 'sign'));
      box.appendChild(F.row('日期', F.seg([['gz', '干支年'], ['ce', '公元年'], ['none', '不寫']], st.sigDate || 'gz', function (v) { st.sigDate = v; ch('sigDate'); }), 'sigDate'));
      var words = buddhist === true ? [['jing', '敬書'], ['lu', '恭錄'], ['mu', '沐手敬書']] : (buddhist === false ? [['shu', '書'], ['lin', '臨']] :
        [['jing', '敬書'], ['lu', '恭錄'], ['mu', '沐手敬書'], ['shu', '書'], ['lin', '臨']]);
      var cur = words.some(function (w) { return w[0] === st.sigWord; }) ? st.sigWord : words[0][0];
      box.appendChild(F.row(buddhist === false ? '署款' : '敬語', F.seg(words, cur, function (v) { st.sigWord = v; ch('sigWord'); }), 'sigWord'));
      if (buddhist !== false) {
        box.appendChild(F.row('弟子', F.seg(ONOFF, st.sigDizi !== false, function (v) { st.sigDizi = v; ch('sigDizi'); }), 'sigDizi'));
        box.appendChild(F.row('迴向偈', F.seg(ONOFF, !!st.sigHui, function (v) { st.sigHui = v; ch('sigHui'); }), 'sigHui'));
      }
      box.appendChild(h('div', { class: 'note', text: '落款寫在正文之後新的一行，是可描的格子；日期為這一遍開始的日期。改姓名或日期只影響還沒寫的落款格。' }));
      return box;
    },
    // A small static sample of the stroke at the current 筆觸 / 粗細 / 筆壓幅度: three synthetic strokes at light / normal / hard pressure (n 0.1 / 0.5 / 0.95), drawn by the real
    // ink engine. Re-rendered only when update() is called (after a change of those settings). st = the settings object.
    widthSample: function (st) {
      var box = h('div', { class: 'wsample', 'data-role': 'width-sample' }), cvs = [], LABELS = [['輕', 0.1], ['平常', 0.5], ['重', 0.95]], W = 150, HH = 60, SC = 0.17;
      LABELS.forEach(function (x) {
        var c = h('canvas', { 'data-n': String(x[1]), style: 'width:' + W + 'px;height:' + HH + 'px' });
        cvs.push(c);
        box.appendChild(h('div', { class: 'wsi' }, [c, h('div', { class: 'note', text: x[0] })]));
      });
      function update() {
        var d = window.devicePixelRatio || 1, S = MX.Ink.style(st);
        cvs.forEach(function (c, k) {
          c.width = Math.round(W * d); c.height = Math.round(HH * d);
          var ctx = c.getContext('2d'), p = MX.Ink.rawFor(S, LABELS[k][1]), flat = [], i, x, y;
          ctx.setTransform(d, 0, 0, d, 0, 0);
          for (i = 0; i <= 30; i++) { x = 80 + 840 * i / 30; y = (HH / 2) / SC + 55 * Math.sin(i / 30 * Math.PI * 1.3); flat.push(Math.round(x), Math.round(y), p, 0, 0, i ? 4 : 0); }
          MX.Ink.paintStroke(ctx, flat, 0, 0, SC, S, '#000', { px: d });
        });
        box.setAttribute('data-v', (st.brush || '') + '|' + (st.inkWidth || '') + '|' + (st.pressRange || ''));
      }
      update();
      return { el: box, update: update };
    },
    // segmented single-choice control
    seg: function (opts, value, onChange, disabled) {
      var wrap = h('div', { class: 'seg' });
      opts.forEach(function (o) {
        var b = h('button', {
          type: 'button', text: o[1], class: o[0] === value ? 'on' : '', disabled: disabled ? true : null,
          'data-v': String(o[0]),
          onclick: function () {
            Array.prototype.forEach.call(wrap.children, function (c) { c.className = ''; });
            b.className = 'on';
            onChange(o[0]);
          }
        });
        wrap.appendChild(b);
      });
      return wrap;
    },
    row: function (label, ctrl, key) {
      return h('div', { class: 'frow', 'data-k': key || null }, [h('label', { text: label }), ctrl]);
    },
    // highlight `value` in the segmented control of row `key` inside `root` (after the value was changed from elsewhere)
    syncSeg: function (root, key, value) {
      var row = root && root.querySelector('[data-k="' + key + '"]');
      if (row) Array.prototype.forEach.call(row.querySelectorAll('button'), function (b) { b.className = b.getAttribute('data-v') === String(value) ? 'on' : ''; });
    },
    // fields: array of definitions; obj: object to read/mutate; locked(content)->bool; onChange(k, v)
    build: function (fields, obj, locked, onChange) {
      var box = h('div');
      fields.forEach(function (f) {
        if (f.button) {      // an action row (筆觸調校): opens the tuning panel; saving a 自訂 brush selects it
          box.appendChild(F.row(f.label, h('button', { type: 'button', text: f.button, 'data-act': f.k, onclick: function () {
            if (F.openTuner) F.openTuner(function () { F.syncSeg(box, 'brush', obj.brush); if (onChange) onChange('brush', obj.brush); });
          } }), f.k));
          return;
        }
        var dis = !!(f.content && locked);
        box.appendChild(F.row(f.label, F.seg(f.opts, obj[f.k], function (v) {
          obj[f.k] = v;
          if (f.k === 'screenType' && MX.Model && MX.Model.applyScreenType) MX.Model.applyScreenType(obj, v);
          if (f.pick) { if (!obj.picked || typeof obj.picked !== 'object') obj.picked = {}; obj.picked[f.k] = true; }   // explicit choice: never replaced by a changed default
          if (onChange) onChange(f.k, v);
        }, dis), f.k));
      });
      return box;
    }
  };
})();
