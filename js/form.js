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
      { k: 'brush', label: '筆觸', pick: true, opts: [['mao', '毛筆'], ['xiu', '秀麗筆'], ['ying', '硬筆'], ['gang', '鋼筆']] },
      { k: 'inkWidth', label: '筆粗', pick: true, opts: [['thin', '細'], ['mthin', '中細'], ['mid', '中'], ['thick', '粗']] },
      { k: 'curve', label: '筆壓', opts: [['light', '輕'], ['mid', '中'], ['heavy', '重']] },
      { k: 'stab', label: '防抖', opts: [['off', '關'], ['light', '輕'], ['mid', '中']] },
      { k: 'tplStyle', label: '描紅樣式', opts: [['fill', '灰色'], ['dots', '網點'], ['outline', '空心']] },
      { k: 'tplFont', label: '字體', opts: [['ukai', '楷書'], ['tw', '正楷'], ['msz', '行楷'], ['wk', '硬筆']] },
      { k: 'gridLook', label: '格線樣式', opts: [['dots', '點線(黑)'], ['light', '實線淺灰'], ['black', '實線黑']] },
      { k: 'gridDensity', label: '點線疏密', opts: [['sparse', '疏'], ['mid', '中'], ['dense', '密']] },
      { k: 'tplSize', label: '字大小', opts: [['s', '小'], ['m', '中小'], ['md', '中'], ['l', '大'], ['xl', '特大']] },
      { k: 'tplTone', label: '深淺', opts: [['light', '淺'], ['mid', '中'], ['dark', '深']] },
      { k: 'pressure', label: '壓感', opts: [['auto', '自動'], ['off', '固定']] },
      { k: 'acceptTouch', label: '手指書寫', opts: ONOFF },
      { k: 'perf', label: '效能模式', opts: ONOFF },
      { k: 'autoFlip', label: '自動翻頁', opts: ONOFF },
      { k: 'flipDelay', label: '翻頁等待', opts: [['1', '1秒'], ['2', '2秒'], ['3', '3秒']] },
      { k: 'autoNext', label: '翻頁鈕', opts: ONOFF },
      { k: 'edgeBottom', label: '邊緣留白 下', opts: [['0', '0%'], ['2', '2%'], ['3.5', '3.5%'], ['5', '5%'], ['8', '8%']] },
      { k: 'edgeSide', label: '邊緣留白 左右上', opts: [['0', '0%'], ['1', '1%'], ['2', '2%'], ['3', '3%']] }
    ],
    // 署名 + 落款 block: the name (any script, as typed; the one name used by 落款 and the 印章), and how the 落款 is written. st = the settings object (name, sigDate, sigWord,
    // sigDizi, sigHui), cfg = the copy's config (adds the per-copy 落款 on/off row; null in the app settings), buddhist = true / false for a text of that kind, null = not known (all rows).
    // onChange(k) after every change. Date = the copy's start date, fixed when the copy was made.
    signBlock: function (st, cfg, buddhist, onChange) {
      var box = h('div', { 'data-role': 'sign-block' }), ch = function (k) { if (onChange) onChange(k); };
      var inp = h('input', { type: 'text', value: st.name || '', placeholder: '輸入姓名（落款與印章用）', maxlength: '20', 'data-role': 'name',
        oninput: function () { st.name = inp.value; ch('name'); } });
      box.appendChild(h('h2', { text: '署名與落款' }));
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
    // fields: array of definitions; obj: object to read/mutate; locked(content)->bool; onChange(k, v)
    build: function (fields, obj, locked, onChange) {
      var box = h('div');
      fields.forEach(function (f) {
        var dis = !!(f.content && locked);
        box.appendChild(F.row(f.label, F.seg(f.opts, obj[f.k], function (v) {
          obj[f.k] = v;
          if (f.pick) { if (!obj.picked || typeof obj.picked !== 'object') obj.picked = {}; obj.picked[f.k] = true; }   // explicit choice: never replaced by a changed default
          if (onChange) onChange(f.k, v);
        }, dis), f.k));
      });
      return box;
    }
  };
})();
