const crypto = require('crypto');
const { getPaytrCredentials } = require('../lib/_paytr-config');

function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '1.1.1.1';
  if (ip.includes(',')) ip = ip.split(',')[0];
  return ip.replace('::ffff:', '').trim();
}

function buildPaytrBasket(items) {
  const basket = items.map((item) => [
    String(item.name || 'Ürün').slice(0, 100), 
    String(item.price), 
    Number(item.qty || 1)
  ]);
  return Buffer.from(JSON.stringify(basket), 'utf8').toString('base64');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { merchantId, merchantKey, merchantSalt, hasRequiredCredentials } = getPaytrCredentials();

  if (!hasRequiredCredentials) {
    return res.status(500).json({ error: 'PayTR anahtarları Vercel panelinde bulunamadı!' });
  }

  try {
    const { items = [], customer = {}, successUrl, cancelUrl, currency = 'TL' } = req.body || {};

    const totalAmount = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0);
    const paymentAmount = Math.round(totalAmount * 100);

    const merchantOid = "GP" + Date.now();
    const userBasket = buildPaytrBasket(items);
    const userIp = getClientIp(req);
    const userEmail = customer.email || 'musteri@gocmenperde.com.tr';

    const testMode = "0"; 
    const debugOn = "1";
    const noInstallment = "0"; 
    const maxInstallment = "0";
    const timeoutLimit = "30";

    // --- TOKENSİZ KALMASIN: paytr_token OLUŞTURMA ---
    // Sıralama: merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode
    const hashString = merchantId + userIp + merchantOid + userEmail + paymentAmount + userBasket + noInstallment + maxInstallment + currency + testMode + merchantSalt;
    
    const paytrToken = crypto
      .createHmac('sha256', merchantKey)
      .update(hashString)
      .digest('base64');

    const params = new URLSearchParams();
    params.append('merchant_id', merchantId);
    params.append('user_ip', userIp);
    params.append('merchant_oid', merchantOid);
    params.append('email', userEmail);
    params.append('payment_amount', String(paymentAmount));
    params.append('paytr_token', paytrToken);
    params.append('user_basket', userBasket);
    params.append('debug_on', debugOn);
    params.append('test_mode', testMode);
    params.append('no_installment', noInstallment);
    params.append('max_installment', maxInstallment);
    params.append('user_name', customer.name || 'Müşteri');
    params.append('user_address', 'Bursa Osmangazi');
    params.append('user_phone', customer.phone || '05000000000');
    params.append('merchant_ok_url', successUrl || 'https://gocmenperde.com.tr');
    params.append('merchant_fail_url', cancelUrl || 'https://gocmenperde.com.tr');
    params.append('timeout_limit', timeoutLimit);
    params.append('currency', currency);

    const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const result = await response.json();

    if (result.status === 'success') {
      return res.status(200).json({
        success: true,
        checkout_url: `https://www.paytr.com/odeme/guvenli/${result.token}`
      });
    } else {
      return res.status(400).json({ error: result.reason || 'PayTR reddetti: ' + JSON.stringify(result) });
    }

  } catch (err) {
    return res.status(500).json({ error: 'Sunucu Hatası: ' + err.message });
  }
};
