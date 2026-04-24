const CACHE = 'gp-v4';
const RUNTIME = 'gp-runtime-v4';
const PRECACHE = ['/products.json', '/categories.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Eski cache versiyonlarını temizle.
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== CACHE && k !== RUNTIME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Cloudinary: HER ZAMAN network. Cache YOK. Eski görsel asla dönmesin.
  if (url.hostname.includes('cloudinary.com') || url.hostname.includes('res.cloudinary')) {
    e.respondWith(fetch(e.request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // /api/* asla cache'lenmez (campaigns dahil).
  if (url.pathname.startsWith('/api/')) return;
  // HTML / navigation: network-first, cache yedekleme YOK (eski HTML asla dönmesin).
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // payment-logos ve resimler: NETWORK-FIRST (eskiden stale-while-revalidate idi, flicker yapıyordu).
  if (/\.(png|jpe?g|webp|svg)$/i.test(url.pathname)) {
    if (url.pathname.includes('/payment-logos/') || url.pathname.includes('/resimler/')) {
      e.respondWith((async () => {
        try {
          const fresh = await fetch(e.request);
          if (fresh.ok) {
            const cache = await caches.open(RUNTIME);
            cache.put(e.request, fresh.clone());
          }
          return fresh;
        } catch (_) {
          const cached = await caches.match(e.request);
          if (cached) return cached;
          throw _;
        }
      })());
      return;
    }
    // Diğer statik görsel/font: cache-first OK
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // woff/woff2 fontları: cache-first
  if (/\.woff2?$/i.test(url.pathname)) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.pathname === '/products.json' || url.pathname === '/categories.json') {
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
