const { checkRestocks } = require('../../lib/_stock-alert-runner');
const { requireAdmin } = require('../../lib/_admin-auth');
const { pool } = require('../../lib/_db');
const { ensureStockAlertSchema } = require('../../lib/_stock_alerts_schema');
const { ensureStockSnapshotSchema } = require('../../lib/_stock_snapshot_schema');

function mapRow(row) {
  return {
    productId: row.product_id,
    productName: row.product_name,
    email: row.email || '',
    phone: row.phone || '',
    channel: row.channel,
    createdAt: row.created_at,
    notifiedAt: row.notified_at,
    notifiedChannels: Array.isArray(row.notified_channels) ? row.notified_channels : [],
  };
}

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      success: false,
      error: 'Stok uyarı sistemi şu an kullanılamıyor (veritabanı bağlantısı yok). Yöneticinin DATABASE_URL ortam değişkenini ayarlaması gerekiyor.'
    });
  }

  await ensureStockAlertSchema();

  if (req.method === 'GET') {
    const productId = String(req.query?.productId || req.query?.product_id || '').trim();
    const where = productId ? ' WHERE product_id = $1' : '';
    const params = productId ? [productId] : [];
    const counts = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE notified_at IS NULL)::int AS pending
       FROM stock_alerts${where}`,
      params
    );
    const list = await pool.query(
      `SELECT product_id, product_name, email, phone, channel, created_at, notified_at, notified_channels
       FROM stock_alerts${where}
       ORDER BY created_at DESC
       LIMIT 200`,
      params
    );

    return res.status(200).json({
      success: true,
      total: counts.rows[0]?.total || 0,
      pending: counts.rows[0]?.pending || 0,
      items: list.rows.map(mapRow),
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

    if (action === 'reset-snapshot') {
      try {
        await ensureStockSnapshotSchema();
        const fs = require('fs/promises');
        const path = require('path');
        const PRODUCTS_PATH = path.join(__dirname, '..', '..', '..', 'products.json');
        const raw = await fs.readFile(PRODUCTS_PATH, 'utf8').catch(()=>'[]');
        const products = JSON.parse(raw || '[]');

        await pool.query('TRUNCATE stock_snapshot');

        const ids = products.map((p) => String(p?.id || '').trim()).filter(Boolean);
        if (ids.length) {
          const values = ids.map((_, i) => `($${i + 1}, 0, NOW())`).join(',');
          await pool.query(
            `INSERT INTO stock_snapshot(product_id, stock, updated_at) VALUES ${values}`,
            ids
          );
        }

        return res.status(200).json({ success: true, reset: true, count: ids.length });
      } catch (err) {
        console.error('[stock-alerts] reset-snapshot error:', err);
        return res.status(500).json({ success: false, error: 'Snapshot sıfırlanamadı: ' + (err?.message || err) });
      }
    }

    if (action === 'delete') {
      const productId = String(req.body?.productId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const phone = String(req.body?.phone || '').trim();
      if (!productId || (!email && !phone)) {
        return res.status(400).json({ error: 'productId ve (email veya phone) zorunlu' });
      }

      const del = await pool.query(
        `DELETE FROM stock_alerts
         WHERE product_id=$1
           AND ((($2 <> '') AND LOWER(email)=LOWER($2)) OR (($3 <> '') AND phone=$3))`,
        [productId, email, phone]
      );
      return res.status(200).json({ success: true, removed: del.rowCount || 0 });
    }

    return res.status(400).json({ error: 'Geçersiz action' });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
