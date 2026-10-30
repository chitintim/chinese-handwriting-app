/* 墨 service worker (hosted web app only; never registered inside the APK).
   Versioned cache, installed atomically from the network (cache:'reload'), cache-first afterwards.
   skipWaiting + clients.claim: a new version takes over at once; the page shows an "update available" card.
   Not cached: the download page (download/), the APK link (cross-origin), apk-www/ and android/ (not part of the app). */
var CACHE = 'moxie-5fe88f9bee';
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
 "library/fonts/ARPHICPL.txt",
 "library/fonts/MoKaiSC.woff2",
 "library/fonts/MoKaiTC.woff2",
 "library/fonts/MoMaShan.woff2",
 "library/fonts/MoTWKai.woff2",
 "library/fonts/MoUKaiSC.woff2",
 "library/fonts/MoUKaiTC.woff2",
 "library/fonts/OFL-MaShanZheng.txt",
 "library/fonts/OFL-TWKai.txt",
 "library/fonts/OFL.txt",
 "library/fonts/README.txt",
 "library/fonts/fonts.json",
 "library/index.json",
 "library/texts/heart-sutra.json",
 "manifest.webmanifest"
];
var SCOPE = self.registration.scope;
var SKIP = ['download/', 'apk-www/', 'android/', '.github/'].map(function (p) { return new URL(p, SCOPE).pathname; });

function skipped(url) {
  if (url.origin !== self.location.origin) return true;
  for (var i = 0; i < SKIP.length; i++) if (url.pathname.indexOf(SKIP[i]) === 0) return true;
  if (/\.apk$/i.test(url.pathname)) return true;
  return false;
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(FILES.map(function (f) {
        // bypass the HTTP cache so a fresh deploy never caches stale files; one failing file does not block the install
        return c.add(new Request(f, { cache: 'reload' })).catch(function () { return null; });
      }));
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
  if (skipped(url)) return;           // network as usual
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
          return res;
        });
      });
    })
  );
});
