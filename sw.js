/* Service worker: офлайн-доступ после первого открытия.
   Стратегия «сеть впереди, кеш в запасе» — чтобы правки сайта
   доезжали до читателя сразу, а без связи страница всё равно открылась. */

var CACHE = 'kioe-la-v2';
var CORE = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/render.js',
  './assets/js/figures.js',
  './assets/img/icon.svg',
  './content/menu.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(CORE).catch(function () { /* частичный кеш — не беда */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        /* Запасная страница — только для переходов по адресу. Отдать HTML
           вместо скрипта или JSON нельзя: страница падает с «Unexpected
           token '<'», и это держится, пока воркер не снесут вручную. */
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
