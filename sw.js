const CACHE = 'gp-v1';
const RUNTIME = 'gp-runtime-v1';
const PRECACHE = ['/', '/products.json', '/categories.json'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/reviews-summary') return;
  if (/\.(png|jpe?g|webp|svg|woff2?)$/i.test(url.pathname)) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.pathname === '/products.json' || url.pathname === '/categories.json' || url.pathname === '/api/reviews-summary') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(e.request);
        const c = await caches.open(RUNTIME);
        if (fresh.ok) c.put(e.request, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        throw _;
      }
    })());
  }
});
