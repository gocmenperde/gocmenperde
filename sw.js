const VERSION = '2026-04-25-1';
const CACHE = `gp-${VERSION}`;
const RUNTIME = `gp-runtime-${VERSION}`;
const PRECACHE = ['/products.json', '/categories.json'];

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await Promise.allSettled(PRECACHE.map((u) => c.add(u).catch(() => null)));
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => ![CACHE, RUNTIME].includes(k)).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('cloudinary.com') || url.hostname.includes('res.cloudinary')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/reviews-summary') return;
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  if (/\.(png|jpe?g|webp|svg|woff2?)$/i.test(url.pathname)) {
    if (url.pathname.includes('/payment-logos/') || url.pathname.includes('/resimler/')) {
      e.respondWith((async () => {
        const cache = await caches.open(RUNTIME);
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const res = await fetch(e.request);
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        } catch (_) {
          return cached || Response.error();
        }
      })());
      return;
    }
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
