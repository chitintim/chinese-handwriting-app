/* 墨 service worker: cache-first for the app shell and library. Version injected by scripts/build.py. */
var CACHE = 'moxie-d31386565d';
var FILES = [
 "./",
 "css/app.css",
 "icon.svg",
 "index.html",
 "js/closing.js",
 "js/draw.js",
 "js/export.js",
 "js/form.js",
 "js/layout.js",
 "js/library.js",
 "js/main.js",
 "js/model.js",
 "js/pentest.js",
 "js/practice.js",
 "js/screens.js",
 "js/store.js",
 "js/util.js",
 "library/fonts/MoKaiSC.woff2",
 "library/fonts/MoKaiTC.woff2",
 "library/fonts/OFL.txt",
 "library/fonts/README.txt",
 "library/index.json",
 "library/texts/heart-sutra.json",
 "manifest.webmanifest"
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () { return null; }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k.indexOf('moxie-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
