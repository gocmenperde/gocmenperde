// server/lib/_paytr-config.js
module.exports = {
  getPaytrCredentials: () => {
    // .trim() kullanarak sağdaki soldaki tüm görünmez boşlukları siliyoruz
    const id = (process.env.NEXT_PUBLIC_PAYTR_MERCHANT_ID || '').trim();
    const key = (process.env.NEXT_PUBLIC_PAYTR_MERCHANT_KEY || '').trim();
    const salt = (process.env.NEXT_PUBLIC_PAYTR_MERCHANT_SALT || '').trim();

    console.log("PayTR Deseni Kontrol Ediliyor...");

    return {
      merchantId: id,
      merchantKey: key,
      merchantSalt: salt,
      hasRequiredCredentials: Boolean(id && key && salt)
    };
  }
};
