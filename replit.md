# Changelog (2026-04-23)

- Mobil Safari donmalarına yol açan ürün filtreleme/navigasyon yarış durumları düzeltildi.
- Ürün grid render akışı chunked render + event delegation ile optimize edildi.
- Foreground refresh, pagehide/pageshow ve hashchange akışları iOS bfcache dostu olacak şekilde güncellendi.
- Sunucu cache-control politikası statik tip bazlı hale getirildi; `helmet` + `compression` middleware eklendi.
- Üretim hata görünürlüğü için global error/unhandledrejection logları eklendi.
- Premium görsel dil için temel renk/tipografi/header/mikro etkileşim güncellemeleri uygulandı.
