function getPaytrCredentials() {
  // Hem NEXT_PUBLIC hem de düz hallerini kontrol eder
  const merchantId = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_ID || process.env.PAYTR_MERCHANT_ID || '';
  const merchantKey = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_KEY || process.env.PAYTR_MERCHANT_KEY || '';
  const merchantSalt = process.env.NEXT_PUBLIC_PAYTR_MERCHANT_SALT || process.env.PAYTR_MERCHANT_SALT || '';

  return {
    merchantId: merchantId.trim(),
    merchantKey: merchantKey.trim(),
    merchantSalt: merchantSalt.trim(),
    hasRequiredCredentials: Boolean(merchantId && merchantKey && merchantSalt)
  };
}
