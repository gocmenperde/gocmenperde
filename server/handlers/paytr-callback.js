const crypto = require('crypto');
const { getPaytrCredentials } = require('../lib/_paytr-config');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('METHOD_NOT_ALLOWED');

  const { merchantKey, merchantSalt } = getPaytrCredentials();
  const callback = req.body;

  try {
    // PayTR Callback Hash Sıralaması: merchant_oid + salt + status + total_amount
    const hashString = callback.merchant_oid + merchantSalt + callback.status + callback.total_amount;
    const expectedHash = crypto.createHmac('sha256', merchantKey).update(hashString).digest('base64');

    if (expectedHash !== callback.hash) {
      return res.status(400).send('PAYTR_HASH_MISMATCH');
    }

    if (callback.status === 'success') {
      // BURADA: Veritabanında siparişi onaylayın
      console.log(`Sipariş Başarılı: ${callback.merchant_oid}`);
    }

    // PayTR her zaman "OK" yanıtı bekler
    return res.status(200).send('OK');
  } catch (err) {
    return res.status(500).send('CALLBACK_ERROR');
  }
};
