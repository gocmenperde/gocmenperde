const fs = require('fs/promises');
const path = require('path');
const { sendResendEmail, normalizeEmail } = require('../lib/_resend-mail');

const FILE_PATH = path.join(__dirname, '..', 'data', 'stock-alerts.json');

async function readAlerts() {
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[gp:warn]', err);
    return [];
  }
}

async function writeAlerts(alerts) {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(alerts, null, 2), 'utf8');
}

async function sendTransactionalEmail({ to, subject, html }) {
  return sendResendEmail({ to, subject, html });
}

module.exports = async function handler(req, res) {
  if (req.method === 'POST') {
    const action = String(req.body?.action || '').trim();

    if (action === 'subscribe') {
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

      return res.status(200).json({ success: true, alreadyExists: exists });
    }

    if (action === 'notify') {
      const productId = String(req.body?.productId || '').trim();
      const productName = String(req.body?.productName || '').trim();
      const stock = Number(req.body?.stock || 0);
      if (!productId || !productName || !Number.isFinite(stock) || stock <= 0) {
        return res.status(400).json({ error: 'productId, productName ve 0\'dan büyük stock zorunludur.' });
      }

      const alerts = await readAlerts();
      const pending = alerts.filter((item) => String(item.productId) === productId && !item.notifiedAt);

      let sent = 0;
      let failed = 0;
      const nowIso = new Date().toISOString();
      for (const item of pending) {
        const emailResult = await sendTransactionalEmail({
          to: item.email,
          subject: `${productName} tekrar stokta`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2 style="margin:0 0 12px">Merhaba 👋</h2>
            <p>Takip ettiğiniz <strong>${productName}</strong> ürünü yeniden stokta.</p>
            <p>Mevcut stok: <strong>${stock}</strong></p>
            <p>Ürünü kaçırmamak için hemen ziyaret edebilirsiniz.</p>
          </div>`,
        });

        if (emailResult.ok) {
          item.notifiedAt = nowIso;
          sent += 1;
        } else {
          failed += 1;
        }
      }

      await writeAlerts(alerts);
      return res.status(200).json({ success: true, sent, failed, totalPending: pending.length });
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
