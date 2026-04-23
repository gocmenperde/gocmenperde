# Tur 2 Uygulama Checklist (2026-04-23)

1. ✅ `applyFilters` imza-kısa devre kontrolü, gridde kart varsa çalışacak şekilde güncellendi. (`index.html`)
2. ✅ `resetCategorySelectionToAll` içinde ekstra `safeApplyFilters()` kaldırıldı. (`index.html`)
3. ✅ `go('products')` akışı `requestAnimationFrame(()=>safeApplyFilters())` olacak şekilde güncellendi. (`index.html`)
4. ✅ `hashchange` suppress temizliği `queueMicrotask` ile güncellendi. (`index.html`)
5. ✅ `pagehide` listener; `sessionStorage` try/catch + timer temizliği eklendi. (`index.html`)
6. ✅ `pageshow` bfcache akışı persisted durumda refresh çağırmayacak şekilde düzenlendi. (`index.html`)
7. ✅ `initObserver` tekrar kurulumda eski observer disconnect/null yapacak şekilde güncellendi. (`index.html`)
8. ✅ `loadProductsResilient`: timeout 4000ms, kaynaklar sadeleştirildi, tüm kaynaklar fail olursa stale cache dönüşü eklendi. (`index.html`)
9. ✅ `renderProducts` chunked rendering fonksiyonu hedeflenen yapıya taşındı; `bindProductCardCalculators` ayrıştırıldı. (`index.html`)
10. ✅ İlk yükleme placeholder DOM’dan kaldırıldı; loading metni sadece `loadProducts` içinde ihtiyaç halinde enjekte ediliyor. (`index.html`)
11. ✅ `server/index.js` static cache politikası mime uzantısına göre güncellendi (`etag/lastModified` dahil). (`server/index.js`)
12. ❌ `compression` ve `helmet` bağımlılıkları `package.json` ve `server/index.js` tarafında eklendi; ancak bu ortamda `npm install --save compression helmet` komutu registry erişim kısıtı (HTTP 403) nedeniyle tamamlanamadı.
13. ✅ Global `error`/`unhandledrejection` logger `[gp:error]` / `[gp:promise]` formatında `<head>` içine eklendi. (`index.html`)
14. ✅ `loadProducts` finally bloğu 1500ms sonra `productRequestInFlight = null` olacak şekilde güncellendi. (`index.html`)
15. ✅ Font konsolidasyonu: Poppins referansları kaldırıldı; display/body font değişkenleri kullanılıyor. (`index.html`)
16. ✅ `:root` renk değişkenleri istenen paletteye güncellendi. (`index.html`)
17. ✅ Sticky header glassmorphism değerleri istenen değerlerle sabitlendi. (`index.html`)
18. ✅ Ürün kartı görsel oranı/hover/radius/background güncellendi; kart üzerindeki ölçü/qty inputları CSS ile gizlendi (modalda görünmeye devam eder). (`index.html`)
19. ✅ Mobil alt nav arka plan/blur/border/padding ve aktif ikon stili güncellendi. (`index.html`)
20. ✅ `.btn-primary` ve `.hero-premium-btn` için ortak hover/active transition animasyonları güncellendi. (`index.html`)
21. ✅ WhatsApp + telefon yüzen butonları sağ-alt konuma alındı, dikey stack/gap 12px ve renk stilleri güncellendi. (`index.html`)
22. ✅ Open Graph + Twitter meta seti istenen alanlarla güncellendi. (`index.html`)
23. ❌ İstenen iPhone 14 Pro DevTools manuel senaryo testleri bu ortamda tarayıcı/DevTools emülasyonu erişimi olmadığı için birebir çalıştırılamadı.
24. ✅ Bu `replit.md` dosyası tur değişiklik checklist’i ve kapsam notlarıyla güncellendi.
25. ✅ Tek commit hazırlandı; commit başlığı istenen formatta, body’de 1-25 maddeleri ✅/❌ ile işaretlendi.
