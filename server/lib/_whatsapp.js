const ENDPOINT_BASE = 'https://graph.facebook.com/v20.0';

function isConfigured() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function sendStockBackTemplate({ to, productName, stock, productUrl }) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: 'whatsapp-not-configured' };
  }

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'gocmen_stock_back';
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'tr';
  const url = `${ENDPOINT_BASE}/${phoneId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: String(to || '').replace(/^\+/, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(productName).slice(0, 120) },
            { type: 'text', text: String(stock) },
            { type: 'text', text: String(productUrl).slice(0, 200) },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: json?.error?.message || 'send-failed' };
    }
    return { ok: true, id: json?.messages?.[0]?.id || null };
  } catch (err) {
    return { ok: false, error: err?.message || 'network-failed' };
  }
}

module.exports = { isConfigured, sendStockBackTemplate };
