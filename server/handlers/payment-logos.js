const { pool } = require('../lib/_db');
const { ensurePaymentLogosSchema } = require('../lib/_payment_logos');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  try {
    await ensurePaymentLogosSchema();
    const { rows } = await pool.query(
      'SELECT id, name, image_url AS "imageUrl", alt_text AS "altText", sort_order AS "sortOrder" FROM payment_logos WHERE enabled = TRUE ORDER BY sort_order ASC, id ASC'
    );
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.json({ logos: rows });
  } catch (e) {
    res.status(500).json({ error: 'db', logos: [] });
  }
};
