// Minimal service worker: lets the phone install the site as an app.
// It caches nothing, so you always get the newest version after an upload.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
