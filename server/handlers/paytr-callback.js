const crypto = require('crypto');
const { getPaytrCredentials } = require('../lib/_paytr-config');
const { notifyAdminError } = require('../lib/_admin-error-notify');
const { getStatus, markPaid, markFailed, setOrderReference } = require('../lib/_paytr-orders');

function normalizeCallbackBody(body) {
  if (!body) return {};

  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    return Object.fromEntries(params.entries());
  }

  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }

  if (typeof body === 'object') {
    return body;
  }

  return {};
}

function safeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function resolveBaseUrl(req) {
  const siteUrl = safeString(process.env.SITE_URL);
  if (siteUrl) return siteUrl;
  const host = safeString(req.headers['x-forwarded-host'] || req.headers.host);
  const proto = safeString(req.headers['x-forwarded-proto'], 'https');
  if (host) return `${proto}://${host}`;
  if (safeString(process.env.VERCEL_URL)) return `https://${safeString(process.env.VERCEL_URL)}`;
  return 'http://127.0.0.1:3000';
}

async function createOrderViaInternalApi(req, payload = {}) {
  const baseUrl = resolveBaseUrl(req);
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/orders?action=create`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-paytr-callback': '1',
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.error || `order-create-failed-http-${response.status}`);
  }
  return json;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('METHOD_NOT_ALLOWED');
  }

  const { merchantKey, merchantSalt, hasRequiredCredentials } = getPaytrCredentials();

  if (!hasRequiredCredentials) {
    return res.status(500).send('ENV_MISSING');
  }

  try {
    const callback = normalizeCallbackBody(req.body);

    if (!callback.merchant_oid || !callback.status || !callback.total_amount || !callback.hash) {
      return res.status(400).send('BAD_REQUEST');
    }

    const raw = `${callback.merchant_oid || ''}${merchantSalt}${callback.status || ''}${callback.total_amount || ''}`;
    const token = crypto.createHmac('sha256', merchantKey).update(raw).digest('base64');

    if (token !== callback.hash) {
      return res.status(400).send('INVALID_HASH');
    }

    const merchantOid = safeString(callback.merchant_oid);
    const existing = await getStatus(merchantOid);

    if (!existing) {
      await notifyAdminError('paytr-callback-missing-order', new Error(`merchant_oid not found: ${merchantOid}`));
      return res.status(200).send('OK');
    }

    if (existing.status === 'paid' || ['failed', 'cancelled', 'expired'].includes(existing.status)) {
      return res.status(200).send('OK');
    }

    if (safeString(callback.status).toLowerCase() === 'success') {
      const paidRecord = await markPaid({
        merchant_oid: merchantOid,
        paytr_response: callback,
      });

      if (!paidRecord?.order_id) {
        const payload = paidRecord?.payload || {};
        const orderPayload = {
          name: safeString(payload?.customer?.name, 'Müşteri'),
          phone: safeString(payload?.customer?.phone),
          email: safeString(payload?.customer?.email),
          address: safeString(payload?.shippingAddress),
          note: safeString(payload?.note),
          payment: 'kredikarti',
          items: Array.isArray(payload?.items) ? payload.items : [],
          total: Number(payload?.total || 0),
        };
        const created = await createOrderViaInternalApi(req, orderPayload);
        await setOrderReference({ merchant_oid: merchantOid, order_id: created.order_no || created.order_id });
      }

      return res.status(200).send('OK');
    }

    await markFailed({
      merchant_oid: merchantOid,
      status: 'failed',
      paytr_response: callback,
    });

    return res.status(200).send('OK');
  } catch (err) {
    console.error('PAYTR callback error:', err.message);
    await notifyAdminError('paytr-callback', err);
    return res.status(200).send('OK');
  }
};
