(function () {
  'use strict';
  var MX = window.MX;
  var CJK_RE = /[㐀-䶿一-鿿豈-﫿]|[\ud840-\ud87f][\udc00-\udfff]/;

  var STEMS = '甲乙丙丁戊己庚辛壬癸';
  var BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  var NUM = '一二三四五六七八九十';
  // chars that differ between scripts in the date line: 歲/岁 閏/闰 臘/腊
  var TO_SIMP = { '歲': '岁', '閏': '闰', '臘': '腊' };
  var TO_TRAD = { '岁': '歲', '闰': '閏', '腊': '臘' };

  function conv(s, map) {
    return Array.from(s).map(function (c) { return map[c] || c; }).join('');
  }
  function gz(year) {
    var i = year - 4;
    return STEMS.charAt(((i % 10) + 10) % 10) + BRANCHES.charAt(((i % 12) + 12) % 12);
  }
  function cnMonth(m) {
    if (m <= 10) return (m === 1 ? '正' : NUM.charAt(m - 1)) + '月';
    return '十' + NUM.charAt(m - 11) + '月';
  }

  MX.Closing = {
    CJK_RE: CJK_RE,
    isCJK: function (ch) { return CJK_RE.test(ch); },
    verse: {
      trad: '願以此功德，普及於一切，我等與眾生，皆共成佛道。',
      simp: '愿以此功德，普及于一切，我等与众生，皆共成佛道。'
    },
    // Lunar-calendar date line such as 歲次丙午年九月 (falls back to Gregorian month).
    dateLine: function (script, d) {
      d = d || new Date();
      var year = null, month = null;
      try {
        var parts = new Intl.DateTimeFormat('zh-Hant-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(d);
        parts.forEach(function (p) {
          if (p.type === 'yearName' && /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(p.value)) year = p.value;
          if (p.type === 'month' && /月$/.test(p.value)) month = p.value;
        });
      } catch (e) { /* Intl chinese calendar unavailable */ }
      if (!year) year = gz(d.getFullYear());
      if (!month || !/^[閏闰]?[正二三四五六七八九十冬臘腊]{1,2}月$/.test(month)) month = cnMonth(d.getMonth() + 1);
      var s = '歲次' + year + '年' + month;
      s = conv(s, TO_TRAD);
      return script === 'simp' ? conv(s, TO_SIMP) : s;
    },
    signLine: function (script, name, d) {
      var s = MX.Closing.dateLine(script, d);
      name = (name || '').replace(/\s+/g, '');
      if (name) s += name + '敬抄';
      return s;
    }
  };
})();
