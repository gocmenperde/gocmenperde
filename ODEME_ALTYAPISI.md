# Online Ödeme Altyapısı (Göçmen Perde)

Bu akışta ödeme sonucu için **tek doğruluk kaynağı PayTR webhook**'udur.
Frontend URL parametrelerine güvenmez.

## 1) Endpoint'ler

- `POST /api/payment?action=create-paytr-token`
  - PayTR token oluşturur.
  - `merchant_oid` üretir (`gp_<timestamp>_<random>`).
  - `paytr_orders` tablosuna `pending` kayıt açar.
  - Cevap: `{ success, token, merchant_oid, checkout_url }`.

- `GET /api/payment?action=status&merchant_oid=...`
  - `paytr_orders` tablosundan ödeme durumunu döner.
  - Cevap: `{ success, merchant_oid, status, order_no, total }`.

- `POST /api/paytr-callback`
  - PayTR hash doğrulaması yapar.
  - `success` callback geldiğinde idempotent şekilde:
    1. `paytr_orders.status = paid`
    2. Sunucu içinde `/api/orders?action=create` çağrısı
    3. Oluşan sipariş numarasını `paytr_orders.order_id` alanına yazar
  - `failed` callback geldiğinde `status = failed`.
  - Geçerli callback'lerde her zaman `200 OK` döner (idempotent tekrarları da dahil).

## 2) Veritabanı: `paytr_orders`

`server/lib/_paytr-orders.js` ilk kullanımda tabloyu otomatik oluşturur.

Alanlar:
- `merchant_oid` (PK)
- `status` (`pending|paid|failed|cancelled|expired`)
- `payload` (jsonb)
- `paytr_response` (jsonb)
- `total_amount` (kuruş)
- `order_id` (oluşan sipariş no/id)
- `paid_at`, `created_at`, `updated_at`

## 3) Frontend akışı

`index.html` üzerinde kredi kartı adımı:

1. `create-paytr-token` çağrılır.
2. `gp_active_paytr = { merchant_oid, startedAt }` sessionStorage'a yazılır.
3. PayTR checkout yeni sekmede açılır (`window.open`).
   - Popup engelliyse aynı sekme fallback kullanılır.
4. Checkout içinde inline bekleme kartı gösterilir.
5. Her 5 sn'de bir `GET /api/payment?action=status` polling yapılır (maks. 10 dk).
   - `paid` → başarı modalı + sepet temizlenir.
   - `failed/cancelled/expired` → toast + checkout açık kalır.

## 4) Güvenlik notu

- `?payment=success` / `?payment=cancel` gibi URL parametreleri **tek başına güvenilir değildir**.
- Frontend hiçbir zaman URL parametresine bakarak doğrudan sipariş başarısı göstermez.
- Sipariş yaratımı yalnızca webhook `success` akışında sunucuda yapılır.

## 5) İlgili dosyalar

- `server/handlers/payment.js`
- `server/handlers/paytr-callback.js`
- `server/lib/_paytr-orders.js`
- `index.html`
- `sw.js`

## 6) Gerekli ortam değişkenleri

- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `PAYTR_TEST_MODE` (`1` test, `0` canlı)
- `SITE_URL` (önerilir; callback iç çağrılarında kullanılır)
- `DATABASE_URL`

Not: Ortam değişkenlerini güncelledikten sonra yeni deployment alın.
