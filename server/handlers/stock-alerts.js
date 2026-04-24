const fs = require('fs/promises');
const path = require('path');
const { sendResendEmail, normalizeEmail } = require('../lib/_resend-mail');

const FILE_PATH = path.join(__dirname, '..', 'data', 'stock-alerts.json');
const _rateMap = new Map();

function rateOk(ip) {
  const now = Date.now();
  const arr = (_rateMap.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 10) return false;
  arr.push(now);
  _rateMap.set(ip, arr);
  return true;
}

async function readAlerts() {
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeAlerts(alerts) {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(alerts, null, 2), 'utf8');
}

module.exports = async function handler(req, res) {
  if (req.method === 'POST') {
    const action = String(req.body?.action || '').trim();

    if (action === 'subscribe') {
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown';
      if (!rateOk(String(ip).split(',')[0].trim())) {
        return res.status(429).json({ error: 'Çok fazla istek. Lütfen biraz bekleyin.' });
      }

      const productId = String(req.body?.productId || '').trim();
      const productName = String(req.body?.productName || '').trim();
      const email = normalizeEmail(req.body?.email || '');

      if (!productId || !productName || !email) {
        return res.status(400).json({ error: 'productId, productName ve geçerli email zorunludur.' });
      }

      const alerts = await readAlerts();
      const exists = alerts.some(
        (item) => String(item.productId) === productId && String(item.email).toLowerCase() === email
      );

      if (!exists) {
        alerts.push({
          productId,
          productName,
          email,
          createdAt: new Date().toISOString(),
          notifiedAt: null,
        });
        await writeAlerts(alerts);
      }

      await sendResendEmail({
        to: email,
        subject: `${productName} stok bildirimi kaydınız alındı`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:520px">
          <h2 style="margin:0 0 12px;color:#a3823f">Kaydınız alındı ✅</h2>
          <p><strong>${productName}</strong> ürününün stok bildirimi için aboneliğiniz oluşturuldu.</p>
          <p>Ürün tekrar stokta olduğunda bu adrese tek seferlik bilgilendirme e-postası göndereceğiz.</p>
          <p style="font-size:.85rem;color:#666">Bu e-posta bilgi amaçlıdır.</p>
        </div>`,
      }).catch(() => null);

      return res.status(200).json({ success: true, alreadyExists: exists });
    }

    return res.status(400).json({ error: 'Geçersiz action.' });
  }

  if (req.method === 'GET') {
    const productId = String(req.query?.productId || '').trim();
    const alerts = await readAlerts();
    const pending = productId
      ? alerts.filter((item) => String(item.productId) === productId && !item.notifiedAt)
      : alerts.filter((item) => !item.notifiedAt);

    return res.status(200).json({ success: true, pendingCount: pending.length });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
