# Tur 5 Güncelleme Notları (2026-04-23)

- Tek footer mimarisine geçildi; section içi tüm footer blokları kaldırılarak sayfa sonunda tek `#siteFooter` kullanıldı.
- Section değişimi atomik hale getirildi (`__sectionTransitionLock`).
- Premium tasarım temelleri kuruldu: Cormorant Garamond + DM Sans, şampanya altın paleti `#c8a35a / #a3823f / #e6d3a8` ve bordo aksesuar `#7d2c2c`.
- `helmet` + `compression` sunucuya eklendi, static cache politikası güncellendi (HTML no-cache, JSON 60s, JS/CSS 5dk, görseller 30 gün immutable).

## Mobil donma fixleri (14 madde)
1. `_gridHasCards` early-return guard
2. `resetCategorySelectionToAll` çift applyFilters fix
3. `go()` içinde `requestAnimationFrame` ile `safeApplyFilters`
4. `hashchange` `queueMicrotask` ile race fix
5. `popstate` çift aktivasyon fix
6. `pagehide` timer cleanup
7. `pageshow` bfcache optimization
8. `__productObserver` leak fix
9. GitHub raw fallback kaldırıldı
10. Chunked render (`FIRST_PAINT` 24 + 24’lük `requestIdleCallback`)
11. Initial loading placeholder dinamik
12. `loadProducts` dedupe (1500ms cooldown)
13. Global error logger
14. `__sectionTransitionLock` ile atomik geçiş
