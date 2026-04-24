const { checkRestocks } = require('../../lib/_stock-alert-runner');
const fs = require('fs/promises');
const path = require('path');

const ALERTS_PATH = path.join(__dirname, '..', '..', 'data', 'stock-alerts.json');

function isAdmin(req) {
  const token = req.headers['x-admin-token'] || req.body?.adminToken || req.query?.adminToken;
  const expected = process.env.ADMIN_TOKEN || '';
  return expected && token === expected;
}

module.exports = async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Yetkisiz erişim' });

  if (req.method === 'GET') {
    const raw = await fs.readFile(ALERTS_PATH, 'utf8').catch(() => '[]');
    const alerts = JSON.parse(raw);
    const pending = alerts.filter((a) => !a.notifiedAt);
    return res.status(200).json({
      success: true,
      total: alerts.length,
      pending: pending.length,
      items: alerts.slice(-200).reverse(),
    });
  }

  if (req.method === 'POST') {
    const action = String(req.body?.action || '').trim();

    if (action === 'check-now') {
      const result = await checkRestocks();
      return res.status(200).json({ success: true, ...result });
    }

    if (action === 'dry-run') {
      const result = await checkRestocks({ dryRun: true });
      return res.status(200).json({ success: true, ...result });
    }

    if (action === 'delete') {
      const productId = String(req.body?.productId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const phone = String(req.body?.phone || '').trim();
      if (!productId || (!email && !phone)) {
        return res.status(400).json({ error: 'productId ve (email veya phone) zorunlu' });
      }

      const raw = await fs.readFile(ALERTS_PATH, 'utf8').catch(() => '[]');
      const alerts = JSON.parse(raw);
      const next = alerts.filter(
        (a) =>
          !(
            String(a.productId) === productId &&
            ((email && String(a.email || '').toLowerCase() === email) ||
              (phone && String(a.phone || '') === phone))
          )
      );
      await fs.writeFile(ALERTS_PATH, JSON.stringify(next, null, 2), 'utf8');
      return res.status(200).json({ success: true, removed: alerts.length - next.length });
    }

    return res.status(400).json({ error: 'Geçersiz action' });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
