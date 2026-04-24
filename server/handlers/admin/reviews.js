const fs = require('fs/promises');
const path = require('path');
const { requireAdmin } = require('../../lib/_admin-auth');
const { pool } = require('../../lib/_db');
const { ensureReviewSchema } = require('../../lib/_reviews_schema');
const { applyCors } = require('../../lib/_cors');

async function safeDeletePhotoByUrl(url) {
  const rel = String(url || '').trim();
  if (!rel.startsWith('/uploads/reviews/')) return;
  const filePath = path.join(__dirname, '..', '..', '..', 'public', rel.replace(/^\/uploads\//, 'uploads/'));
  await fs.unlink(filePath).catch(() => {});
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, { allowAdminHeaders: true })) return;
  if (!requireAdmin(req, res)) return;
  await ensureReviewSchema();

  if (req.method === 'GET') {
    const status = String(req.query?.status || 'pending').trim();
    const valid = new Set(['pending', 'approved', 'rejected', 'all']);
    if (!valid.has(status)) return res.status(400).json({ error: 'status geçersiz' });
    const where = status === 'all' ? '' : 'WHERE status=$1';
    const params = status === 'all' ? [] : [status];
    const list = await pool.query(
      `SELECT id, product_id, name, rating, text, photos, verified_purchase, order_id, status, helpful_count, is_seed, source, ip_hash, created_at, moderated_at
       FROM product_reviews ${where}
       ORDER BY created_at DESC
       LIMIT 100`,
      params
    );
    return res.status(200).json({ success: true, items: list.rows });
  }

  if (req.method === 'POST') {
    const action = String(req.body?.action || '').trim();

    if (!action) return res.status(200).json({ success: true });

    if (action === 'seed-all') {
      const { ensureSeedsForAllProducts } = require('../../lib/_seed-reviews');
      const r = await ensureSeedsForAllProducts();
      return res.status(200).json({ success: true, ...r, lastError: r.lastError || null });
    }

    if (action === 'regenerate-seeds') {
      const productId = String(req.body?.productId || '').trim();
      if (!productId) return res.status(400).json({ error: 'productId zorunlu' });
      const { regenerateSeedsForProduct } = require('../../lib/_seed-reviews');
      const r = await regenerateSeedsForProduct(productId);
      return res.status(200).json({ success: true, ...r });
    }

    const id = Number(req.body?.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id geçersiz' });

    if (action === 'approve') {
      await pool.query("UPDATE product_reviews SET status='approved', moderated_at=NOW() WHERE id=$1", [id]);
      return res.status(200).json({ success: true });
    }

    if (action === 'reject') {
      await pool.query("UPDATE product_reviews SET status='rejected', moderated_at=NOW() WHERE id=$1", [id]);
      return res.status(200).json({ success: true });
    }

    if (action === 'delete') {
      const review = await pool.query('SELECT photos FROM product_reviews WHERE id=$1 LIMIT 1', [id]);
      const photos = Array.isArray(review.rows[0]?.photos) ? review.rows[0].photos : [];
      for (const p of photos) {
        await safeDeletePhotoByUrl(p);
      }
      await pool.query('DELETE FROM product_reviews WHERE id=$1', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Geçersiz action' });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
