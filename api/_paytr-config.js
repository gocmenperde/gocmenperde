function resolveEnvValue(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

const DEFAULT_PAYTR_TEST_CREDENTIALS = {
  merchantId: '690414',
  merchantKey: 'qiyTzuAETF2mB8pk',
  merchantSalt: '4o3qjuMhFhc7DpQH'
};

function getPaytrCredentials() {
  const merchantId = resolveEnvValue(
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_NO',
    'PAYTR_MERCHANTID',
    'PAYTR_ID',
    'MERCHANT_ID',
    'merchant_id'
  );

  const merchantKey = resolveEnvValue(
    'PAYTR_MERCHANT_KEY',
    'PAYTR_API_KEY',
    'PAYTR_KEY',
    'MERCHANT_KEY',
    'merchant_key'
  );

  const merchantSalt = resolveEnvValue(
    'PAYTR_MERCHANT_SALT',
    'PAYTR_API_SALT',
    'PAYTR_SALT',
    'MERCHANT_SALT',
    'merchant_salt'
  );

  const resolvedMerchantId = merchantId || DEFAULT_PAYTR_TEST_CREDENTIALS.merchantId;
  const resolvedMerchantKey = merchantKey || DEFAULT_PAYTR_TEST_CREDENTIALS.merchantKey;
  const resolvedMerchantSalt = merchantSalt || DEFAULT_PAYTR_TEST_CREDENTIALS.merchantSalt;

  return {
    merchantId: resolvedMerchantId,
    merchantKey: resolvedMerchantKey,
    merchantSalt: resolvedMerchantSalt,
    hasRequiredCredentials: Boolean(resolvedMerchantId && resolvedMerchantKey && resolvedMerchantSalt)
  };
}

module.exports = {
  getPaytrCredentials
};
