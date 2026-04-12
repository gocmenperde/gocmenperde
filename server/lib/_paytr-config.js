// server/lib/_paytr-config.js

function getPaytrCredentials() {
  // Sadece Vercel ortam değişkenlerinden oku
  const merchantId = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_ID || process.env.PAYTR_MERCHANT_ID;
  const merchantKey = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_KEY || process.env.PAYTR_MERCHANT_KEY;
  const merchantSalt = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_SALT || process.env.PAYTR_MERCHANT_SALT;

  // Güvenlik Kontrolü: Eğer değişkenler yüklenemediyse sistemi durdur ve uyar
  if (!merchantId || !merchantKey || !merchantSalt) {
    console.error("KRİTİK HATA: PayTR ortam değişkenleri Vercel üzerinde bulunamadı!");
    return {
      hasRequiredCredentials: false
    };
  }

  return {
    merchantId: merchantId.trim(),
    merchantKey: merchantKey.trim(),
    merchantSalt: merchantSalt.trim(),
    hasRequiredCredentials: true
  };
}

module.exports = { getPaytrCredentials };
