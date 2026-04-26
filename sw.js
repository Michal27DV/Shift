/* Service Worker pro Shift PWA
   - Network-first pro HTML (rychlé updaty appky)
   - Cache-first pro ikony/manifest (statické, dlouho platné)
   - Firebase API zcela přeskočeno (auth/firestore musí jít vždy live)
   - Verze cache se zvýší při deploy → SW vyhodí starou cache
*/
const CACHE = 'shift-v3';
const PRECACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon.svg'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE).then(c =>
            // Použijeme individuální fetche místo c.addAll: pokud jeden asset selže, ostatní se nainstalujou
            Promise.all(PRECACHE.map(url =>
                fetch(url, { cache: 'no-cache' })
                    .then(r => r.ok ? c.put(url, r) : null)
                    .catch(() => null)
            ))
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Firebase / Google API: vždy live (autentizace, Firestore sync)
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('firebase.com')) {
        return;
    }

    const isHTML = req.mode === 'navigate' ||
                   (req.headers.get('accept') || '').includes('text/html');

    if (isHTML) {
        // Network-first pro HTML (rychlé updaty)
        e.respondWith(
            fetch(req).then(r => {
                const clone = r.clone();
                caches.open(CACHE).then(c => c.put(req, clone));
                return r;
            }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
        );
        return;
    }

    // Cache-first pro vše ostatní (ikony, manifest, případně CDN)
    e.respondWith(
        caches.match(req).then(cached => {
            if (cached) return cached;
            return fetch(req).then(r => {
                if (r.ok && url.origin === self.location.origin) {
                    const clone = r.clone();
                    caches.open(CACHE).then(c => c.put(req, clone));
                }
                return r;
            });
        })
    );
});
