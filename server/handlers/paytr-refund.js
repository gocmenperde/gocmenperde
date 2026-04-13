// Refund Token Sıralaması: merchant_id + merchant_oid + return_amount + salt
const rawToken = merchantId + normalizedMerchantOid + normalizedAmount + merchantSalt;
const paytrToken = crypto.createHmac('sha256', merchantKey).update(rawToken).digest('base64');
