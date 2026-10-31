(function () {
  'use strict';
  // Finger double-tap on a practice cell (opens the stroke-order popup; docs/SPEC.md "Stroke order"). The finger never inks in the default pen-only mode, so a finger on the page is
  // free to mean something, but a palm resting next to the pen must NEVER trigger it. The recognizer therefore accepts only a very clean sequence, judged by the events' own
  // timeStamp (so it does not depend on when the page happens to run):
  //   * two touch pointerdown/pointerup pairs, each tap down for <= TAP_MS and moving <= MOVE_PX css px,
  //   * the second finger-down <= GAP_MS after the first finger-up, both taps inside the same cell,
  //   * contact size (max of width / height) <= PALM px at every event,
  //   * no pen event of any kind (down, move = hover, up, over, ...) within PEN_QUIET ms before a tap or while the sequence is going on: pen activity discards the sequence,
  //   * never more than one touch pointer down: a second finger (palm, two-finger gesture) discards the sequence and the rest of that touch until all fingers are up.
  var MX = window.MX;
  var TAP_MS = 250, MOVE_PX = 10, GAP_MS = 350, PEN_QUIET = 600, PALM = 45, STALE_MS = 2500;

  // o: {hit(x, y) -> cell index or -1 (client coordinates), enabled() -> bool, onDouble(index, event)}
  function DoubleTap(o) {
    this.o = o;
    this.lastPen = -1e9;
    this.touches = {};
    this.n = 0;
    this.tainted = false;
    this.reset();
  }
  DoubleTap.prototype.reset = function () { this.cur = null; this.first = null; };
  function size(e) { return Math.max(e.width || 0, e.height || 0); }
  DoubleTap.prototype.purge = function (t) {
    var self = this;
    Object.keys(this.touches).forEach(function (k) { if (t - self.touches[k] > STALE_MS || t < self.touches[k]) { delete self.touches[k]; self.n--; } });   // a lost pointerup must not block it forever
    if (this.n <= 0) { this.n = 0; this.tainted = false; }
  };
  // any pen pointer event, wherever on the page: the pen is around, so a touch is probably a hand
  DoubleTap.prototype.pen = function (e) { this.lastPen = e.timeStamp; this.reset(); };
  DoubleTap.prototype.down = function (e) {
    if (e.pointerType !== 'touch') return;
    var t = e.timeStamp;
    this.purge(t);
    if (!(e.pointerId in this.touches)) this.n++;
    this.touches[e.pointerId] = t;
    if (this.n > 1) { this.tainted = true; this.reset(); return; }
    if (this.tainted) { this.cur = null; return; }
    if (!this.o.enabled()) { this.reset(); return; }
    if (this.first && t - this.first.t1 > GAP_MS) this.first = null;
    var idx = this.o.hit(e.clientX, e.clientY), ok = idx >= 0 && size(e) <= PALM && t - this.lastPen > PEN_QUIET;
    if (!ok) { this.first = null; this.cur = null; return; }
    this.cur = { id: e.pointerId, t0: t, x: e.clientX, y: e.clientY, idx: idx, ok: true };
  };
  DoubleTap.prototype.move = function (e) {
    if (e.pointerType !== 'touch') return;
    if (e.pointerId in this.touches) this.touches[e.pointerId] = e.timeStamp;
    var c = this.cur;
    if (!c || c.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > MOVE_PX || size(e) > PALM) c.ok = false;
  };
  DoubleTap.prototype.up = function (e) {
    if (e.pointerType !== 'touch') return;
    if (e.pointerId in this.touches) { delete this.touches[e.pointerId]; this.n--; }
    if (this.n <= 0) { this.n = 0; this.tainted = false; }
    var c = this.cur, t = e.timeStamp;
    if (!c || c.id !== e.pointerId) return;
    this.cur = null;
    if (!c.ok || size(e) > PALM || Math.hypot(e.clientX - c.x, e.clientY - c.y) > MOVE_PX || t - c.t0 > TAP_MS || t < c.t0) { this.first = null; return; }
    if (this.first && c.t0 - this.first.t1 <= GAP_MS && this.first.idx === c.idx) {
      this.reset();
      this.o.onDouble(c.idx, e);
      return;
    }
    this.first = { t1: t, idx: c.idx };
  };
  DoubleTap.prototype.cancel = function (e) {
    if (e.pointerType !== 'touch') return;
    if (e.pointerId in this.touches) { delete this.touches[e.pointerId]; this.n--; }
    if (this.n <= 0) { this.n = 0; this.tainted = false; }
    this.reset();
  };

  MX.Gesture = { DoubleTap: DoubleTap, TAP_MS: TAP_MS, MOVE_PX: MOVE_PX, GAP_MS: GAP_MS, PEN_QUIET: PEN_QUIET, PALM: PALM };
})();
