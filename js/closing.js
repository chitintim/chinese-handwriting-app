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

  var DIG = '〇一二三四五六七八九';
  // 1..99 in Chinese numerals (日 / 月 / page numbers): 一 ... 十 十一 二十 二十一 三十一
  function cnNum(n) {
    n = Math.floor(n);
    if (n <= 0) return DIG.charAt(0);
    if (n < 10) return NUM.charAt(n - 1);
    if (n === 10) return '十';
    if (n < 20) return '十' + NUM.charAt(n - 11);
    var t = Math.floor(n / 10) % 10, o = n % 10;
    return NUM.charAt(t - 1) + '十' + (o ? NUM.charAt(o - 1) : '');
  }
  var SUFFIX = { jing: ['敬書', '敬书'], lu: ['恭錄', '恭录'], mu: ['沐手敬書', '沐手敬书'] };

  MX.Closing = {
    CJK_RE: CJK_RE,
    cnNum: cnNum,
    // 干支 of a (Gregorian) year: stem = (y - 4) mod 10, branch = (y - 4) mod 12; 1984 甲子, 2026 丙午. No lunar-new-year / 立春 adjustment.
    ganzhi: gz,
    yearDigits: function (y) { return String(Math.floor(y)).split('').map(function (d) { return DIG.charAt(+d); }).join(''); },
    // Date line of a 作品: style 'gz' -> 丙午年十月三十日, 'ce' -> 公元二〇二六年十月三十日 (Gregorian month/day in numerals, no lunar calendar)
    exportDate: function (script, ts, style) {
      var d = new Date(ts), y = d.getFullYear();
      var head = style === 'ce' ? '公元' + MX.Closing.yearDigits(y) + '年' : gz(y) + '年';
      return head + cnNum(d.getMonth() + 1) + '月' + cnNum(d.getDate()) + '日';
    },
    SUFFIX_KEYS: ['jing', 'lu', 'mu'],
    suffix: function (script, key) { var s = SUFFIX[key] || SUFFIX.jing; return script === 'simp' ? s[1] : s[0]; },
    nameLine: function (script, name, key) {
      name = (name || '').replace(/\s+/g, '');
      return name ? name + MX.Closing.suffix(script, key) : '';
    },
    // the 迴向 verse as two lines of ten characters, punctuation removed
    verseLines: function (script) {
      var s = Array.from(MX.Closing.verse[script === 'simp' ? 'simp' : 'trad']).filter(function (c) { return CJK_RE.test(c); });
      return [s.slice(0, 10).join(''), s.slice(10).join('')];
    },
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
