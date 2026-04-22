const { pool } = require('../lib/_db');
const { ensureFromYouShowcaseSchema } = require('../lib/_from_you_showcase');

const { applyCors } = require('../lib/_cors');
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Desteklenmeyen method.' });

  try {
    await ensureFromYouShowcaseSchema();
    const result = await pool.query(`
      SELECT src, images, title, location, note, comment, author
      FROM from_you_showcase
      WHERE is_active = TRUE
      ORDER BY order_no ASC, id DESC
      LIMIT 30
    `);
    return res.status(200).json({ success: true, items: result.rows });
  } catch (err) {
    console.error('from-you-showcase public error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};