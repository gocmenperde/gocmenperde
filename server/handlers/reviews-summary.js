const { pool } = require('../lib/_db');
const { ensureReviewSchema } = require('../lib/_reviews_schema');
const { applyCors } = require('../lib/_cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  await ensureReviewSchema();
  const productId = String(req.query?.productId || '').trim();
  if (productId) {
    const { ensureSeedsForProduct } = require('../lib/_seed-reviews');
    ensureSeedsForProduct(productId)
      .catch((e) => console.warn('[lazy-seed-summary]', productId, e?.message));
  }
  const r = await pool.query(
    `SELECT
       base.product_id,
       base.total,
       base.avg,
       latest.id AS latest_review_id,
       latest.name AS latest_review_name,
       latest.text AS latest_review_text,
       latest.rating AS latest_review_rating,
       latest.created_at AS latest_review_created_at,
       latest.verified_purchase AS latest_review_verified_purchase,
       latest.source AS latest_review_source
     FROM (
       SELECT product_id, COUNT(*)::int AS total, COALESCE(AVG(rating),0)::float AS avg
       FROM product_reviews
       WHERE status='approved'
       GROUP BY product_id
     ) AS base
     LEFT JOIN LATERAL (
       SELECT id, name, text, rating, created_at, verified_purchase, source
       FROM product_reviews
       WHERE status='approved' AND product_id = base.product_id
       ORDER BY verified_purchase DESC, created_at DESC
       LIMIT 1
     ) AS latest ON TRUE`
  );
  const map = {};
  for (const row of r.rows) {
    map[row.product_id] = {
      total: row.total,
      avg: Math.round(row.avg * 10) / 10,
      sampleReview: row.latest_review_id ? {
        id: row.latest_review_id,
        name: row.latest_review_name,
        text: row.latest_review_text,
        rating: row.latest_review_rating,
        createdAt: row.latest_review_created_at,
        verifiedPurchase: !!row.latest_review_verified_purchase,
        source: row.latest_review_source || 'user',
      } : null
    };
  }
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
  return res.status(200).json({ success: true, summary: map });
};
