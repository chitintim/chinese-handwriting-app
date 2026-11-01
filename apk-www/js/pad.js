(function () {
  'use strict';
  // 觸控板書寫 (docs/SPEC.md "Trackpad writing"): a laptop trackpad has no pressure, writing by click-and-drag is awkward, and the macOS gestures (two-finger scroll, pinch, two-finger click)
  // get in the way. Only on a desktop device (MX.Device.trackpad(): no touch screen, fine pointer); settings.padMode:
  //   'off'   (default) nothing changes: the mouse writes by click-and-drag as before
  //   'drag'  按住拖曳 : click-and-drag, plus the gesture rules below and Force Touch pressure in Safari
  //   'space' 按住空白鍵 (or Option) : the pen is down while the key is held and the pointer slides; no click, so the mouse buttons never ink
  // Both: wheel / pinch (ctrl+wheel) on the practice view is cancelled, two-finger click (contextmenu) = 復原. 精細模式 (settings.padFine, gain settings.padGain) locks the pointer on the
  // writing area and moves a virtual cursor by the movement times the gain, so the ink is finer than the finger; the cursor is drawn as a ring (a dot while the pen is down).
  // The ink itself is made by the practice view: this object only decides WHEN the pen is down and WHERE (it hands event-like objects, `pad: true`, to the view's own pointer handlers).
  var MX = window.MX, h = MX.h;
  var DEFAULT_GAIN = 0.5;

  function inField(t) { return !!(t && t.closest && t.closest('input,textarea,select,[contenteditable]')); }
  function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  var Pad = MX.Pad = {
    // 'off' | 'drag' | 'space' for a settings object (always 'off' where the device is not a laptop / desktop)
    mode: function (st) {
      var m = st && st.padMode;
      return MX.Device.trackpad() && (m === 'drag' || m === 'space') ? m : 'off';
    },
    // 精細模式 wanted (and the browser can lock the pointer)
    fine: function (st) { return !!(st && st.padFine) && MX.Device.pointerLock(); },
    gain: function (st) { var g = parseFloat(st && st.padGain); return g >= 0.1 && g <= 1 ? g : DEFAULT_GAIN; },
    // Force Touch (Safari on a MacBook): webkitForce is about 1 for an ordinary click and rises towards 2 (the "force click") as the finger presses harder. Mapped to the normalised pressure
    // 0.1..1 so that an ordinary drag (~1.15) is a normal stroke (0.5). Needs a real MacBook to tune.
    pressure: function (f) { return clamp(0.5 + (f - 1.15) * 0.9, 0.1, 1); },
    // host: { root, stage, ink, st() -> settings, on(target, type, fn, opt) (the view's listener registry), down(e) / move(e) / up(e) (the view's pointer handlers), cancel(),
    //         active(), samples(), hit(clientX, clientY) -> cell index or -1, writable(), undo() }
    create: function (host) { return new PadState(host); }
  };

  function PadState(host) {
    var self = this;
    this.host = host;
    this.m = 'off'; this.f = false;     // the settings as of the last sync() (read for every pointer event, so not looked up each time)
    this.last = null;           // the last real pointer position {x, y} (client px)
    this.pid = 1;               // pointerId of the mouse
    this.held = {};             // pen keys that are down
    this.armed = false;         // a pen key is down but the pointer was not on a cell yet: the pen goes down as soon as it is
    this.pen = false;           // a stroke made by this object is in progress
    this.locked = false;        // the pointer is locked on the ink canvas (精細模式)
    this.asking = false;        // a lock request is out
    this.afterLock = false;     // a pen key was pressed to enter 精細模式: the pen goes down when the lock arrives
    this.lockBad = false;       // the lock failed once: 精細模式 stays off for this view
    this.useEv = false;         // this browser reports a failed lock by `pointerlockerror` only (no promise)
    this.cur = { x: 0, y: 0 };  // the virtual cursor (client px) while locked
    this.rect = null;
    this.force = -1;            // Force Touch reading of the click in progress
    this.dot = h('div', { class: 'paddot', 'data-role': 'pad-dot', 'aria-hidden': 'true' });
    this.label = h('div', { class: 'padlabel', 'data-role': 'pad-label', 'aria-hidden': 'true' });
    host.stage.insertBefore(this.dot, host.stage.firstChild);          // before the canvases: the ink canvas stays the last child of the stage (z-index puts these above)
    host.stage.insertBefore(this.label, host.stage.firstChild);
    var on = host.on, ink = host.ink;
    // where the pointer is, and (with a pen key down) the stroke that follows it
    on(window, 'pointermove', function (e) { self.track(e); }, true);
    // gestures: no page scroll / swipe-back / pinch zoom from the trackpad on the practice view; two-finger click = 復原
    on(host.root, 'wheel', function (e) { if (self.mode() !== 'off' && (e.ctrlKey || host.stage.contains(e.target))) e.preventDefault(); }, { passive: false });
    on(ink, 'contextmenu', function () { if (self.mode() !== 'off' && host.writable()) host.undo(); });
    // Force Touch: the click's force; the force-click look-up / preview must not pop up over the writing
    on(ink, 'webkitmouseforcewillbegin', function (e) { if (self.mode() !== 'off') e.preventDefault(); });
    ['webkitmouseforcechanged', 'mousedown', 'mousemove'].forEach(function (t) {
      on(ink, t, function (e) { if (typeof e.webkitForce === 'number' && e.buttons & 1 && e.webkitForce > 0) self.force = e.webkitForce; });
    });
    on(window, 'mouseup', function () { self.force = -1; });
    on(document, 'pointerlockchange', function () { self.lockChanged(); });
    on(document, 'pointerlockerror', function () { if (self.useEv) self.lockFailed(); });
    // the window lost the focus (⌘Tab): a key-up will never come
    on(window, 'blur', function () { self.lift(); });
    this.read();
  }
  var P = PadState.prototype;

  P.read = function () { var st = this.host.st(); this.m = Pad.mode(st); this.f = this.m !== 'off' && Pad.fine(st); };
  P.mode = function () { return this.m; };
  P.fine = function () { return this.f && !this.lockBad; };
  // the normalised pressure the trackpad reports now (Sampler.force), -1 = no reading (the speed model decides)
  P.forceN = function () { return this.force > 0 ? Pad.pressure(this.force) : -1; };
  P.pos = function () { return this.locked ? this.cur : this.last; };
  P.ev = function (type, p, ts) {
    return { type: type, pad: true, pointerId: this.pid, pointerType: 'mouse', clientX: p.x, clientY: p.y, buttons: type === 'pointerup' ? 0 : 1, button: 0, width: 1, height: 1,
      pressure: 0.5, timeStamp: ts === undefined ? now() : ts, ctrlKey: false, preventDefault: function () {} };
  };

  // ---- the pen
  P.penDown = function (ts) {
    var p = this.pos(), host = this.host;
    if (!p || this.pen || host.active() || !host.writable() || host.hit(p.x, p.y) < 0) return false;
    host.down(this.ev('pointerdown', p, ts));
    this.pen = host.active();
    this.paint();
    return this.pen;
  };
  // pen up. A pen key tapped without sliding is no stroke (a stray Space must not leave a dot).
  P.penUp = function (ts) {
    var p = this.pos(), host = this.host;
    if (!this.pen) return;
    this.pen = false;
    if (host.active()) {
      if (this.mode() === 'space' && host.samples() < 2) host.cancel(); else host.up(this.ev('pointerup', p, ts));
    }
    this.paint();
  };
  // every pen key up / the window lost the focus / the mode changed
  P.lift = function () {
    this.held = {}; this.armed = false; this.afterLock = false;
    this.penUp();
  };
  // the leave-the-view part: lift the pen and give the pointer back
  P.release = function () { this.lift(); this.unlock(); };
  P.destroy = function () {
    this.release();
    if (this.dot.parentNode) this.dot.parentNode.removeChild(this.dot);
    if (this.label.parentNode) this.label.parentNode.removeChild(this.label);
    document.documentElement.classList.remove('padmode');
    this.host.root.classList.remove('pad');
  };

  // ---- real pointer position
  P.track = function (e) {
    if (e.pointerType !== 'mouse' || this.locked || !this.host.root.parentNode) return;
    this.last = { x: e.clientX, y: e.clientY };
    this.pid = e.pointerId;
    if (this.mode() !== 'space') return;
    if (this.armed && !this.host.active()) this.penDown(e.timeStamp);
    else if (this.pen && e.target !== this.host.ink && this.host.active()) this.host.move(e);       // the pointer left the canvas with the key still down: the stroke follows
  };

  // ---- the ink canvas' pointer events, first. true = taken (the view's own handler must not see it)
  P.takes = function (e) {
    if (e.pad || e.pointerType !== 'mouse') return false;
    var m = this.mode(), t = e.type;
    if (m === 'off') return false;
    if (this.locked) {
      this.pid = e.pointerId;
      if (t === 'pointermove') this.moveBy(e);
      else if (t === 'pointerdown') { if (m === 'drag' && e.button === 0 && !e.ctrlKey) this.penDown(e.timeStamp); }
      else if (t === 'pointerup' || t === 'pointercancel') { if (m === 'drag') this.penUp(e.timeStamp); }
      return true;
    }
    if (t === 'pointerdown' && e.button === 0 && !e.ctrlKey && this.fine()) { this.last = { x: e.clientX, y: e.clientY }; this.lock(); return true; }
    if (m === 'space') return t === 'pointerdown' || t === 'pointerup' || t === 'pointercancel' || t === 'lostpointercapture';
    return t === 'pointerdown' && e.ctrlKey;       // Control-click is a right click on a Mac
  };

  // ---- the pen keys (Space, Option): keydown / keyup of the practice view. true = taken (default prevented: no page scroll, no focused button pressed)
  P.key = function (e, down) {
    if (this.mode() !== 'space' || inField(e.target)) return false;
    var code = e.code === 'Space' || e.key === ' ' ? 'Space' : (e.key === 'Alt' ? 'Alt' : '');
    if (!code || (code === 'Space' && (e.metaKey || e.ctrlKey))) return false;
    e.preventDefault();
    if (!down) {
      delete this.held[code];
      if (!Object.keys(this.held).length) { this.armed = false; this.afterLock = false; this.penUp(e.timeStamp); }
      return true;
    }
    if (e.repeat) return true;
    var a = document.activeElement;
    if (a && a !== document.body && a.blur && /^(BUTTON|A)$/.test(a.tagName)) a.blur();       // a focused button would be "clicked" by the key-up
    this.held[code] = true;
    if (this.fine() && !this.locked) {
      var r = this.host.ink.getBoundingClientRect(), p = this.last;
      if (p && p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom) { this.afterLock = true; this.lock(); }
      return true;
    }
    if (!this.penDown(e.timeStamp)) this.armed = true;
    return true;
  };

  // ---- 精細模式: pointer lock + a virtual cursor
  P.lock = function () {
    var self = this, el = this.host.ink;
    if (this.locked || this.asking || !this.fine()) return;
    this.asking = true;
    function plain() {
      var r2 = el.requestPointerLock();
      if (r2 && typeof r2.then === 'function') r2.then(null, function () { self.lockFailed(); }); else self.useEv = true;
    }
    try {
      // unadjustedMovement = the trackpad's raw movement (no pointer acceleration), so the gain is the same at every speed; where the platform cannot, an ordinary lock
      var r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof r.then === 'function') r.then(null, function () { try { plain(); } catch (x) { self.lockFailed(); } });
      else this.useEv = true;
    } catch (x) {
      try { plain(); } catch (y) { this.lockFailed(); }
    }
  };
  P.lockFailed = function () {
    this.asking = false; this.afterLock = false; this.lockBad = true;
    this.paint();
    MX.toast('無法進入精細模式，改用一般書寫。', 3000);
  };
  P.unlock = function () {
    if (document.pointerLockElement === this.host.ink) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
  };
  P.lockChanged = function () {
    var on = document.pointerLockElement === this.host.ink;
    this.asking = false;
    if (on === this.locked) return;
    this.locked = on;
    if (on) {
      var r = this.rect = this.host.ink.getBoundingClientRect(), p = this.last || { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
      this.cur = { x: clamp(p.x, r.left, r.right - 1), y: clamp(p.y, r.top, r.bottom - 1) };
      if (this.afterLock && Object.keys(this.held).length) this.penDown();
      this.afterLock = false;
    } else {
      this.penUp();
      this.afterLock = false;
    }
    this.paint();
  };
  // a locked pointermove: the cursor moves by the movement times the gain, confined to the canvas
  P.moveBy = function (e) {
    if (document.querySelector('.modal-bg')) { this.release(); return; }       // a dialog opened: the pointer is needed for it
    var r = this.rect, g = Pad.gain(this.host.st());
    this.cur.x = clamp(this.cur.x + (e.movementX || 0) * g, r.left, r.right - 1);
    this.cur.y = clamp(this.cur.y + (e.movementY || 0) * g, r.top, r.bottom - 1);
    if (this.pen && this.host.active()) this.host.move(this.ev('pointermove', this.cur, e.timeStamp));
    this.paint();
  };

  // ---- state on the screen: classes, the cursor ring / dot, the small label
  P.paint = function () {
    var on = this.mode() !== 'off', fine = this.fine(), r = this.rect;
    document.documentElement.classList.toggle('padmode', on);
    this.host.root.classList.toggle('pad', on);
    this.dot.classList.toggle('on', this.locked);
    this.dot.classList.toggle('down', this.pen);
    if (this.locked && r) this.dot.style.transform = 'translate(' + (this.cur.x - r.left) + 'px,' + (this.cur.y - r.top) + 'px)';
    this.label.classList.toggle('on', fine);
    this.label.textContent = this.locked ? '精細模式 · 按 Esc 離開' : '精細模式：點一下書寫區進入';
  };
  // after a settings change / a new layout
  P.sync = function () {
    this.read();
    this.rect = this.host.ink.getBoundingClientRect();
    if (this.mode() !== 'space') { this.held = {}; this.armed = false; }
    if (this.mode() === 'off') this.lift();
    if (!this.fine()) this.unlock();
    this.paint();
  };
  P.info = function () {
    return { mode: this.mode(), fine: this.fine(), locked: this.locked, pen: this.pen, held: Object.keys(this.held), armed: this.armed, bad: this.lockBad, cur: [this.cur.x, this.cur.y],
      gain: Pad.gain(this.host.st()), force: this.forceN(), label: this.label.textContent, labelOn: this.label.classList.contains('on'), dotOn: this.dot.classList.contains('on'),
      dotDown: this.dot.classList.contains('down') };
  };
})();
