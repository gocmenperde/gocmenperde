const { pool } = require('../lib/_db');
const { ensureMeasureGuideSchema, mapGuideRow } = require('../lib/_measure_guide');

const { applyCors } = require('../lib/_cors');
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Desteklenmeyen method.' });

  try {
    await ensureMeasureGuideSchema();
    const result = await pool.query(
      `SELECT title, content_html, images, updated_at
       FROM measure_guide
       WHERE id = 1
       LIMIT 1`
    );

    const row = result.rows[0] || null;
    return res.status(200).json({ success: true, item: mapGuideRow(row || {}) });
  } catch (err) {
    console.error('measure guide public error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};