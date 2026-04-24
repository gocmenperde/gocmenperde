const { checkRestocks } = require('../../lib/_stock-alert-runner');
const { requireAdmin } = require('../../lib/_admin-auth');
const { pool } = require('../../lib/_db');
const { ensureStockAlertSchema } = require('../../lib/_stock_alerts_schema');

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
  await ensureStockAlertSchema();

  if (req.method === 'GET') {
    const productId = String(req.query?.productId || '').trim();
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
