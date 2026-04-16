# Göçmen Perde — Replit Kurulumu

## Proje Özeti
Bursa merkezli perde mağazası için Türkçe e-ticaret sitesi. Statik HTML sayfaları + Node.js/Express API backend + PostgreSQL veritabanı.

## Mimari
- **Frontend**: Statik HTML dosyaları (index.html, admin.html, hesabim.html vb.)
- **Backend**: Express.js server (`server.js`) — statik dosyaları ve API rotalarını aynı süreçten sunar
- **Veritabanı**: PostgreSQL (`pg` paketi, `DATABASE_URL` secret'i ile bağlanır)
- **Ödeme**: PayTR entegrasyonu
- **E-posta**: Resend API entegrasyonu
- **Resim İşleme**: Sharp ile otomatik WebP dönüşümü ve boyutlandırma

## Çalıştırma
"Start application" workflow'u `npm run dev` komutunu çalıştırır → `server.js` → port 5000.

## API Yapısı
- Tüm API çağrıları `/api/<rota>` şeklinde yapılır
- Rotalar `api/router.js` üzerinden `server/handlers/` altındaki handler'lara dağıtılır
- Veritabanı bağlantısı: `server/lib/_db.js`
- Auth yardımcısı: `server/lib/_auth-utils.js`
- Admin auth merkezi: `server/lib/_admin-auth.js`

## Yeni API Endpoint'leri
- `POST /api/admin-upload` — Resim yükleme (Sharp ile otomatik WebP + boyutlandırma, max 1600px)
- `POST /api/admin-save-json` — products.json / categories.json kaydetme

## Güvenlik Özellikleri
- Tüm admin handler'larında merkezi auth (`server/lib/_admin-auth.js`)
- Admin anahtarı `ADMIN_SECRET_KEY` env var'ından okunur
- Rate limiting: 15 dk'da max 20 istek per IP
- Güvenlik başlıkları: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection vb.
- Gzip sıkıştırma tüm yanıtlarda aktif

## Gerekli Secret'lar
| Secret | Açıklama |
|--------|----------|
| `DATABASE_URL` | PostgreSQL bağlantı adresi ✓ |
| `AUTH_TOKEN_SECRET` | Kullanıcı auth token'ları için ✓ |
| `ADMIN_SECRET_KEY` | Admin API anahtarı (varsayılan: gocmen1993) |
| `PAYTR_MERCHANT_ID` | PayTR ödeme ✓ |
| `RESEND_API_KEY` | E-posta gönderimi ✓ |
| `RESEND_FROM_EMAIL` | Gönderen e-posta ✓ |
| `ADMIN_ORDER_EMAIL` | Sipariş bildirim e-postası ✓ |
| `SITE_URL` | Sitenin genel URL'i |

## Performans
- Resimler (`/resimler/`): 7 gün tarayıcı önbelleği
- HTML dosyaları: no-cache (her zaman güncel)
- Statik dosyalar: 1 saat önbellek
- Gzip sıkıştırma aktif

## Migrasyon Notları
- Vercel serverless functions → Express router'a taşındı
- dotenv kaldırıldı (Replit env'leri otomatik inject eder)
- GitHub API ile resim yükleme → Sunucu tabanlı yüklemeye geçildi (GitHub opsiyonel backup)

## Premium Tasarım İyileştirmeleri (index.html)
- **Footer**: Tek satır yer tutucunun yerine 4 kolonlu premium footer: Marka + açıklama + sosyal medya, Koleksiyonlar, Kurumsal linkler, İletişim bilgileri
- **Hero subtitle**: Ana başlığın altına "pill" tasarımlı alt başlık metni eklendi
- **"Yukarı çık" butonu**: 500px scroll sonrası görünen altın rengi animasyonlu buton
- **CSS iyileştirmeleri**: Features strip hover, Trust KPI sol border, Process step üst gradient, Live categories hover, Signature banner, Local SEO kutusu, Reviews header
- **Footer kategori linkleri**: `fon-perde` → `fonperdeler` olarak düzeltildi
