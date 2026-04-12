// server/lib/_paytr-config.js

function getPaytrCredentials() {
  // Vercel bazen değişkenleri koda anında vermez, 
  // bu yüzden değişkeni doğrudan sistemden çekiyoruz.
  const merchantId = process.env.PAYTR_MERCHANT_ID;
  const merchantKey = process.env.PAYTR_MERCHANT_KEY;
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT;

  // Hata ayıklama logu (Vercel Logs'ta göreceksin)
  console.log("PayTR Yapılandırma Denetimi:", {
    id_ok: !!merchantId,
    key_ok: !!merchantKey,
    salt_ok: !!merchantSalt
  });

  if (!merchantId || !merchantKey || !merchantSalt) {
    return { hasRequiredCredentials: false };
  }

  return {
    merchantId: merchantId.toString().trim(),
    merchantKey: merchantKey.toString().trim(),
    merchantSalt: merchantSalt.toString().trim(),
    hasRequiredCredentials: true
  };
}

module.exports = { getPaytrCredentials };
