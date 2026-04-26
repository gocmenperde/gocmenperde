const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { getPaytrCredentials } = require('../lib/_paytr-config');
const { insertPending, getStatus } = require('../lib/_paytr-orders');
const { getCheckoutSettings } = require('../lib/_site_settings');

const { applyCors } = require('../lib/_cors');
function safeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeEmail(value = '') {
  const email = safeString(value).toLowerCase();
  if (!email) return 'bilgi@gocmenperde.com.tr';
  return email.length > 120 ? email.slice(0, 120) : email;
}

function normalizePhone(value = '') {
  const digits = safeString(value).replace(/\D+/g, '');
  if (!digits) return '05000000000';
  if (digits.length === 10) return `0${digits}`;
  if (digits.length > 11) return digits.slice(-11);
  return digits;
}

function normalizeAddress(value = '') {
  return safeString(value, 'Türkiye')
    .replace(/\n+/g, ', ')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

function toMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number * 100) / 100;
}

function formatMoney(value) {
  return toMoney(value).toFixed(2);
}

function buildPaytrBasket(items = []) {
  const basket = items.map((item) => [
    safeString(item?.name, 'Ürün').slice(0, 100),
    formatMoney(item?.price),
    Math.max(1, Number(item?.qty || 1)),
  ]);
  return Buffer.from(JSON.stringify(basket), 'utf8').toString('base64');
}

function readProductsCatalog() {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'products.json'), 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function computeShippingFeeFromItems(items = [], subtotal = 0) {
  if (!Array.isArray(items) || !items.length) return { fee: 0, originalFee: 0, isFree: true };
  const products = readProductsCatalog();
  let maxFee = 0;
  for (const item of items) {
    const id = String(item?.id ?? item?.productId ?? item?.pid ?? '').trim();
    const p = id ? products.find((x) => String(x?.id ?? '').trim() === id) : null;
    const fee = Number(p?.shippingFee ?? item?.shippingFee ?? 0);
    if (Number.isFinite(fee) && fee > maxFee) maxFee = fee;
  }
  const threshold = Number(process.env.FREE_SHIPPING_THRESHOLD || 0);
  const isFree = maxFee === 0 || (threshold > 0 && subtotal >= threshold);
  return {
    fee: isFree ? 0 : maxFee,
    originalFee: maxFee,
    isFree,
  };
}

function pickClientIp(req) {
  const rawForwarded = safeString(req.headers['x-forwarded-for']);
  const forwardedIps = rawForwarded
    ? rawForwarded.split(',').map((v) => safeString(v)).filter(Boolean)
    : [];
  for (const ip of forwardedIps) {
    const n = ip.replace('::ffff:', '');
    if (net.isIP(n) === 4 && !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n)) {
      return n;
    }
  }
  const raw = forwardedIps[0] || safeString(req.socket?.remoteAddress);
  const normalized = raw.replace('::ffff:', '');
  if (net.isIP(normalized) === 4) return normalized;
  const configuredFallback = safeString(process.env.PAYTR_FALLBACK_CLIENT_IP, '');
  if (configuredFallback && net.isIP(configuredFallback) === 4) return configuredFallback;
  console.warn('[paytr] pickClientIp falling back to 127.0.0.1; xff=', rawForwarded);
  return '127.0.0.1';
}

async function parsePaytrResponse(response) {
  let rawBody = '';
  try {
    rawBody = await response.text();
  } catch (readErr) {
    return { payload: null, parseError: `read_failed:${safeString(readErr.message, 'read_err')}`, rawBody: '' };
  }
  if (!rawBody) {
    return { payload: null, parseError: 'empty_response', rawBody: '' };
  }
  // 1) JSON dene
  try {
    return { payload: JSON.parse(rawBody), parseError: null, rawBody };
  } catch (_) {}
  // 2) Form-encoded dene
  try {
    const asForm = new URLSearchParams(rawBody);
    if (asForm.has('status') || asForm.has('reason') || asForm.has('token')) {
      return {
        payload: Object.fromEntries(asForm.entries()),
        parseError: null,
        rawBody,
      };
    }
  } catch (_) {}
  // 3) Açıklayıcı hata + body'nin başı
  const trimmed = rawBody.trim();
  const looksHtml = /^<(!doctype|html|head|body)/i.test(trimmed);
  return {
    payload: null,
    parseError: looksHtml ? 'html_response' : 'invalid_format',
    rawBody,
  };
}

function computeMemberDiscount(subtotalKurus, pct) {
  const percent = Math.max(0, Number(pct || 0));
  if (!percent) return 0;
  return Math.max(0, Math.round((subtotalKurus * percent) / 100));
}

function createMerchantOid() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex');
  return `gp${ts}${rand}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  const action = safeString(req.query?.action);

  if (action === 'status' && req.method === 'GET') {
    const merchantOid = safeString(req.query?.merchant_oid);
    if (!merchantOid) return res.status(400).json({ error: 'merchant_oid zorunlu.' });
    const record = await getStatus(merchantOid);
    if (!record) return res.status(404).json({ error: 'Ödeme oturumu bulunamadı.' });
    return res.status(200).json({
      success: true,
      merchant_oid: record.merchant_oid,
      status: record.status,
      order_no: record.order_id || '',
      total: Number(record.total_amount || 0) / 100,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const creds = getPaytrCredentials();
  const { merchantId, merchantKey, merchantSalt } = creds;
  if (!creds.hasRequiredCredentials) {
    console.error('[paytr] missing credentials:', creds.debugSources);
    return res.status(500).json({
      error: 'Ödeme altyapısı yapılandırılmamış (env eksik).',
      missing: Object.entries(creds.debugSources)
        .filter(([, v]) => !v).map(([k]) => k),
    });
  }

  try {
    const { items = [], customer = {}, successUrl, cancelUrl, currency = 'TL', shippingAddress = '', orderNote = '' } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Sepet boş görünüyor.' });

    const normalizedItems = items
      .map((item) => ({
        name: safeString(item?.name, 'Ürün'),
        qty: Math.max(1, Number(item?.qty || 1)),
        price: toMoney(item?.price),
      }))
      .filter((item) => item.price > 0);
    if (!normalizedItems.length) return res.status(400).json({ error: 'Sepette geçerli ürün bulunamadı.' });

    const subtotal = normalizedItems.reduce((sum, item) => sum + Math.round(item.price * 100) * item.qty, 0);
    const couponDiscount = Math.max(0, Math.round(Number(req.body?.couponDiscountAmount || req.body?.couponDiscount || 0) * 100) || 0);
    const settings = await getCheckoutSettings().catch(() => ({}));
    const freeShippingThreshold = Number(settings?.freeShipThreshold || process.env.FREE_SHIPPING_THRESHOLD || 0);
    const shipping = computeShippingFeeFromItems(items, subtotal / 100);
    if (freeShippingThreshold > 0 && subtotal / 100 >= freeShippingThreshold) {
      shipping.fee = 0;
      shipping.isFree = true;
    }
    const shippingAmount = Math.max(0, Math.round(Number(shipping.fee || 0) * 100));
    const giftWrapFee = req.body?.giftWrap ? Math.max(0, Math.round(Number(settings?.giftWrapFee || 0) * 100)) : 0;
    const memberDiscount = computeMemberDiscount(subtotal, Number(req.body?.memberDiscountPct || 0));
    const paymentAmount = Math.max(0, subtotal + shippingAmount + giftWrapFee - couponDiscount - memberDiscount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Ödeme tutarı hesaplanamadı.' });
    }

    const userIp = pickClientIp(req);
    const merchantOid = createMerchantOid();
    const userBasket = buildPaytrBasket(normalizedItems);
    const userEmail = normalizeEmail(customer.email);
    const userName = safeString(customer.name, 'Müşteri').slice(0, 60);
    const userPhone = normalizePhone(customer.phone);
    const userAddress = normalizeAddress(shippingAddress || customer.address || 'Türkiye');
    const baseUrl = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://gocmenperde.com.tr');
    const okUrl = safeString(successUrl, `${baseUrl}/?payment=success`);
    const failUrl = safeString(cancelUrl, `${baseUrl}/?payment=cancel`);

    const testMode = process.env.PAYTR_TEST_MODE === '1' ? '1' : '0';
    const debugOn = process.env.NODE_ENV === 'production' ? '0' : '1';
    const noInstallment = '0';
    const maxInstallment = '0';
    const timeoutLimit = '30';
    const paytrCurrency = safeString(currency, 'TL').toUpperCase();

    const hashString =
      merchantId +
      userIp +
      merchantOid +
      userEmail +
      String(paymentAmount) +
      userBasket +
      noInstallment +
      maxInstallment +
      paytrCurrency +
      testMode +
      merchantSalt;
    const paytrToken = crypto.createHmac('sha256', merchantKey).update(hashString).digest('base64');

    const params = new URLSearchParams({
      merchant_id: merchantId,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email: userEmail,
      payment_amount: String(paymentAmount),
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: debugOn,
      test_mode: testMode,
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: userName,
      user_address: userAddress,
      user_phone: userPhone,
      merchant_ok_url: okUrl,
      merchant_fail_url: failUrl,
      timeout_limit: timeoutLimit,
      currency: paytrCurrency,
    });
    console.log('[paytr] outbound:',
      'merchant_oid=', merchantOid,
      'test_mode=', testMode,
      'amount=', paymentAmount,
      'ip=', userIp,
      'body_len=', params.toString().length);

    const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const { payload: result, parseError, rawBody } = await parsePaytrResponse(response);
    if (parseError) {
      console.error('[paytr] parseError:', parseError,
        'http=', response.status,
        'content-type=', response.headers.get('content-type'),
        'raw=', String(rawBody).slice(0, 800));
      return res.status(502).json({
        error: 'PayTR cevabı okunamadı. Lütfen mağaza yöneticisine bildirin.',
        detail: parseError,
        paytr_http_status: response.status,
        paytr_raw_preview: safeString(rawBody).slice(0, 500),
      });
    }

    if (result?.status === 'success' && result?.token) {
      try {
        await insertPending({
          merchant_oid: merchantOid,
          total_amount: paymentAmount,
          paytr_response: result,
          payload: {
            customer: {
              name: userName,
              email: userEmail,
              phone: userPhone,
            },
            shippingAddress: userAddress,
            note: safeString(orderNote),
            payment: 'kredikarti',
            items,
            total: paymentAmount / 100,
            currency: paytrCurrency,
          },
        });
      } catch (dbErr) {
        console.error('insertPending error:', dbErr);
        return res.status(500).json({ error: 'Veritabanı yazılamadı, ödeme başlatılmadı.' });
      }
      return res.status(200).json({
        success: true,
        token: result.token,
        merchant_oid: merchantOid,
        checkout_url: `https://www.paytr.com/odeme/guvenli/${result.token}`,
      });
    }

    const reason = safeString(result?.reason || result?.err_msg || 'PayTR hata döndürdü.');
    return res.status(response.ok ? 400 : 502).json({
      error: `PayTR Reddi: ${reason}`,
      paytr: result || null,
      paytr_http_status: response.status,
    });
  } catch (err) {
    console.error('create-paytr-token error:', err);
    return res.status(500).json({ error: `Ödeme altyapısı hatası: ${safeString(err.message, 'unknown_error')}` });
  }
};
