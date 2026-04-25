const { pool } = require('../lib/_db');
const { ensurePaymentLogosSchema } = require('../lib/_payment_logos');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  try {
    await ensurePaymentLogosSchema();
    const { rows } = await pool.query(
      'SELECT id, name, image_url AS "imageUrl", alt_text AS "altText", sort_order AS "sortOrder" FROM payment_logos WHERE enabled = TRUE ORDER BY sort_order ASC, id ASC'
    );
    // Vercel Edge CDN cache KAPALI: admin yeni logo ekleyince anlık görünmeli.
    // Edge cache açık olunca 10 dk gecikme oluyordu.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.json({ logos: rows });
  } catch (e) {
    console.error('[payment-logos]', e?.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: 'db', logos: [] });
  }
};
