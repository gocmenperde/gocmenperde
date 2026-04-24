const { pool } = require('../../lib/_db');
const { requireAdmin } = require('../../lib/_admin-auth');
const { ensurePaymentLogosSchema } = require('../../lib/_payment_logos');

function isValidImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return raw.startsWith('https://') || raw.startsWith('/');
}

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      await ensurePaymentLogosSchema();
      const { rows } = await pool.query('SELECT * FROM payment_logos ORDER BY sort_order ASC, id ASC');
      return res.json({ logos: rows });
    }

    if (req.method === 'POST') {
      await ensurePaymentLogosSchema();
      const { name, imageUrl, altText, sortOrder, enabled } = req.body || {};
      const safeName = String(name || '').trim();
      const safeImageUrl = String(imageUrl || '').trim();
      if (!safeName || !safeImageUrl) return res.status(400).json({ error: 'missing' });
      if (!isValidImageUrl(safeImageUrl)) return res.status(400).json({ error: 'invalid_image_url' });

      const { rows } = await pool.query(
        'INSERT INTO payment_logos (name, image_url, alt_text, sort_order, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [safeName, safeImageUrl, String(altText || safeName).trim(), Number(sortOrder) || 0, enabled !== false]
      );
      return res.json({ ok: true, id: rows[0]?.id || null });
    }

    if (req.method === 'PATCH') {
      await ensurePaymentLogosSchema();
      const { id, name, imageUrl, altText, sortOrder, enabled } = req.body || {};
      if (!id) return res.status(400).json({ error: 'missing id' });

      const fields = [];
      const values = [id];
      let idx = 2;

      if (typeof name !== 'undefined') {
        const safeName = String(name || '').trim();
        if (!safeName) return res.status(400).json({ error: 'invalid_name' });
        fields.push(`name = $${idx++}`);
        values.push(safeName);
      }
      if (typeof imageUrl !== 'undefined') {
        const safeImageUrl = String(imageUrl || '').trim();
        if (!isValidImageUrl(safeImageUrl)) return res.status(400).json({ error: 'invalid_image_url' });
        fields.push(`image_url = $${idx++}`);
        values.push(safeImageUrl);
      }
      if (typeof altText !== 'undefined') {
        fields.push(`alt_text = $${idx++}`);
        values.push(String(altText || '').trim());
      }
      if (typeof sortOrder !== 'undefined') {
        fields.push(`sort_order = $${idx++}`);
        values.push(Number(sortOrder) || 0);
      }
      if (typeof enabled !== 'undefined') {
        fields.push(`enabled = $${idx++}`);
        values.push(enabled !== false);
      }

      if (!fields.length) return res.status(400).json({ error: 'no_fields' });

      await pool.query(
        `UPDATE payment_logos SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1`,
        values
      );
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      await ensurePaymentLogosSchema();
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'missing id' });
      await pool.query('DELETE FROM payment_logos WHERE id=$1', [id]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'db', message: e?.message || 'db_error' });
  }
};
