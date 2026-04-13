const crypto = require('crypto');
const { getPaytrCredentials } = require('../lib/_paytr-config');

const SUPPORTED_CURRENCIES = new Set(['TL', 'USD', 'EUR', 'GBP']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// IP alma kısmını basitleştirdik, PayTR boş IP sevmez
function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  if (ip.includes(',')) ip = ip.split(',')[0];
  return ip.replace('::ffff:', '').trim();
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : 'musteri@gocmenperde.com.tr';
}

// SEPET FORMATI - En çok hata burdan çıkar
function buildPaytrBasket(items) {
  const basket = items.map((item) => {
    return [
      String(item.name || 'Ürün').slice(0, 100), // Ürün adı
      String(item.price), // Fiyat (String olmalı)
      Number(item.qty || 1) // Adet (Number olmalı)
    ];
  });
  return Buffer.from(JSON.stringify(basket), 'utf8').toString('base64');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Sadece POST' });

  const { merchantId, merchantKey, merchantSalt, hasRequiredCredentials } = getPaytrCredentials();

  if (!hasRequiredCredentials) {
    return res.status(500).json({ error: 'PayTR anahtarları eksik!' });
  }

  try {
    const { items = [], customer = {}, successUrl, cancelUrl, currency = 'TL' } = req.body || {};

    // 1. Toplam Tutarı Kuruş Cinsinden Hesapla (Örn: 1500 TL -> 150000)
    const totalAmount = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0);
    const paymentAmount = Math.round(totalAmount * 100);

    const merchantOid = "GP" + Date.now(); // Benzersiz sipariş numarası
    const userBasket = buildPaytrBasket(items);
    const userIp = getClientIp(req);
    const userEmail = normalizeEmail(customer.email);

    // PayTR'nin istediği diğer ayarlar
    const testMode = "0"; // Canlı mod
    const debugOn = "1";  // Hata olursa PayTR ekranında söylesin diye 1 yaptık
    const noInstallment = "0"; 
    const maxInstallment = "0";
    const timeoutLimit = "30";

    // TOKEN OLUŞTURMA (Sıralama hayati önem taşır!)
    const hashStr = merchantId + userIp + merchantOid + userEmail + paymentAmount + userBasket + noInstallment + maxInstallment + currency + testMode;
    const paytrToken = crypto
      .createHmac('sha256', merchantKey)
      .update(hashStr + merchantSalt)
      .digest('base64');

    // PayTR'ye gidecek paket
    const params = new URLSearchParams();
    params.append('merchant_id', merchantId);
    params.append('user_ip', userIp);
    params.append('merchant_oid', merchantOid);
    params.append('email', userEmail);
    params.append('payment_amount', paymentAmount);
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
      // PayTR hata verirse ne olduğunu burada göreceğiz
      return res.status(400).json({ error: result.reason || 'PayTR Hatası' });
    }

  } catch (err) {
    return res.status(500).json({ error: 'Kod Hatası: ' + err.message });
  }
};
