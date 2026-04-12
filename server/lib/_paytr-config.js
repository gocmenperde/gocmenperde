// server/lib/_paytr-config.js
module.exports = {
  getPaytrCredentials: () => {
    // Vercel'in en temel okuma biçimi
    const id = process.env.PAYTR_MERCHANT_ID;
    const key = process.env.PAYTR_MERCHANT_KEY;
    const salt = process.env.PAYTR_MERCHANT_SALT;

    // Log kaydı - Boş geliyorsa Vercel'e sinyal gönderiyoruz
    if (!id || !key || !salt) {
      console.error("KRİTİK: Vercel ortam değişkenleri koda ulaşmıyor!");
    }

    return {
      merchantId: (id || '').toString().trim(),
      merchantKey: (key || '').toString().trim(),
      merchantSalt: (salt || '').toString().trim(),
      hasRequiredCredentials: !!(id && key && salt)
    };
  }
};
