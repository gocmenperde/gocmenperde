const { pool } = require('../../lib/_db');
const { ensureMeasureGuideSchema, normalizeGuidePayload, mapGuideRow } = require('../../lib/_measure_guide');

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

const { applyCors } = require('../../lib/_cors');
module.exports = async function handler(req, res) {
  if (applyCors(req, res, { allowAdminHeaders: true })) return;

  if (!ADMIN_API_KEY || req.headers['x-admin-key'] !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Yetkisiz.' });
  }

  try {
    await ensureMeasureGuideSchema();

    if (req.method === 'GET') {
      const result = await pool.query(
        `SELECT title, content_html, images, updated_at
         FROM measure_guide
         WHERE id = 1
         LIMIT 1`
      );
      return res.status(200).json({ success: true, item: mapGuideRow(result.rows[0] || {}) });
    }

    if (req.method === 'PUT') {
      const parsed = normalizeGuidePayload(req.body || {});
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });

      const result = await pool.query(
        `UPDATE measure_guide
         SET title = $1,
             content_html = $2,
             images = $3::jsonb,
             updated_at = NOW()
         WHERE id = 1
         RETURNING title, content_html, images, updated_at`,
        [parsed.value.title, parsed.value.contentHtml, JSON.stringify(parsed.value.images)]
      );

      return res.status(200).json({ success: true, item: mapGuideRow(result.rows[0] || parsed.value) });
    }

    return res.status(405).json({ error: 'Desteklenmeyen method.' });
  } catch (err) {
    console.error('measure guide admin error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};