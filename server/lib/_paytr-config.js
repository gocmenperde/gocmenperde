// server/lib/_paytr-config.js
module.exports = {
  getPaytrCredentials: () => {
    const id = process.env.PAYTR_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYTR_MERCHANT_ID || '';
    const key = process.env.PAYTR_MERCHANT_KEY || process.env.NEXT_PUBLIC_PAYTR_MERCHANT_KEY || '';
    const salt = process.env.PAYTR_MERCHANT_SALT || process.env.NEXT_PUBLIC_PAYTR_MERCHANT_SALT || '';

    return {
      merchantId: String(id).trim(),
      merchantKey: String(key).trim(),
      merchantSalt: String(salt).trim(),
      hasRequiredCredentials: !!(String(id).trim() && String(key).trim() && String(salt).trim())
    };
  }
};
