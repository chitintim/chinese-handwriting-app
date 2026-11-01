(function () {
  'use strict';
  // Layout mode: tablet (the original layout) or phone (one character at a time, compact single-column screens). docs/SPEC.md "Phone layout".
  //   setting 版面 (settings.layoutMode): 'auto' (default) | 'tablet' | 'phone'.
  //   auto = phone when min(innerWidth, innerHeight) < 520 CSS px, re-evaluated on resize / orientation change.
  // apply() puts the result on <html> (class `phone`, data-layout) and publishes the viewport size in CSS variables (--app-h / --app-w, from innerHeight / innerWidth:
  // 100vh is the *largest* viewport on iOS Safari and Android Chrome, so a screen sized with it hides its bottom behind the browser bar).
  var MX = window.MX = window.MX || {};
  var LIMIT = 520;
  var last = null, listeners = [], timer = null;

  function pref() {
    var s = MX.Model && MX.Model.settings, m = s && s.layoutMode;
    return m === 'phone' || m === 'tablet' ? m : 'auto';
  }
  // The platform: ios = iPhone / iPad / iPod (an iPad in desktop-site mode reports itself as a Mac with a touch screen), standalone = launched from the Home Screen (no browser UI).
  // D.force (tests) overrides single fields.
  function detect() {
    var ua = navigator.userAgent || '', mt = navigator.maxTouchPoints || 0, st = false;
    try { st = navigator.standalone === true || !!(window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)); } catch (e) { st = false; }
    // desktop = no touch screen and a precise pointer (mouse / trackpad): the mouse writes by default there (a pen-only app would be unusable)
    var fine = false;
    try { fine = !!(window.matchMedia && matchMedia('(any-pointer: fine)').matches); } catch (e) { fine = false; }
    var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && mt > 1);
    return { ios: ios, standalone: st, desktop: !ios && mt === 0 && fine };
  }
  var D = MX.Device = {
    LIMIT: LIMIT,
    pref: pref,
    force: null,
    env: function () {
      var e = detect(), f = D.force;
      if (f) Object.keys(f).forEach(function (k) { e[k] = f[k]; });
      return e;
    },
    // 螢幕類型 default: an e-ink tablet is what the app was made for; iPhones / iPads / phone-sized screens are ordinary LCD / OLED screens
    defaultScreen: function () { return D.env().ios || D.isPhone() ? 'normal' : 'eink'; },
    // iOS Safari (not installed to the Home Screen): the browser may delete site data after about 7 days without a visit; a Home Screen web app is exempt
    needsInstallTip: function () {
      var e = D.env();
      if (!e.ios || e.standalone) return false;
      try { return !(MX.Store && MX.Store.get('sys:iosTip')); } catch (x) { return true; }
    },
    dismissInstallTip: function () { try { MX.Store.set('sys:iosTip', Date.now()); } catch (x) { /* ignore */ } },
    mode: function () {
      var p = pref();
      if (p !== 'auto') return p;
      return Math.min(window.innerWidth, window.innerHeight) < LIMIT ? 'phone' : 'tablet';
    },
    isPhone: function () { return D.mode() === 'phone'; },
    // Low-latency (desynchronized) ink canvas: setting 低延遲筆跡 auto = only on the iReader e-ink tablet (tested there); many other Android GPUs composite the transparent ink layer as solid black.
    lowLatency: function () {
      var v = MX.Model && MX.Model.settings && MX.Model.settings.lowLat;
      if (v === 'on') return true;
      if (v === 'off') return false;
      return /iReader|Smart 6c|SmartOS/i.test(navigator.userAgent || '');
    },
    // 觸控板書寫 (settings padMode, docs/SPEC.md "Trackpad writing") is offered on a laptop / desktop only: no touch screen and a fine pointer, the same test as "the mouse writes" (never the e-ink tablet, phone or iPad).
    // The layout does not matter: a laptop can write in the phone layout (one big character, 版面 手機) too.
    trackpad: function () { return !!D.env().desktop; },
    // Pointer Lock (the 精細模式 of the trackpad writing); the options dictionary / promise form is feature-detected where it is used
    pointerLock: function () { return typeof Element !== 'undefined' && typeof Element.prototype.requestPointerLock === 'function' && 'onpointerlockchange' in document; },
    // the wide (laptop / desktop) layout: a landscape window of at least 1100 px at 3:2 or wider, never the phone layout. Class `wide` on <html>; docs/SPEC.md "Wide layout".
    isWide: function () { return !D.isPhone() && window.innerWidth >= 1100 && window.innerWidth >= 1.5 * window.innerHeight; },
    // class + CSS variables; true when the mode changed since the last call
    apply: function () {
      var ph = D.isPhone(), wd = D.isWide(), de = document.documentElement, key = (ph ? 'p' : 't') + (wd ? 'w' : ''), changed = last !== null && last !== key;
      last = key;
      if (ph) de.classList.add('phone'); else de.classList.remove('phone');
      if (wd) de.classList.add('wide'); else de.classList.remove('wide');
      de.setAttribute('data-layout', ph ? 'phone' : 'tablet');
      de.style.setProperty('--app-h', window.innerHeight + 'px');
      de.style.setProperty('--app-w', window.innerWidth + 'px');
      if (MX.Model && MX.Model.applyEdge) MX.Model.applyEdge();
      return changed;
    },
    // fn(isPhone) is called (debounced) when a resize / rotation / setting change flips the mode
    onChange: function (fn) { listeners.push(fn); },
    // call after the setting changed
    refresh: function () {
      if (D.apply()) listeners.forEach(function (fn) { try { fn(D.isPhone()); } catch (e) { if (MX.err) MX.err(e); } });
    }
  };
  function onResize() {
    // the CSS variables follow every resize at once (the browser bar sliding in / out on a phone); the mode flip is debounced
    document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
    document.documentElement.style.setProperty('--app-w', window.innerWidth + 'px');
    clearTimeout(timer);
    timer = setTimeout(D.refresh, 120);
  }
  // Safari (iOS): no pinch zoom, no text-selection loupe / callout / context menu on the app screens (inputs keep theirs); double-tap zoom is off by CSS (touch-action)
  function inField(t) { return !!(t && t.closest && t.closest('input,textarea,[contenteditable]')); }
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('contextmenu', function (e) { if (!inField(e.target) && !(e.target.closest && e.target.closest('.saveimg'))) e.preventDefault(); });       // the exported picture keeps its long-press menu (Save image)
  document.addEventListener('selectstart', function (e) { if (!inField(e.target)) e.preventDefault(); });
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  D.apply();
})();
