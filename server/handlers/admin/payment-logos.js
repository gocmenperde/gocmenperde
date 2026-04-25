const { pool } = require('../../lib/_db');
const { ensurePaymentLogosSchema } = require('../../lib/_payment_logos');
const { requireAdmin } = require('../../lib/_admin-auth');
const { applyCors } = require('../../lib/_cors');

function isValidImageUrl(value) {
  const raw = String(value || '').trim();
  return /^(https?:\/\/|\/)/.test(raw);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, { allowAdminHeaders: true })) return;

  if (!requireAdmin(req, res)) return;
  // Admin response'ları HİÇBİR yerde cache'lenmesin.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  try {
    await ensurePaymentLogosSchema();

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT id,
                name,
                image_url AS "imageUrl",
                alt_text AS "altText",
                sort_order AS "sortOrder",
                enabled
         FROM payment_logos
         ORDER BY sort_order ASC, id ASC`
      );
      return res.status(200).json({ logos: rows });
    }

    if (req.method === 'POST') {
      const { name, imageUrl, altText, sortOrder, enabled } = req.body || {};
      const safeName = String(name || '').trim();
      const safeImageUrl = String(imageUrl || '').trim();

      if (!safeName || !safeImageUrl) {
        return res.status(400).json({ error: 'name ve imageUrl zorunlu' });
      }
      if (!isValidImageUrl(safeImageUrl)) {
        return res.status(400).json({ error: 'Geçersiz imageUrl' });
      }

      const ins = await pool.query(
        `INSERT INTO payment_logos (name, image_url, alt_text, sort_order, enabled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [safeName, safeImageUrl, String(altText || safeName).trim(), Number(sortOrder) || 0, enabled !== false]
      );

      return res.status(200).json({ ok: true, id: ins.rows[0].id });
    }

    if (req.method === 'PATCH') {
      const { id, name, imageUrl, altText, sortOrder, enabled } = req.body || {};
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return res.status(400).json({ error: 'id zorunlu' });
      }

      const sets = [];
      const vals = [];
      let i = 1;

      if (name !== undefined) {
        const safeName = String(name || '').trim();
        if (!safeName) return res.status(400).json({ error: 'Geçersiz name' });
        sets.push(`name = $${i++}`);
        vals.push(safeName);
      }
      if (imageUrl !== undefined) {
        const safeImageUrl = String(imageUrl || '').trim();
        if (!isValidImageUrl(safeImageUrl)) {
          return res.status(400).json({ error: 'Geçersiz imageUrl' });
        }
        sets.push(`image_url = $${i++}`);
        vals.push(safeImageUrl);
      }
      if (altText !== undefined) {
        sets.push(`alt_text = $${i++}`);
        vals.push(String(altText || '').trim());
      }
      if (sortOrder !== undefined) {
        sets.push(`sort_order = $${i++}`);
        vals.push(Number(sortOrder) || 0);
      }
      if (enabled !== undefined) {
        sets.push(`enabled = $${i++}`);
        vals.push(Boolean(enabled));
      }

      if (!sets.length) return res.status(200).json({ ok: true });

      sets.push('updated_at = NOW()');
      vals.push(numericId);
      await pool.query(`UPDATE payment_logos SET ${sets.join(', ')} WHERE id = $${i}`, vals);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query?.id || req.body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'id zorunlu' });
      }

      await pool.query('DELETE FROM payment_logos WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method' });
  } catch (e) {
    console.error('[admin/payment-logos]', e);
    return res.status(500).json({ error: 'db', message: e?.message || 'unknown' });
  }
};
