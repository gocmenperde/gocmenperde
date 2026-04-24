const { pool } = require('../lib/_db');
const { ensureReviewSchema } = require('../lib/_reviews_schema');
const { applyCors } = require('../lib/_cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  await ensureReviewSchema();
  const r = await pool.query(
    `SELECT product_id, COUNT(*)::int AS total, COALESCE(AVG(rating),0)::float AS avg
     FROM product_reviews WHERE status='approved'
     GROUP BY product_id`
  );
  const map = {};
  for (const row of r.rows) {
    map[row.product_id] = { total: row.total, avg: Math.round(row.avg * 10) / 10 };
  }
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
  return res.status(200).json({ success: true, summary: map });
};
