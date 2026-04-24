const { pool } = require('../../lib/_db');
const { ensureFromYouShowcaseSchema, normalizeFromYouItem } = require('../../lib/_from_you_showcase');

const { requireAdmin } = require('../../lib/_admin-auth');

const { applyCors } = require('../../lib/_cors');
module.exports = async function handler(req, res) {
  if (applyCors(req, res, { allowAdminHeaders: true })) return;

  if (!requireAdmin(req, res)) return;

  try {
    await ensureFromYouShowcaseSchema();

    if (req.method === 'GET') {
      const result = await pool.query(`
        SELECT src, images, title, location, note, comment, author, is_active AS "isActive"
        FROM from_you_showcase
        ORDER BY order_no ASC, id DESC
        LIMIT 50
      `);
      return res.status(200).json({ success: true, items: result.rows });
    }

    if (req.method === 'PUT') {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const normalized = items
        .map((item, idx) => normalizeFromYouItem(item, idx))
        .filter(Boolean)
        .slice(0, 30);

      await pool.query('BEGIN');
      try {
        await pool.query('DELETE FROM from_you_showcase');
        for (const item of normalized) {
          await pool.query(
            `INSERT INTO from_you_showcase (src, images, title, location, note, comment, author, order_no, is_active)
             VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9)`,
            [
              item.src,
              JSON.stringify(item.images),
              item.title,
              item.location,
              item.note,
              item.comment,
              item.author,
              item.orderNo,
              item.isActive,
            ]
          );
        }
        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }

      return res.status(200).json({ success: true, count: normalized.length });
    }

    return res.status(405).json({ error: 'Desteklenmeyen method.' });
  } catch (err) {
    console.error('from-you-showcase admin error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};