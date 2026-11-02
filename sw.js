// Fox9nertron offline cache. Bump VERSION when files change.
const VERSION = 'f9t-v2.3.2';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'js/app.js','js/sch-core.js','js/tabs/schematic.js','js/tabs/calc.js','js/tabs/learn.js','js/pcb-core.js','js/pcb-route.js','js/pcb-cam.js','js/pcb-gerber.js','js/pcb-assembly.js','js/sketch.js','js/oled.js','js/qr.js','relays.html','js/tabs/pcb.js','js/formulas.js','js/mna.js','js/num.js','js/tabs/basic.js','js/tabs/capacitor.js','js/tabs/inductor.js','js/tabs/kirchhoff.js','js/tabs/parts.js','js/tabs/rectifier.js','js/tabs/timing.js','js/ui.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => { })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return r; } return caches.match(e.request, { ignoreSearch: true }).then(h => h || r); })   // site down (404 / 5xx while GitHub redeploys): keep using the saved copy
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
