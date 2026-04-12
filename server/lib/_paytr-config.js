// server/lib/_paytr-config.js

function getPaytrCredentials() {
  // 1. Önce doğrudan süreci kontrol et
  const id = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_ID || process.env.PAYTR_MERCHANT_ID || '';
  const key = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_KEY || process.env.PAYTR_MERCHANT_KEY || '';
  const salt = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_SALT || process.env.PAYTR_MERCHANT_SALT || '';

  // 2. Eğer hala boş geliyorsa (Vercel bazen bunu yapar), bu bir fall-back'tir.
  // Ama yukarıdaki process.env çalışırsa buraya bakmaz bile.
  return {
    merchantId: id.toString().trim(),
    merchantKey: key.toString().trim(),
    merchantSalt: salt.toString().trim(),
    hasRequiredCredentials: Boolean(id && key && salt)
  };
}

module.exports = { getPaytrCredentials };
