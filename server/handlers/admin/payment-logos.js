const { pool } = require('../../lib/_db');
const { requireAdmin } = require('../../lib/_admin-auth');
const { ensurePaymentLogosSchema } = require('../../lib/_payment_logos');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    await ensurePaymentLogosSchema();
    if (req.method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM payment_logos ORDER BY sort_order ASC, id ASC');
      return res.json({ logos: rows });
    }
    if (req.method === 'POST') {
      const { name, imageUrl, altText, sortOrder, enabled } = req.body || {};
      if (!name || !imageUrl) return res.status(400).json({ error: 'missing' });
      const { rows } = await pool.query(
        'INSERT INTO payment_logos (name, image_url, alt_text, sort_order, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [name, imageUrl, altText || name, sortOrder || 0, enabled !== false]
      );
      return res.json({ logo: rows[0] });
    }
    if (req.method === 'PATCH') {
      const { id, name, imageUrl, altText, sortOrder, enabled } = req.body || {};
      if (!id) return res.status(400).json({ error: 'missing id' });
      const { rows } = await pool.query(
        `UPDATE payment_logos SET
           name=COALESCE($2,name), image_url=COALESCE($3,image_url),
           alt_text=COALESCE($4,alt_text), sort_order=COALESCE($5,sort_order),
           enabled=COALESCE($6,enabled), updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [id, name, imageUrl, altText, sortOrder, enabled]
      );
      return res.json({ logo: rows[0] });
    }
    if (req.method === 'DELETE') {
      const { id } = req.query || req.body || {};
      if (!id) return res.status(400).json({ error: 'missing id' });
      await pool.query('DELETE FROM payment_logos WHERE id=$1', [id]);
      return res.json({ ok: true });
    }
    res.status(405).json({ error: 'method' });
  } catch (e) {
    res.status(500).json({ error: 'db' });
  }
};
