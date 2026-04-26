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

## Tur 7.3 — CTA panel sabitleme (2026-04-26)
- --mobile-nav-offset artık nav'ın getBoundingClientRect ile gerçek viewport-dipten uzaklığını taşıyor (yüzer nav 10+safe gap'i dahil).
- Layout effect ResizeObserver, MutationObserver, fonts.ready, visualViewport scroll ve pageshow ile yeniden tetikleniyor.
- Klavye açıkken CTA panel translateY(120%) ile geçici saklanıyor.


## Tur 7.4 — Alt yığın hiyerarşisi (2026-04-26)
- Mobil sıralama: nav (en alt) → CTA panel → live order toast (en üst).
- CTA paneli koyu/altın yerine beyaz kart (rgba 251,249,245,
  radius 18, menü ile aynı dil).
- Toast cart/checkout section'larında gizleme kaldırıldı, bottom
  hesabı --mobile-nav-offset + --checkout-cta-height ile dinamik.
- Toast z-index 11000 → 12130 (CTA üstü, nav altı).

## Tur 7.5 — CTA detay drawer + ürün bazlı kargo (2026-04-26)
- CTA panele "Detaylar" toggle (chevron) + premium Sipariş Özeti
  drawer (Ara Toplam / Kargo (üzeri çizili-bedava) / İndirim /
  Toplam).
- computeShippingFee = sepetteki en yüksek shippingFee (curtain
  tek paket mantığı), opsiyonel window.__FREE_SHIPPING_THRESHOLD.
- Admin ürün formuna "Kargo Ücreti (TL)" + "Kargo Notu" alanları.
- Sipariş toplamı ve PayTR payment_amount artık kargo dahil.

## Tur 7.7 — Premium drawer paketi (2026-04-26)
- Hediye paketi (admin ayarlı), tahmini teslimat, kupon mini-input,
  ücretsiz kargo ilerleme barı, üye indirimi badge ve satırı,
  hızlı miktar -/+, ödeme chip seçimi, güven satırı, backdrop blur.
- admin.html: giftWrapFee, freeShipThreshold, memberDiscount,
  deliveryRange site-settings alanları.
- PayTR amount server-side olarak ship+gift-kupon-üye dahil
  yeniden hesaplanıyor.

## Tur 7.8 — Drawer overflow ve sıralama düzeltmesi (2026-04-26)
- max-height 320px → 65vh, .cap-drawer-inner içinde scroll
  (overscroll-behavior:contain, alt fade ipucu).
- İçerik sırası yeniden düzenlendi: motivatör → kalemler →
  hesap → seçimler → bilgi → güven.
- "Detaylar" → "Özeti gizle" toggle etiketi.
- Hediye paketi etiketi uppercase'den çıktı (text-transform:none).
- body.cap-drawer-open ile sayfa scroll kilidi.


## Tur 7.9 — Premium bottom-sheet drawer (2026-04-26)
- Backdrop z-index 12100 → 12300 (header dahil tüm ekran).
- Drawer üst köşeleri kıvrımlı, drag handle pill, sticky başlık.
- max-height min(560px,60vh) — içerik kadar büyür.
- Drag-to-close (handle 80px aşağı), ESC ile kapat.
- body.cap-drawer-open ile sayfa scroll kilitli + nav gizli.
- Drawer kapanınca scroll pozisyonu sıfırlanır.
