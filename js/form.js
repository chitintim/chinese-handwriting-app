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
      { k: 'title', label: '標題頁', content: true, opts: ONOFF },
      { k: 'closing', label: '迴向', content: true, opts: ONOFF },
      { k: 'sign', label: '落款', content: true, opts: ONOFF }
    ],
    SETTINGS: [
      { k: 'inkWidth', label: '筆粗', opts: [['thin', '細'], ['mid', '中'], ['thick', '粗']] },
      { k: 'tplStyle', label: '描紅樣式', opts: [['fill', '灰色'], ['dots', '網點'], ['outline', '空心']] },
      { k: 'tplFont', label: '字體', opts: [['ukai', '楷書'], ['tw', '正楷'], ['msz', '行楷'], ['wk', '硬筆']] },
      { k: 'gridLook', label: '格線樣式', opts: [['dots', '點線(黑)'], ['light', '實線淺灰'], ['black', '實線黑']] },
      { k: 'gridDensity', label: '點線疏密', opts: [['sparse', '疏'], ['mid', '中'], ['dense', '密']] },
      { k: 'tplSize', label: '字大小', opts: [['s', '小'], ['m', '中'], ['l', '大'], ['xl', '特大']] },
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
          obj[f.k] = v; if (onChange) onChange(f.k, v);
        }, dis), f.k));
      });
      return box;
    }
  };
})();
