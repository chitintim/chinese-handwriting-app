(function () {
  'use strict';
  // The first-visit intro: a full dialog with the whole 關於 text (the content comes from MX.Notes.aboutBlocks(), the very source of the 關於 page, so the two never diverge).
  // Shown once, over the home screen only (never over the practice view, the pen test or an export). Persisted as Store key `introSeen:v1` (device-local, not part of a backup).
  // Closes with 開始抄寫 / the ✕ / Esc / the Android Back button; 關於 -> 重看介紹 opens it again. docs/SPEC.md "First-visit intro".
  // Layout: phone = full-screen sheet (safe-area insets), otherwise centred, max 680 px. LCD: the text scrolls. 電子紙 tablet: paged with 上一頁 / 下一頁, no animation,
  // solid white, black border, and one full redraw (the screen is rebuilt) when it closes.
  // Test hooks: window.__MX_NO_INTRO = true (set by the test suites) stops the automatic opening; MX.Intro.open() always works.
  var MX = window.MX, h = MX.h, Model = MX.Model, Store = MX.Store;
  // "Seen THIS intro", not "new install": an existing user with copies, settings and ink but no flag sees it once on their next visit to the home screen (also in the APK after an update);
  // nothing here looks at how much data there is. Changing the text of the intro for good? Bump the key (introSeen:v2, and the LOCAL_ONLY pattern in store.js): everybody sees it once more.
  var KEY = 'introSeen:v1';
  var GAP = 40;                     // px between two columns (pages), as the 解說 page
  var NO_ROUTE = { practice: 1, view: 1, pentest: 1 };
  var cur = null;                   // the open dialog: {root, dlg, paged, page, pages, auto, opener, ...}
  var I = MX.Intro = { KEY: KEY, redraws: 0 };

  I.seen = function () { try { return !!Store.get(KEY); } catch (e) { return false; } };
  I.markSeen = function () { try { Store.set(KEY, Date.now()); } catch (e) { MX.err(e); } };
  I.reset = function () { try { Store.del(KEY); } catch (e) { MX.err(e); } };
  I.isOpen = function () { return !!cur; };
  I.state = function () { return cur ? { open: true, mode: cur.paged ? 'paged' : 'scroll', page: cur.page, pages: cur.pages, auto: cur.auto } : { open: false }; };
  function pagedMode() { return !MX.Device.isPhone() && !MX.Device.isWide() && Model.settings.screenType === 'eink'; }       // a laptop window scrolls, whatever 螢幕類型 says

  function focusables() {
    return Array.prototype.filter.call(cur.dlg.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'), function (e) {
      return !e.disabled && e.getClientRects().length > 0;
    });
  }

  function build() {
    var C = cur, paged = C.paged;
    var close = h('button', { type: 'button', class: 'iclose', 'data-act': 'intro-close', 'aria-label': '關閉', title: '關閉', onclick: function () { I.close('x'); } }, [MX.icon('x', 26)]);
    var head = h('div', { class: 'ihead' }, [h('h1', { id: 'intro-title', 'data-role': 'intro-title', text: '墨字帖 · 抄經、臨帖的描紅練習' }), close]);
    var blocks = MX.Notes.aboutBlocks().filter(function (b) { return b.getAttribute('data-part') !== 'credits'; });       // version + licences stay on the 關於 page
    var body;
    if (paged) {
      var view = h('div', { class: 'nview ibodyview', 'data-role': 'intro-view' });
      body = h('div', { class: 'ncols ibody', 'data-role': 'intro-body' });
      view.appendChild(body);
      blocks.forEach(function (b) { body.appendChild(b); });
      C.view = view; C.cols = body;
    } else {
      body = h('div', { class: 'ibody iscroll', 'data-role': 'intro-body', tabindex: '0' });
      blocks.forEach(function (b) { body.appendChild(b); });
      C.cols = body;
    }
    var foot = h('div', { class: 'ifoot' });
    if (paged) {
      C.prev = h('button', { type: 'button', 'data-act': 'intro-prev', onclick: function () { go(C.page - 1); } }, [MX.icon('tri-u', 18), '上一頁']);
      C.next = h('button', { type: 'button', 'data-act': 'intro-next', onclick: function () { go(C.page + 1); } }, ['下一頁', MX.icon('tri-d', 18)]);
      C.ctr = h('div', { class: 'ctr', 'data-role': 'intro-ctr', text: '1 / 1' });
      foot.appendChild(h('div', { class: 'pager npager', 'data-role': 'intro-pager' }, [C.prev, C.ctr, C.next]));
    }
    foot.appendChild(h('button', { type: 'button', class: 'on big istart', 'data-act': 'intro-start', onclick: function () { I.close('start'); } }, '開始抄寫 · Start'));
    var dlg = h('div', { class: 'idlg', id: 'intro-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'intro-title', tabindex: '-1', 'data-mode': paged ? 'paged' : 'scroll' }, [head, paged ? C.view : body, foot]);
    var root = h('div', { class: 'intro-bg', id: 'intro', 'data-role': 'intro', 'data-eink': Model.settings.screenType === 'eink' ? '1' : '0', 'data-mode': paged ? 'paged' : 'scroll' }, [dlg]);
    C.root = root; C.dlg = dlg;
    return root;
  }

  function go(p) {
    var C = cur;
    if (!C || !C.paged) return;
    C.page = MX.clamp(p, 0, C.pages - 1);
    C.cols.scrollLeft = C.page * (C.cols.clientWidth + GAP);
    C.ctr.textContent = (C.page + 1) + ' / ' + C.pages;
    C.prev.disabled = C.page <= 0;
    C.next.disabled = C.page >= C.pages - 1;
    C.dlg.setAttribute('data-page', String(C.page));
    C.dlg.setAttribute('data-pages', String(C.pages));
  }
  function repage() {
    var C = cur;
    if (!C || !C.paged) return;
    var vw = C.view.clientWidth, vh = C.view.clientHeight;
    if (vw < 50 || vh < 50) return;
    C.cols.style.width = vw + 'px'; C.cols.style.height = vh + 'px';
    C.cols.style.columnWidth = vw + 'px'; C.cols.style.columnGap = GAP + 'px';
    C.pages = Math.max(1, Math.round((C.cols.scrollWidth + GAP) / (vw + GAP)));
    go(C.page);
  }

  function setBackground(on) {
    ['app', 'layer'].forEach(function (id) {
      var e = document.getElementById(id);
      if (!e) return;
      if (on) { e.setAttribute('inert', ''); e.setAttribute('aria-hidden', 'true'); } else { e.removeAttribute('inert'); e.removeAttribute('aria-hidden'); }
    });
    document.documentElement.classList.toggle('intro-open', !!on);        // scroll lock (CSS)
  }

  function mount(keepPage) {
    var C = cur;
    C.paged = pagedMode();
    document.body.appendChild(build());
    setBackground(true);
    if (C.paged) { C.page = keepPage || 0; repage(); setTimeout(function () { repage(); }, 60); }
    try { C.dlg.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function unmount(C) {
    if (C && C.root && C.root.parentNode) C.root.parentNode.removeChild(C.root);
  }

  // open the dialog (the 重看介紹 button, the automatic first-visit call, tests). opts.auto = opened by itself
  I.open = function (opts) {
    if (cur) return false;
    cur = { auto: !!(opts && opts.auto), opener: document.activeElement, page: 0, pages: 1, paged: false };
    mount(0);
    return true;
  };
  // how: 'start' | 'x' | 'esc' | 'back' | 'route'. Always remembers that the intro was seen (except when a route change took it away).
  I.close = function (how) {
    var C = cur;
    if (!C) return false;
    cur = null;
    unmount(C);
    setBackground(false);
    if (how !== 'route') I.markSeen();
    document.documentElement.setAttribute('data-intro-closed', how || '');
    if (how !== 'route' && C.paged && MX.route) {
      // 電子紙: one full redraw of the screen underneath (ghosting), the screen is rebuilt from scratch; the scroll position stays
      var sc = document.querySelector('#app > .screen'), top = sc ? sc.scrollTop : 0;
      I.redraws++;
      document.documentElement.setAttribute('data-intro-redraws', String(I.redraws));
      MX.route();
      sc = document.querySelector('#app > .screen');
      if (sc && top) sc.scrollTop = top;
    } else if (C.opener && C.opener.isConnected && how !== 'route') {
      try { C.opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    return true;
  };

  // The automatic first-visit call, from the router once a screen is drawn. Nothing but the home screen, nothing over another overlay or a pen that is writing.
  I.maybeAuto = function () {
    if (cur || window.__MX_NO_INTRO || I.seen()) return false;
    if (!MX.isHome || !MX.isHome()) return false;
    if (MX.Practice && MX.Practice.busy()) return false;
    var layer = document.getElementById('layer');
    if (layer && Array.prototype.some.call(layer.children, function (c) { return !c.classList.contains('toast'); })) return false;
    return I.open({ auto: true });
  };
  I.onRoute = function (name) {
    if (cur) { if (NO_ROUTE[name]) I.close('route'); return; }
    if (name === 'home') I.maybeAuto();
  };

  // keys: Esc closes, Tab stays inside, the page keys page (電子紙). Registered first and in the capture phase: nothing behind the dialog sees them.
  window.addEventListener('keydown', function (e) {
    if (!cur) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopImmediatePropagation(); I.close('esc'); return; }
    if (e.key === 'Tab') {
      // the focus order is made here (browsers differ on which controls Tab reaches): next / previous control of the dialog, wrapping around
      var f = focusables(), a = document.activeElement, at = f.indexOf(a), n;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!f.length) { cur.dlg.focus(); return; }
      if (at < 0) n = e.shiftKey ? f.length - 1 : 0; else n = (at + (e.shiftKey ? -1 : 1) + f.length) % f.length;
      f[n].focus();
      return;
    }
    if (cur.paged) {
      if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'AudioVolumeDown' || e.keyCode === 25) { e.preventDefault(); go(cur.page + 1); }
      else if (e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'AudioVolumeUp' || e.keyCode === 24) { e.preventDefault(); go(cur.page - 1); }
      else return;
      e.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('mo-key', function (e) {
    if (!cur) return;
    e.stopImmediatePropagation();
    if (cur.paged) { if (e.detail === 'next') go(cur.page + 1); else if (e.detail === 'prev') go(cur.page - 1); }
  });
  // focus never leaves the dialog (a click outside it, a script)
  document.addEventListener('focusin', function (e) {
    if (cur && cur.dlg && !cur.dlg.contains(e.target)) { try { cur.dlg.focus({ preventScroll: true }); } catch (x) { /* ignore */ } }
  });
  var timer = null;
  window.addEventListener('resize', function () { if (cur && cur.paged) { clearTimeout(timer); timer = setTimeout(repage, 120); } });
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { if (cur && cur.paged) repage(); });
  // the layout flipped (phone <-> tablet, a 螢幕類型 change): build the dialog again in the new mode, same place
  MX.Device.onChange(function () {
    if (!cur) return;
    var page = cur.page;
    unmount(cur);
    mount(page);
  });
})();
