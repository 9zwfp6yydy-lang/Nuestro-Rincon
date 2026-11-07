/* =====================================================================
   sw.js — Service worker de Nuestro Rincón 🏡
   Dos trabajos:
   1) Caché básica de la app (instalable como PWA y abre rápido).
   2) Web Push: cuando llega un aviso de llamada muestra la notificación
      del sistema; al tocarla enfoca la app (o la abre) en la Sala.
   Sin claves aquí dentro: este archivo es público.
   ===================================================================== */
'use strict';

var CACHE = 'nuestro-rincon-v3-7-5';
var ARCHIVOS_APP = [
  './',
  './index.html',
  './styles.css',
  './skins.css',
  './config.js',
  './logic.js',
  './games.js',
  './fun.js',
  './app.js',
  './skins.js',
  './manifest.json'
];

/* ---------- Instalación: guardar la app en caché ---------- */
self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Uno a uno: si un archivo falla, la instalación no se cae entera.
      return Promise.all(ARCHIVOS_APP.map(function (url) {
        return cache.add(url).catch(function () { /* ese archivo se pedirá en vivo */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* ---------- Activación: limpiar cachés viejas y tomar el control ---------- */
self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(nombres.map(function (n) {
        return n === CACHE ? null : caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* ---------- Red: solo GET del mismo origen; primero caché, luego red ---------- */
/* (Las llamadas a Supabase y al CDN son de otro origen o POST: pasan de
   largo sin tocar, para no cachear datos de la familia jamás.) */
self.addEventListener('fetch', function (evento) {
  var req = evento.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // La página misma (navegaciones): PRIMERO LA RED, para que una versión
  // nueva se note en cuanto se abre la app instalada (en iOS la copia en
  // caché se empeñaba en quedarse). Sin red, la copia guardada.
  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copiaNav = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copiaNav); });
        }
        return resp;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (m) {
          return m || caches.match('./index.html', { ignoreSearch: true });
        });
      })
    );
    return;
  }
  evento.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (enCache) {
      var enRed = fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copia = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copia); });
        }
        return resp;
      }).catch(function () { return enCache; });
      // Si está en caché se sirve al instante y la red refresca detrás;
      // si no, se espera a la red (y sin red… lo que haya).
      return enCache || enRed;
    })
  );
});

/* ---------- Push: aviso de llamada ---------- */
self.addEventListener('push', function (evento) {
  var datos = {};
  try { datos = evento.data ? evento.data.json() : {}; } catch (e) {
    try { datos = { body: evento.data ? evento.data.text() : '' }; } catch (e2) { datos = {}; }
  }
  var titulo = datos.title || '📹 Nuestro Rincón';
  var opciones = {
    body: datos.body || 'Alguien te está llamando en Nuestro Rincón 📹',
    tag: datos.tag || 'llamada-nuestro-rincon',
    renotify: true,
    vibrate: [250, 120, 250, 120, 400],
    data: { url: datos.url || './' }
  };
  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

/* ---------- Toque en la notificación: enfocar o abrir la app ---------- */
self.addEventListener('notificationclick', function (evento) {
  evento.notification.close();
  var destino = (evento.notification.data && evento.notification.data.url) || './';
  var urlAbsoluta = new URL(destino, self.location.href).href;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ventanas) {
      for (var i = 0; i < ventanas.length; i++) {
        var v = ventanas[i];
        // La app es una sola página: enfocarla ya la deja en la Sala
        // (la pestaña por defecto) y la tarjeta de llamada hace el resto.
        if ('focus' in v) return v.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlAbsoluta);
    })
  );
});
