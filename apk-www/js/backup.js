(function () {
  'use strict';
  // Backups, storage and the 建議備份 nudge (SPEC revision 21).
  //   File: {app:'moxie', version:2, kind:'full'|'partial', exportedAt, appVersion, libVersion, schema, scope?, counts, entries}; gzip-compressed when the browser can
  //   (CompressionStream), named 墨字帖-備份-YYYYMMDD.moxie; the old plain JSON (version 1, no kind) is still read, and so is a plain-JSON file of version 2.
  //   Import = a preview of what is in the file, then 合併 (default: adds and updates, never deletes) or 全部取代 (the old behaviour; not offered for a partial backup).
  var MX = window.MX, h = MX.h, Store = MX.Store, Model = MX.Model, Lib = MX.Library;
  var VERSION = 2;                 // wrapper version written; 1 (before revision 21) is read too
  var DAY = 86400000;
  var NUDGE_FINISHED = 3, NUDGE_DAYS = 14, SNOOZE_DAYS = 7;
  var EXT = '.moxie';
  var LIMIT = { file: 200 * 1048576, text: 400 * 1048576 };       // refused above: the file as it is on disk, and what a gzip file unpacks to (a gzip bomb stops at the second)

  // UI sentences ({slot}s are filled by MX.fmt: a sentence is never glued together from pieces, so a later 繁 / 简 / EN toggle can swap each whole sentence)
  var STR = {
    file: '墨字帖-備份', fileFull: '{base}-{date}', fileText: '{base}-{text}-{date}', fileCopy: '{base}-{text}-第{no}遍-{date}',
    notBackup: '不是墨字帖的備份檔', notJson: '不是有效的備份檔（內容無法讀取）', newer: '這份備份來自較新的版本，請先更新墨字帖再匯入', noGzip: '此瀏覽器無法讀取壓縮的備份檔', tooBig: '檔案太大（超過 {mb} MB），無法匯入', tooBigInflated: '解壓縮後的內容太大（超過 {mb} MB），無法匯入',
    empty: '備份裡沒有可用的資料',
    // 資料 panel
    storageTitle: '儲存空間', storageUsed: '已用 {used}，上限約 {quota}（你的字跡與資料約 {mine}）', storageMine: '你的字跡與資料約 {mine}（此瀏覽器查不到總用量）',
    persistYes: '長期保存：已允許', persistNo: '長期保存：尚未允許（空間不足時，瀏覽器可能清除網站資料）', persistNone: '長期保存：此瀏覽器沒有這項功能',
    persistAsk: '申請長期保存', persistGot: '已允許長期保存', persistDenied: '瀏覽器沒有答應。常見原因：使用紀錄不夠，或需要先加到主畫面。',
    worksCount: '作品：{n} 份（已完成 {m} 份）',
    lastNever: '上次備份：還沒有備份過', lastToday: '上次備份：{date}（今天）', lastAgo: '上次備份：{date}（{d} 天前）',
    separate: '網頁版和 APK 的資料各自獨立。要搬移，請在這裡備份，再到另一邊匯入。',
    privacy: '資料只存在這台裝置，不會上傳。備份包含抄寫進度、字跡、收藏和自訂文本。',
    exportFull: '匯出完整備份', importBtn: '匯入備份', worksBtn: '我的作品',
    // nudge
    nudgeTitle: '建議備份',
    nudgeFinishedSince: '上次備份之後，你已完成 {n} 份作品，還沒備份。', nudgeFinishedNever: '你已完成 {n} 份作品，還沒備份過。',
    nudgeDaysSince: '已經 {d} 天沒有備份，這段時間的字跡只在這台裝置上。', nudgeDaysNever: '寫了 {d} 天，還沒備份過，字跡只在這台裝置上。',
    nudgeNow: '立即備份', nudgeLater: '一週後再提醒',
    // saving
    savedToast: '備份已儲存', saveFail: '備份失敗',
    // import
    pickTitle: '備份內容', kindFull: '完整備份', kindPartial: '部分備份：{what}', kindText: '一篇文本「{title}」', kindCopy: '一份作品「{title}」',
    infoDate: '備份時間：{date}', infoWorks: '作品：{n} 份（已完成 {m} 份）', infoTexts: '文本：{n} 篇（自訂 {c} 篇）', infoFavs: '收藏：{n} 個', infoSettings: '設定：{v}',
    has: '有', hasNot: '沒有', infoLib: '字帖庫版本：備份 {a}，這台 {b}', infoBad: '無法讀取的資料：{n} 筆（會略過）', infoHere: '這台裝置現有：{n} 份作品',
    planTitle: '合併後預計', planAdd: '新增 {n} 份作品', planUpdate: '更新 {n} 份（備份裡的較新，或補上這裡缺少的字）', planBoth: '{n} 份兩邊都保留（內容不同）', planKeep: '{n} 份已有相同或較新的，不動',
    merge: '合併（建議）', replace: '全部取代', cancel: '取消', withSettings: '同時套用備份裡的設定',
    mergeNote: '合併只會新增或更新，不會刪除這台裝置上的任何作品。',
    replaceOnlyFull: '部分備份只能合併。',
    replaceTitle: '取代這台裝置的所有資料？', replaceBody: '這台裝置現有的 {n} 份作品、收藏和設定會被這份備份取代，無法復原。建議先匯出目前的資料。', replaceOk: '取代所有資料',
    resultTitle: '匯入完成', resultMerge: '合併完成', resultReplace: '已取代為備份的內容（{n} 筆）',
    resAdded: '新增 {n} 份作品', resUpdated: '更新 {n} 份作品', resBoth: '{n} 份兩邊都保留', resSame: '{n} 份已有相同或較新的', resOther: '另外新增：已抄紀錄 {d} 筆、收藏 {f} 個、自訂文本 {c} 篇',
    resSkipped: '略過 {n} 筆無效資料', resSettings: '已套用備份裡的設定', resArchived: '其中 {n} 份因為這裡已有進行中的同一章，存成已存檔',
    failTitle: '匯入沒有完成', resFailed: '匯入中途出錯，可能只完成了一部分（{why}）。已盡量還原；如果資料看起來不完整，請再匯入一次。', resFailedReplace: '匯入出錯，已還原為匯入前的資料（{why}）。',
    resWriteErr: '有 {n} 筆資料沒能寫入（儲存空間不足？）。請先匯出目前的資料，再清出空間後重試。',
    noReplaceEmpty: '這份備份裡沒有任何作品，不能用來取代這台裝置的資料（會把你的作品清空）。',
    badTitle: '略過的資料', done: '完成', viewWorks: '查看我的作品', importFail: '匯入失敗：{why}'
  };
  MX.I18n.live(STR, ['file', 'fileFull', 'fileText', 'fileCopy']);       // read through MX.t each time; the file names stay Chinese in every language

  // ---- entry validation: what a backup may hold, by key pattern and type
  var ID = '[\\w.-]{1,100}';
  var KEY = {
    schema: /^schema$/, settings: /^settings$/,
    copy: new RegExp('^copy:(' + ID + ')$'), ink: new RegExp('^ink:(' + ID + '):([ts]?\\d{1,6})$'), done: new RegExp('^done:(' + ID + ')$'),
    fav: new RegExp('^fav:(' + ID + ')(?::(' + ID + '))?$'), custom: new RegExp('^custom:(' + ID + ')$'), textcfg: new RegExp('^textcfg:(' + ID + ')$')
  };
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function optNum(v) { return v === undefined || v === null || isNum(v); }
  // null = fine, else why the entry is skipped
  function check(key, v) {
    var m;
    if (/(^|:)__proto__(:|$)/.test(key)) return MX.t('不認識的資料');
    if (KEY.schema.test(key)) return isNum(v) ? null : MX.t('版本號不是數字');
    if (KEY.settings.test(key)) return isObj(v) ? null : MX.t('設定格式不對');
    if ((m = KEY.copy.exec(key))) {
      if (!isObj(v)) return MX.t('作品資料格式不對');
      if (v.id !== m[1]) return MX.t('作品編號與資料不符');
      if (typeof v.textId !== 'string' || !v.textId) return MX.t('作品缺少文本');
      if (v.status !== 'active' && v.status !== 'archived') return MX.t('作品狀態不明');
      if (!optNum(v.createdAt) || !optNum(v.updatedAt) || !optNum(v.completedAt) || !optNum(v.archivedAt) || !optNum(v.filled) || !optNum(v.total)) return MX.t('作品的數字欄位不對');
      if (v.cfg !== undefined && v.cfg !== null && !isObj(v.cfg)) return MX.t('作品選項格式不對');
      return null;
    }
    if (KEY.ink.test(key)) {
      if (!Array.isArray(v)) return MX.t('字跡格式不對');
      for (var i = 0; i < v.length; i++) if (!Array.isArray(v[i]) && !isObj(v[i])) return MX.t('字跡格式不對');
      return null;
    }
    if (KEY.done.test(key)) return isObj(v) && typeof v.textId === 'string' && v.textId ? null : MX.t('完成紀錄格式不對');
    if (KEY.fav.test(key)) return isObj(v) && typeof v.textId === 'string' && v.textId ? null : MX.t('收藏格式不對');
    if ((m = KEY.custom.exec(key))) return isObj(v) && v.id === m[1] && typeof v.title === 'string' && typeof v.body === 'string' ? null : MX.t('自訂文本格式不對');
    if (KEY.textcfg.test(key)) return isObj(v) ? null : MX.t('文本選項格式不對');
    return MX.t('不認識的資料');
  }

  var B = MX.Backup = {
    STR: STR, VERSION: VERSION, EXT: EXT, check: check, limits: LIMIT,
    now: function () { return Date.now(); },       // the tests move this clock (nudge rules)

    // ------------------------------------------------------------------ building a file
    // scope: null = everything (a full backup), {text: id} = one text with all its writings, {copy: id} = one writing
    build: function (scope) {
      Model.flushAll();
      var all = Store.exportAll(), entries = {}, tid = null, info = null;
      if (!scope) {
        Object.keys(all).forEach(function (k) { entries[k] = all[k]; });
        // 書寫工具 describes this device (touch or pen) and 介面語言 is this device's own choice: a backup does not carry them (see replace / merge)
        if (isObj(entries.settings)) { entries.settings = Object.assign({}, entries.settings); delete entries.settings.inputMode; delete entries.settings.uiLang; }
      } else {
        var ids = {};
        if (scope.copy) { var c0 = Model.copies[scope.copy]; if (c0) { ids[c0.id] = 1; tid = c0.textId; info = { copy: c0.id, text: tid, no: MX.Export.writingNo(c0) }; } }
        else if (scope.text) { tid = scope.text; info = { text: tid }; Object.keys(Model.copies).forEach(function (id) { if (Model.copies[id].textId === tid) ids[id] = 1; }); }
        Object.keys(all).forEach(function (k) {
          var m, v = all[k];
          if ((m = KEY.copy.exec(k))) { if (ids[m[1]]) entries[k] = v; }
          else if ((m = KEY.ink.exec(k))) { if (ids[m[1]]) entries[k] = v; }
          else if (KEY.done.test(k)) { if (isObj(v) && (ids[v.copyId] || (scope.text && v.textId === tid))) entries[k] = v; }
          else if ((m = KEY.fav.exec(k))) { if (scope.text && m[1] === tid) entries[k] = v; }
          else if ((m = KEY.custom.exec(k))) { if (m[1] === tid) entries[k] = v; }
          else if ((m = KEY.textcfg.exec(k))) { if (scope.text && m[1] === tid) entries[k] = v; }
        });
        var e = Lib.entry(tid);
        if (info && e) info.title = e.title.trad;
      }
      var w = { app: 'moxie', version: VERSION, kind: scope ? 'partial' : 'full', exportedAt: new Date(B.now()).toISOString(), appVersion: B.appVersion(), libVersion: Lib.version(), schema: Model.SCHEMA };
      if (info) w.scope = info;
      w.counts = B.count(entries);
      w.entries = entries;
      return w;
    },
    appVersion: function () { return (document.querySelector('meta[name=mx-version]') || {}).content || ''; },
    // numbers for the preview and the file header: writings (copies that hold something), finished ones, texts, 自訂 texts, 收藏
    count: function (entries) {
      var n = { copies: 0, finished: 0, texts: 0, custom: 0, favs: 0, done: 0, settings: !!entries.settings }, seen = {};
      Object.keys(entries).forEach(function (k) {
        var v = entries[k], m;
        if ((m = KEY.copy.exec(k))) { if (isObj(v) && (v.filled > 0 || v.completedAt)) { n.copies++; if (v.completedAt) n.finished++; seen[v.textId] = 1; } }
        else if (KEY.custom.test(k)) { n.custom++; seen[v.id] = 1; }
        else if (KEY.fav.test(k)) n.favs++;
        else if (KEY.done.test(k)) n.done++;
      });
      n.texts = Object.keys(seen).length;
      return n;
    },

    // ------------------------------------------------------------------ file <-> bytes
    canCompress: function () { return typeof CompressionStream === 'function' && typeof Blob === 'function' && typeof Blob.prototype.stream === 'function' && typeof Response === 'function'; },
    canDecompress: function () { return typeof DecompressionStream === 'function' && typeof Blob.prototype.stream === 'function' && typeof Response === 'function'; },
    gzip: async function (text) {
      return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    },
    // unpack, reading the stream piece by piece and stopping as soon as it passes LIMIT.text bytes
    gunzip: async function (bytes) {
      var rd = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(), parts = [], n = 0, r;
      for (;;) {
        r = await rd.read();
        if (r.done) break;
        n += r.value.length;
        if (n > LIMIT.text) { try { await rd.cancel(); } catch (e) { /* ignore */ } var er = new Error(MX.fmt(STR.tooBigInflated, { mb: Math.round(LIMIT.text / 1048576) })); er.tooBig = true; throw er; }
        parts.push(r.value);
      }
      var all = new Uint8Array(n), at = 0;
      parts.forEach(function (c) { all.set(c, at); at += c.length; });
      return new TextDecoder('utf-8').decode(all);
    },
    // the file name: 墨字帖-備份-20261101.moxie / 墨字帖-備份-心經-20261101.moxie / 墨字帖-備份-心經-第2遍-20261101.moxie (.json when the browser cannot compress)
    fileName: function (w, compressed) {
      var d = new Date(B.now()), ymd = d.getFullYear() + MX.pad2(d.getMonth() + 1) + MX.pad2(d.getDate()), sc = w.scope, ttl = '';
      if (sc) {
        var e = sc.text ? Lib.entry(sc.text) : null;
        ttl = (e ? e.title.trad : sc.text || '').replace(/[\\/:*?"<>|\s]+/g, '_');
        if (sc.text === 'heart-sutra') ttl = '心經';
      }
      var s = !sc ? MX.fmt(STR.fileFull, { base: STR.file, date: ymd }) : (sc.copy ? MX.fmt(STR.fileCopy, { base: STR.file, text: ttl, no: sc.no || 1, date: ymd }) : MX.fmt(STR.fileText, { base: STR.file, text: ttl, date: ymd }));
      return s + (compressed ? EXT : '.json');
    },
    // -> {blob, name, mime, compressed, plainBytes, bytes}
    encode: async function (w) {
      var text = JSON.stringify(w), plain = new Blob([text], { type: 'application/json' });
      if (B.canCompress()) {
        try {
          var z = await B.gzip(text);
          return { blob: new Blob([z], { type: 'application/octet-stream' }), name: B.fileName(w, true), mime: 'application/octet-stream', compressed: true, plainBytes: plain.size, bytes: z.size };
        } catch (e) { MX.err(e); }
      }
      return { blob: plain, name: B.fileName(w, false), mime: 'application/json', compressed: false, plainBytes: plain.size, bytes: plain.size };
    },
    savedOk: function (st) {      // the status is in the interface language (the APK bridge too): compare with the start of each message in all three
      var s = String(st || '');
      return ['已儲存', '已下載', '已分享'].some(function (k) { return MX.I18n.all(k).some(function (p) { return s.indexOf(p) === 0; }); });
    },
    noteSaved: function (w) {
      var rec = { ts: B.now(), n: w.counts ? w.counts.copies : 0, kind: w.kind };
      if (w.kind === 'full') Store.set('sys:lastBackup', rec); else Store.set('sys:lastPartial', rec);
      if (w.kind === 'full') Store.del('sys:backupSnooze');
    },
    // build + compress + save (call straight from a tap). Resolves to {status, ok, file, wrapper}
    save: async function (scope) {
      var w = B.build(scope), f = await B.encode(w), st = await MX.saveFile(f.name, f.blob, f.mime), ok = B.savedOk(st);
      if (ok) B.noteSaved(w);
      MX.toast(st);
      return { status: st, ok: ok, file: f, wrapper: w };
    },

    // ------------------------------------------------------------------ reading a file
    // plain JSON text -> the wrapper (throws Error with a message fit for the user)
    parse: function (text) {
      var o;
      text = String(text);
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      try { o = JSON.parse(text); } catch (e) { throw new Error(STR.notJson); }
      if (!o || o.app !== 'moxie' || !isObj(o.entries)) throw new Error(STR.notBackup);
      if ((o.version || 1) > VERSION) throw new Error(STR.newer);
      return o;
    },
    readBytes: function (blob) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(new Uint8Array(fr.result)); };
        fr.onerror = function () { rej(fr.error || new Error(STR.notJson)); };
        fr.readAsArrayBuffer(blob);
      });
    },
    // a File / Blob / Uint8Array (gzip or plain JSON, found by its first bytes, never by the name) -> the wrapper
    read: async function (src) {
      var size = src instanceof Uint8Array ? src.length : src.size;
      if (size > LIMIT.file) throw new Error(MX.fmt(STR.tooBig, { mb: Math.round(LIMIT.file / 1048576) }));
      var bytes = src instanceof Uint8Array ? src : await B.readBytes(src), text;
      if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        if (!B.canDecompress()) throw new Error(STR.noGzip);
        try { text = await B.gunzip(bytes); } catch (e) { if (e.tooBig) throw e; throw new Error(STR.notJson); }
      } else {
        if (bytes.length > LIMIT.text) throw new Error(MX.fmt(STR.tooBig, { mb: Math.round(LIMIT.text / 1048576) }));
        text = new TextDecoder('utf-8').decode(bytes);
      }
      return B.parse(text);
    },

    // ------------------------------------------------------------------ inspecting: what is usable in a file
    // -> {wrapper, kind, date, valid: entries to import, bad: [{key, why}], counts, copies: [meta], scope, libVersion}
    inspect: function (w) {
      var valid = {}, bad = [], copies = {}, keys = Object.keys(w.entries), pend = [];
      keys.forEach(function (k) {
        var why = check(k, w.entries[k]);
        if (why) { bad.push({ key: k, why: why }); return; }
        if (KEY.ink.test(k)) { pend.push(k); return; }
        valid[k] = w.entries[k];
        var m = KEY.copy.exec(k);
        if (m) copies[m[1]] = w.entries[k];
      });
      pend.forEach(function (k) {      // an ink entry needs the copy it belongs to in the same file
        var m = KEY.ink.exec(k);
        if (copies[m[1]]) valid[k] = w.entries[k]; else bad.push({ key: k, why: MX.t('找不到這筆字跡的作品') });
      });
      var counts = B.count(valid);
      return { wrapper: w, kind: w.kind === 'partial' ? 'partial' : 'full', version: w.version || 1, date: w.exportedAt || '', libVersion: w.libVersion, scope: w.scope || null,
        valid: valid, bad: bad, counts: counts, copies: copies, total: keys.length };
    },

    // ------------------------------------------------------------------ importing
    inkKeys: function (entries, id) {
      var pre = 'ink:' + id + ':';
      return Object.keys(entries).filter(function (k) { return k.indexOf(pre) === 0; }).sort();
    },
    inkDigest: function (entries, id, meta) {
      return MX.hash53(B.inkKeys(entries, id).map(function (k) { return k + '=' + JSON.stringify(entries[k]); }).join('|') + '#' + meta.status);
    },
    localEntries: function () { Model.flushAll(); return Store.exportAll(); },
    // the cells of copy `id` in an entries object: {cell: JSON of its strokes}
    cellsOf: function (entries, id) {
      var pre = 'ink:' + id + ':', o = {};
      Object.keys(entries).forEach(function (k) { if (k.indexOf(pre) === 0) o[k.slice(pre.length)] = JSON.stringify(entries[k]); });
      return o;
    },
    // Marks a copy that came without a text fingerprint from a backup of ANOTHER library version (or of a version-1 file, which does not say): fp '?' = we cannot tell whether the
    // text changed since it was written (no notice, never adopted by backfillFp). From a file of this very library version the missing fp is filled in later as usual.
    markFp: function (meta, rep) {
      if (!meta.fp && !(rep.libVersion !== undefined && rep.libVersion !== null && rep.libVersion === Lib.version())) meta.fp = '?';
      return meta;
    },
    // What a merge would do, copy by copy (cell by cell for the same writing). For a copy whose id is here:
    //   a different writing (other text / section / start time), or a different ink-key version (keyv) with a file at least as new -> `both`
    //   the file is newer -> `update` (the file wins on cells in both; cells only this device has are kept, see `info[id].localOnly`)
    //   this device is newer -> `older` (this device wins; the cells of the file this device lacks are still copied in: `info[id].missing`)
    //   same time -> `same` if every cell of the file is here identically, `union` if the file only adds cells (none differs), else `both`
    // -> {add, update, union, both, same, older: [file copies], info: {id: {missing: [cells], conflict, localOnly}}}
    plan: function (rep) {
      var local = B.localEntries(), out = { add: [], update: [], union: [], both: [], same: [], older: [], info: {} };
      Object.keys(rep.copies).forEach(function (id) {
        var fc = rep.copies[id], lc = Object.prototype.hasOwnProperty.call(Model.copies, id) ? Model.copies[id] : null;
        if (!lc) { out.add.push(fc); return; }
        var lineage = lc.textId === fc.textId && Model.sid(lc) === Model.sid(fc) && (lc.createdAt || 0) === (fc.createdAt || 0);
        if (!lineage) { out.both.push(fc); return; }
        var sf = Model.stamp(fc), sl = Model.stamp(lc), fcl = B.cellsOf(rep.valid, id), lcl = B.cellsOf(local, id), info = { missing: [], conflict: 0, localOnly: 0 };
        Object.keys(fcl).forEach(function (k) { if (lcl[k] === undefined) info.missing.push(k); else if (lcl[k] !== fcl[k]) info.conflict++; });
        Object.keys(lcl).forEach(function (k) { if (fcl[k] === undefined) info.localOnly++; });
        out.info[id] = info;
        if ((fc.keyv || 1) !== (lc.keyv || 1)) {        // the cell numbers mean different things: never mix them
          if (sf >= sl) out.both.push(fc); else { info.missing = []; out.older.push(fc); }
          return;
        }
        if (sf > sl) out.update.push(fc);
        else if (sf < sl) out.older.push(fc);
        else if (info.conflict) out.both.push(fc);
        else if (info.missing.length) out.union.push(fc);
        else out.same.push(fc);
      });
      return out;
    },
    // Merge: adds and updates, never deletes (see plan). A file copy that is added as a second copy of a section that already has an active copy here is stored archived (one
    // active copy per section). Every write is journaled: if something throws half way the writes are undone. opts.settings = also take the settings of the file. -> the report
    merge: function (rep, opts) {
      opts = opts || {};
      var plan = B.plan(rep), V = rep.valid, journal = [], remap = {}, touched = [], active = {};
      var rpt = { mode: 'merge', added: 0, updated: 0, both: 0, archived: 0, same: 0, done: 0, favs: 0, custom: 0, textcfg: 0, settings: false, bad: rep.bad };
      function put(k, v) { journal.push([k, Store.get(k)]); Store.set(k, v); }
      function undo() {
        for (var i = journal.length - 1; i >= 0; i--) { if (journal[i][1] === undefined) Store.del(journal[i][0]); else Store.set(journal[i][0], journal[i][1]); }
        journal = [];
      }
      Object.keys(Model.copies).forEach(function (id) { var c = Model.copies[id]; if (c.status === 'active') active[c.textId + '|' + Model.sid(c)] = 1; });
      function cells(fc, targetId, only) {       // write the file's cells (only: just these) as ink of targetId
        var pre = 'ink:' + fc.id + ':';
        B.inkKeys(V, fc.id).forEach(function (k) { var cell = k.slice(pre.length); if (!only || only.indexOf(cell) >= 0) put('ink:' + targetId + ':' + cell, V[k]); });
      }
      function fresh(fc, newId) {          // a copy of the file stored as a new one
        var meta = B.markFp(Object.assign({}, fc), rep), key = meta.textId + '|' + Model.sid(meta);
        if (newId) meta.id = newId;
        if (meta.status === 'active') {
          if (active[key]) { meta.status = 'archived'; meta.archivedAt = meta.archivedAt || B.now(); rpt.archived++; } else active[key] = 1;
        }
        put('copy:' + meta.id, meta);
        cells(fc, meta.id);
      }
      try {
        plan.add.forEach(function (fc) { fresh(fc); rpt.added++; });
        plan.both.forEach(function (fc) { var nid = MX.uid(); remap[fc.id] = nid; fresh(fc, nid); rpt.both++; });
        plan.update.forEach(function (fc) {
          var lc = Model.copies[fc.id], meta = Object.assign({}, fc), info = plan.info[fc.id];
          if (!meta.fp && lc.fp) { meta.fp = lc.fp; meta.libv = lc.libv; if (lc.fpAck) meta.fpAck = lc.fpAck; } else B.markFp(meta, rep);       // the file says nothing about the text: keep what this device knows
          if (info.localOnly) meta.updatedAt = Math.max(Model.stamp(fc), Model.stamp(lc)) + 1;       // this device's own cells are in it now: newer than the file, so a second import of the same file changes nothing
          put('copy:' + fc.id, meta);
          cells(fc, fc.id);
          touched.push(fc.id); rpt.updated++;
        });
        plan.union.forEach(function (fc) { cells(fc, fc.id, plan.info[fc.id].missing); touched.push(fc.id); rpt.updated++; });
        plan.older.forEach(function (fc) {
          var m = plan.info[fc.id].missing;
          if (m.length) { cells(fc, fc.id, m); touched.push(fc.id); rpt.updated++; } else rpt.same++;
        });
        rpt.same += plan.same.length;
        Object.keys(V).forEach(function (k) {
          var v = V[k], m;
          if (KEY.done.test(k)) {
            if (Store.get(k) === undefined) { var d = Object.assign({}, v); if (remap[d.copyId]) d.copyId = remap[d.copyId]; put(k, d); rpt.done++; }
          } else if (KEY.fav.test(k)) { if (Store.get(k) === undefined) { put(k, v); rpt.favs++; } }
          else if ((m = KEY.custom.exec(k))) {
            var cur = Store.get(k);
            if (cur === undefined || (v.updatedAt || 0) > (cur.updatedAt || 0)) { put(k, v); rpt.custom++; }
          } else if (KEY.textcfg.test(k)) { if (Store.get(k) === undefined) { put(k, v); rpt.textcfg++; } }
        });
        if (opts.settings && isObj(V.settings)) {
          var st = Object.assign({}, Store.get('settings') || {}, V.settings);
          if (Model.settings && Model.settings.inputMode) st.inputMode = Model.settings.inputMode;       // this device's own choice
          if (Model.settings && Model.settings.uiLang) st.uiLang = Model.settings.uiLang;
          put('settings', st);
          rpt.settings = true;
        }
      } catch (e) {
        try { undo(); } catch (e2) { MX.err(e2); }
        try { B.reload(); } catch (e3) { MX.err(e3); }
        e.merged = true;
        throw e;
      }
      B.reload();
      // a copy that gained cells: count its progress again
      touched.forEach(function (id) {
        var c = Model.copies[id];
        if (c) { Model.loadInk(c); Model.recount(c); Model.saveMeta(c); c.ink = undefined; }
      });
      B.lastReport = rpt;
      return rpt;
    },
    // Replace: the old behaviour. Everything that is backed up is cleared first, then the usable entries of the file are written; 書寫工具 stays what this device has.
    // Refused (throws) for a partial file, and for a file without a single writing when this device has writings (it would empty the device). If anything throws while
    // writing, the entries this device had are put back.
    replace: function (rep) {
      if (rep.kind === 'partial') throw new Error(STR.replaceOnlyFull);
      var here = B.workCount();
      if (!Object.keys(rep.valid).length || (rep.counts.copies === 0 && here > 0)) throw new Error(STR.noReplaceEmpty);
      var keep = Model.settings && Model.settings.inputMode, keepLang = Model.settings && Model.settings.uiLang, old = Store.exportAll(), valid = Object.assign({}, rep.valid);
      if (isObj(valid.settings)) { valid.settings = Object.assign({}, valid.settings); delete valid.settings.uiLang; }
      Object.keys(valid).forEach(function (k) { if (KEY.copy.test(k)) valid[k] = B.markFp(Object.assign({}, valid[k]), rep); });
      try {
        Store.importAll(valid);
        B.reload();
        if (keep) Model.settings.inputMode = keep;
        if (keepLang) { Model.settings.uiLang = keepLang; MX.I18n.apply(keepLang); }
        if (keep || keepLang) Model.saveSettings();
      } catch (e) {
        try { Store.importAll(old); B.reload(); } catch (e2) { MX.err(e2); }
        e.restored = true;
        throw e;
      }
      B.lastReport = { mode: 'replace', n: Object.keys(valid).length, bad: rep.bad };
      return B.lastReport;
    },
    workCount: function () { return Object.keys(Model.copies).map(function (id) { return Model.copies[id]; }).filter(function (x) { return x.filled > 0 || x.completedAt; }).length; },
    reload: function () {
      Model.init();
      try { Model.backfillFp(); } catch (e) { MX.err(e); }       // copies marked '?' (markFp) are skipped: they stay "can't tell"
    },

    // ------------------------------------------------------------------ storage
    // -> {mine: bytes of the user's data, usage, quota (null when the browser cannot say), persisted (true | false | null), canPersist}
    storageInfo: async function () {
      var o = { mine: Store.sizeEstimate(), usage: null, quota: null, persisted: null, canPersist: false }, sm = navigator.storage;
      try { if (sm && typeof sm.estimate === 'function') { var e = await sm.estimate(); if (e && isNum(e.usage)) { o.usage = e.usage; o.quota = isNum(e.quota) ? e.quota : null; } } } catch (x) { /* ignore */ }
      try { if (sm && typeof sm.persisted === 'function') o.persisted = !!(await sm.persisted()); } catch (x) { /* ignore */ }
      o.canPersist = !!(sm && typeof sm.persist === 'function');
      return o;
    },
    requestPersist: async function () {
      try { return !!(await navigator.storage.persist()); } catch (e) { MX.err(e); return false; }
    },
    last: function () { var r = Store.get('sys:lastBackup'); return r && isNum(r.ts) ? r : null; },
    daysSince: function (ts) { return Math.max(0, Math.floor((B.now() - ts) / DAY)); },
    lastLine: function () {
      var l = B.last();
      if (!l) return STR.lastNever;
      var d = B.daysSince(l.ts), date = MX.fmtDate(l.ts);
      return d < 1 ? MX.fmt(STR.lastToday, { date: date }) : MX.fmt(STR.lastAgo, { date: date, d: d });
    },

    // ------------------------------------------------------------------ the 建議備份 nudge
    // null, or {reason: 'finished' | 'days', n, d, never}: there is work not in the last backup AND (3+ writings finished since it, or 14+ days since it - or since the first writing
    // when there never was a backup), unless it was put off (sys:backupSnooze)
    nudge: function () {
      var now = B.now(), snooze = Store.get('sys:backupSnooze');
      if (isNum(snooze) && now < snooze) return null;
      var l = B.last(), ref = l ? l.ts : 0, ws = Model.works();
      var fresh = ws.filter(function (c) { return Model.stamp(c) > ref; });
      if (!fresh.length) return null;
      var fin = ws.filter(function (c) { return c.completedAt && c.completedAt > ref; }).length;
      var since = l ? l.ts : ws.reduce(function (a, c) { return Math.min(a, c.createdAt || a); }, now), days = Math.floor((now - since) / DAY);
      if (fin >= NUDGE_FINISHED) return { reason: 'finished', n: fin, d: days, never: !l };
      if (days >= NUDGE_DAYS) return { reason: 'days', n: fin, d: days, never: !l };
      return null;
    },
    snooze: function () { Store.set('sys:backupSnooze', B.now() + SNOOZE_DAYS * DAY); },
    // a small card for the home screen (not a modal), or null
    nudgeCard: function () {
      var n = B.nudge();
      if (!n) return null;
      var msg = n.reason === 'finished' ? MX.fmt(n.never ? STR.nudgeFinishedNever : STR.nudgeFinishedSince, { n: n.n }) : MX.fmt(n.never ? STR.nudgeDaysNever : STR.nudgeDaysSince, { d: n.d });
      var card = h('div', { class: 'card tip nudge', 'data-role': 'backup-nudge', 'data-reason': n.reason }, [
        h('div', { class: 't', text: STR.nudgeTitle }),
        h('div', { class: 'm', 'data-role': 'nudge-msg', text: msg }),
        h('div', { class: 'btnrow' }, [
          h('button', { class: 'on', text: STR.nudgeNow, 'data-act': 'nudge-backup', onclick: async function (ev) {
            var b = ev.currentTarget; b.disabled = true;
            try { var r = await B.save(null); if (r.ok && card.parentNode) card.parentNode.removeChild(card); else b.disabled = false; } catch (e) { MX.err(e); MX.toast(STR.saveFail); b.disabled = false; }
          } }),
          h('button', { text: STR.nudgeLater, 'data-act': 'nudge-snooze', onclick: function () { B.snooze(); if (card.parentNode) card.parentNode.removeChild(card); } })
        ])
      ]);
      return card;
    },

    // ------------------------------------------------------------------ UI: the import dialog and the 資料 panel
    openFile: async function (file, done) {
      var rep;
      try { rep = B.inspect(await B.read(file)); } catch (e) { MX.err(e); MX.toast(MX.fmt(STR.importFail, { why: e.message })); return; }
      var c = rep.counts;
      if (!c.copies && !c.done && !c.favs && !c.custom && !c.settings && !Object.keys(rep.valid).some(function (k) { return KEY.textcfg.test(k); })) {      // nothing a merge or a replace could use (schema alone is not data)
        MX.toast(MX.fmt(STR.importFail, { why: STR.empty })); B.showBad(rep); return;
      }
      B.preview(rep, done);
    },
    describeScope: function (rep) {
      var sc = rep.scope, e = sc && sc.text ? Lib.entry(sc.text) : null, ttl = e ? Lib.ts(e.title, 'trad') : (sc && sc.title) || (sc && sc.text) || '';
      if (rep.kind !== 'partial') return STR.kindFull;
      return MX.fmt(STR.kindPartial, { what: MX.fmt(sc && sc.copy ? STR.kindCopy : STR.kindText, { title: ttl }) });
    },
    preview: function (rep, done) {
      var c = rep.counts, plan = B.plan(rep), lines = [], chk = null, api, nUpd = plan.update.length + plan.union.length, nSame = plan.same.length;
      plan.older.forEach(function (fc) { if (plan.info[fc.id].missing.length) nUpd++; else nSame++; });
      var date = rep.date ? MX.fmtDate(Date.parse(rep.date) || 0) : '—';
      var here = B.workCount(), canReplace = rep.kind === 'full' && !(c.copies === 0 && here > 0);
      lines.push(h('div', { class: 'note b', 'data-role': 'imp-kind', text: B.describeScope(rep) }));
      lines.push(h('div', { class: 'note', 'data-role': 'imp-date', text: MX.fmt(STR.infoDate, { date: date }) }));
      lines.push(h('div', { class: 'note', 'data-role': 'imp-works', text: MX.fmt(STR.infoWorks, { n: c.copies, m: c.finished }) }));
      lines.push(h('div', { class: 'note', 'data-role': 'imp-texts', text: MX.fmt(STR.infoTexts, { n: c.texts, c: c.custom }) }));
      lines.push(h('div', { class: 'note', 'data-role': 'imp-favs', text: MX.fmt(STR.infoFavs, { n: c.favs }) }));
      if (rep.kind === 'full') lines.push(h('div', { class: 'note', 'data-role': 'imp-settings', text: MX.fmt(STR.infoSettings, { v: c.settings ? STR.has : STR.hasNot }) }));
      if (rep.libVersion !== undefined && rep.libVersion !== null) lines.push(h('div', { class: 'note', 'data-role': 'imp-lib', text: MX.fmt(STR.infoLib, { a: rep.libVersion, b: Lib.version() }) }));
      lines.push(h('div', { class: 'note', 'data-role': 'imp-here', text: MX.fmt(STR.infoHere, { n: here }) }));
      if (rep.bad.length) lines.push(h('div', { class: 'note', 'data-role': 'imp-bad', text: MX.fmt(STR.infoBad, { n: rep.bad.length }) }));
      lines.push(h('h2', { text: STR.planTitle }));
      var pl = h('div', { 'data-role': 'imp-plan' });
      [['add', STR.planAdd], ['update', STR.planUpdate], ['both', STR.planBoth], ['same', STR.planKeep]].forEach(function (p) {
        var n = p[0] === 'same' ? nSame : (p[0] === 'update' ? nUpd : plan[p[0]].length);
        if (n) pl.appendChild(h('div', { class: 'note', 'data-plan': p[0], text: MX.fmt(p[1], { n: n }) }));
      });
      if (!pl.children.length) pl.appendChild(h('div', { class: 'note', text: MX.fmt(STR.planKeep, { n: 0 }) }));
      lines.push(pl);
      lines.push(h('div', { class: 'note', text: STR.mergeNote }));
      if (rep.kind === 'full' && c.settings) {
        chk = h('input', { type: 'checkbox', 'data-role': 'imp-with-settings', id: 'imp-set' });
        lines.push(h('label', { class: 'chk', for: 'imp-set' }, [chk, ' ' + STR.withSettings]));
      }
      if (rep.kind === 'partial') lines.push(h('div', { class: 'note', text: STR.replaceOnlyFull }));
      else if (!canReplace) lines.push(h('div', { class: 'note', 'data-role': 'imp-no-replace', text: STR.noReplaceEmpty }));
      var buttons = [
        { label: STR.cancel, act: 'cancel' },
        { label: STR.merge, act: 'merge', primary: true, onClick: async function () { B.showResult(await B.run(function () { return B.merge(rep, { settings: !!(chk && chk.checked) }); }, 'merge'), done); } }
      ];
      if (canReplace) buttons.splice(1, 0, { label: STR.replace, act: 'replace', keep: true, onClick: async function () {
        var ok = await MX.confirm(MX.fmt(STR.replaceBody, { n: here }), STR.replaceOk, STR.replaceTitle);
        if (!ok) return;
        api.close();
        B.showResult(await B.run(function () { return B.replace(rep); }, 'replace'), done);
      } });
      api = MX.modal({ title: STR.pickTitle, body: lines, buttons: buttons });
      api.el.setAttribute('data-role', 'import-preview');
      api.el.className += ' sheet';
    },
    // runs a merge / replace and always returns a report: {failed: why} when it threw (the writes were undone as far as possible), {writeErrors: n} when the store refused some writes
    run: async function (fn, mode) {
      var before = Store.writeErrors(), r;
      try { r = fn(); await Store.idle(); } catch (e) {
        MX.err(e);
        r = { mode: mode, failed: e && e.message || String(e), restored: !!(e && e.restored), bad: [] };
        try { await Store.idle(); } catch (e2) { /* ignore */ }
      }
      if (Store.writeErrors() > before) r.writeErrors = Store.writeErrors() - before;
      B.lastReport = r;
      return r;
    },
    resultLines: function (r) {
      var out = [];
      if (r.failed) out.push(MX.fmt(r.mode === 'replace' ? STR.resFailedReplace : STR.resFailed, { why: r.failed }));
      if (r.writeErrors) out.push(MX.fmt(STR.resWriteErr, { n: r.writeErrors }));
      if (r.failed) return out;
      if (r.mode === 'replace') out.push(MX.fmt(STR.resultReplace, { n: r.n }));
      else {
        if (r.added) out.push(MX.fmt(STR.resAdded, { n: r.added }));
        if (r.updated) out.push(MX.fmt(STR.resUpdated, { n: r.updated }));
        if (r.both) out.push(MX.fmt(STR.resBoth, { n: r.both }));
        if (r.archived) out.push(MX.fmt(STR.resArchived, { n: r.archived }));
        if (r.same) out.push(MX.fmt(STR.resSame, { n: r.same }));
        if (r.done || r.favs || r.custom) out.push(MX.fmt(STR.resOther, { d: r.done, f: r.favs, c: r.custom }));
        if (r.settings) out.push(STR.resSettings);
      }
      if (r.bad && r.bad.length) out.push(MX.fmt(STR.resSkipped, { n: r.bad.length }));
      return out;
    },
    showResult: function (r, done) {
      var body = B.resultLines(r).map(function (t) { return h('div', { class: 'note', 'data-role': 'imp-result-line', text: t }); });
      if (r.bad && r.bad.length) body.push(B.badList(r.bad));
      var m = MX.modal({ title: r.failed ? STR.failTitle : (r.mode === 'replace' ? STR.resultTitle : STR.resultMerge), body: body, buttons: [
        { label: STR.viewWorks, act: 'to-works', onClick: function () { location.hash = '#/works'; } },
        { label: STR.done, act: 'ok', primary: true }
      ], onClose: function () { if (done) done(r); } });
      m.el.setAttribute('data-role', 'import-result');
    },
    badList: function (bad) {
      var box = h('div', { class: 'badlist', 'data-role': 'imp-bad-list' });
      box.appendChild(h('div', { class: 'note b', text: STR.badTitle }));
      bad.slice(0, 8).forEach(function (b) { box.appendChild(h('div', { class: 'note mono', text: b.key.slice(0, 60) + ' — ' + b.why })); });
      if (bad.length > 8) box.appendChild(h('div', { class: 'note', text: '…' + bad.length }));
      return box;
    },
    showBad: function (rep) {
      if (!rep.bad.length) return;
      MX.modal({ title: STR.badTitle, body: [B.badList(rep.bad)], buttons: [{ label: STR.done, act: 'ok', primary: true }] });
    },

    // The 資料 group of 設定: storage you can see, the last backup, backup / import, and the way to 我的作品. Returns the nodes.
    panel: function () {
      var nodes = [], box = h('div', { class: 'datapanel', 'data-role': 'data-panel' });
      var lines = {
        usage: h('div', { class: 'note', 'data-role': 'storage-usage', text: '…' }), persist: h('div', { class: 'note', 'data-role': 'storage-persist' }),
        works: h('div', { class: 'note', 'data-role': 'storage-works' }), last: h('div', { class: 'note', 'data-role': 'last-backup' })
      };
      var persistBtn = h('button', { text: STR.persistAsk, 'data-act': 'persist', hidden: true, onclick: async function () {
        persistBtn.disabled = true;
        var ok = await B.requestPersist();
        MX.toast(ok ? STR.persistGot : STR.persistDenied, ok ? 2600 : 5000);
        paint();
      } });
      box.appendChild(h('h3', { class: 'subh', text: STR.storageTitle }));
      [lines.usage, lines.persist, lines.works, lines.last].forEach(function (n) { box.appendChild(n); });
      box.appendChild(h('div', { class: 'btnrow' }, [persistBtn]));
      box.appendChild(h('div', { class: 'note', 'data-role': 'storage-separate', text: STR.separate }));
      async function paint() {
        var ws = Model.works(), fin = ws.filter(function (c) { return c.completedAt; }).length;
        lines.works.textContent = MX.fmt(STR.worksCount, { n: ws.length, m: fin });
        lines.last.textContent = B.lastLine();
        var si = await B.storageInfo();
        lines.usage.textContent = si.usage === null ? MX.fmt(STR.storageMine, { mine: MX.fmtBytes(si.mine) })
          : MX.fmt(STR.storageUsed, { used: MX.fmtBytes(si.usage), quota: si.quota === null ? '—' : MX.fmtBytes(si.quota), mine: MX.fmtBytes(si.mine) });
        lines.usage.setAttribute('data-mine', String(si.mine));
        lines.persist.textContent = si.persisted === null ? STR.persistNone : (si.persisted ? STR.persistYes : STR.persistNo);
        lines.persist.setAttribute('data-persisted', si.persisted === null ? 'na' : (si.persisted ? '1' : '0'));
        persistBtn.hidden = !(si.canPersist && si.persisted === false);
        persistBtn.disabled = false;
      }
      paint();
      var file = h('input', { type: 'file', style: 'display:none', 'data-role': 'import-file', onchange: function () {
        var f = file.files && file.files[0];
        if (!f) return;
        B.openFile(f, function () { paint(); });
        file.value = '';
      } });
      box.appendChild(h('div', { class: 'btnrow' }, [
        h('button', { class: 'on', text: STR.exportFull, 'data-act': 'export-json', onclick: function () { B.save(null).then(function () { paint(); }).catch(function (e) { MX.err(e); MX.toast(STR.saveFail); }); } }),
        h('button', { text: STR.importBtn, 'data-act': 'import-json', onclick: function () { file.click(); } }),
        h('button', { text: STR.worksBtn, 'data-act': 'works', onclick: function () { location.hash = '#/works'; } }),
        file
      ]));
      box.appendChild(h('div', { class: 'note', 'data-role': 'data-note', text: STR.privacy }));
      nodes.push(box);
      return nodes;
    }
  };
})();
