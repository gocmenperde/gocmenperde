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

## Tur 6 — Yorum Sistemi Düzeltmeleri (2026-04-24)

- Admin auth tekilleştirildi: yeni `server/lib/_admin-auth.js` ile `ADMIN_TOKEN`/`ADMIN_API_KEY` uyumlu doğrulama, admin handler'ları ortak `requireAdmin` kullanıyor.
- Admin panel token saklama/okuma normalize edildi: hem `admin_api_key` hem `gp_admin_token` localStorage+sessionStorage senkron tutuluyor.
- Yorum seed altyapısı geri eklendi: `is_seed` + `source` alanları, `server/lib/_seed-reviews.js`, startup/cron otomatik tamamlama.
- Admin yorum moderasyonuna `seed-all` ve `regenerate-seeds` aksiyonları eklendi.
- Public `/api/reviews` sıralama ve görünürlük düzeltildi (onaylı yorumlar, verified > gerçek > seed).
- Ürün modalındaki “Yorum Yaz” formu submit akışı defansif şekilde yenilendi; auto-approve açıkken yorum anında listeye düşüyor.


## Yasal Uyarı

- Sahte yorum üretimi sadece geliştirme amaçlıdır, üretimde kullanılması yasal ihlaldir.

## Tur 7 — UX Mikro İyileştirmeleri (2026-04-26)
- Ödeme: "Adresleri Yönet" aynı sekmede açılıyor, hesabım'dan
  "Ödemeye Dön" şeridi eklendi.
- hesap.html: giriş sonrası varsayılan yönlendirme anasayfaya
  (?welcome=1) çekildi; premium şampanya altın + bordo gradient
  hoşgeldiniz banner'ı eklendi.
- Mobil CTA bar 2 satıra çıkarıldı: ödeme yöntemi etiketi + 256-bit
  SSL rozeti; buton dinamik metinli (sepet adedi, tutar, stok
  uyarısı) altın gradient ile yenilendi.

## Tur 7.1 — UX Bug Fix (2026-04-26)
- Mobil CTA bar artık alt nav'ın üstüne yerleşiyor (--mobile-nav-offset).
- Alt nav "Hesabım" butonu mevcut section'ı sessionStorage + back parametresine kaydediyor.
- hesabim.html → hesap.html ve hesap.html → next yönlendirmeleri window.location.replace() ile yapıldı; Safari geri tuşu artık login ekranını atlayıp kullanıcının geldiği section'a dönüyor.

## Tur 7.2 — PayTR teşhis + CTA bitişik (2026-04-26)
- payment.js: parsePaytrResponse + pickClientIp daha tolerant,
  console.error log'u, html_response/empty_response/invalid_format
  ayrımı.
- Mobil CTA panel alt nav'a tam bitişik (border-radius:0,
  bottom = --mobile-nav-offset).
