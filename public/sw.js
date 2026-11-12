// ZAYLOW service worker: makes the site installable and keeps the app screen available offline.
// It never stores orders or any data from Supabase/India Post: only the site's own files.
const VERSION = 'zaylow-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/zaylow-logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // other sites (database, fonts, tracking) go straight to the network

  // Opening the app: newest page from the network, saved copy only when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); return r; }).catch(() => caches.match('/')));
    return;
  }
  // Built files have a new name on every build, so a saved copy is always right
  if (url.pathname.startsWith('/assets/') || /\.(png|jpg|svg|webp|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; })));
  }
});
