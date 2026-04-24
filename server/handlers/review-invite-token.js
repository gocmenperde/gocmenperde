const { pool } = require('../lib/_db');
const { ensureReviewSchema } = require('../lib/_reviews_schema');
const { applyCors } = require('../lib/_cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  await ensureReviewSchema();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = String(req.query?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'token zorunlu' });

  const row = await pool.query(
    'SELECT product_id, product_name, email, used_at FROM review_invites WHERE token=$1 LIMIT 1',
    [token]
  );
  if (!row.rows.length) return res.status(404).json({ error: 'Davet bulunamadı' });

  const item = row.rows[0];
  return res.status(200).json({
    success: true,
    productId: item.product_id,
    productName: item.product_name,
    email: item.email,
    alreadyUsed: !!item.used_at,
  });
};
