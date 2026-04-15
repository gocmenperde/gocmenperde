const { pool } = require('../../lib/_db');
const { ensureCampaignsSchema, normalizeCampaignPayload, mapCampaignRow } = require('../../lib/_campaigns');
const { requireAdminKey } = require('../../lib/_admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!requireAdminKey(req, res)) return;

  try {
    await ensureCampaignsSchema();

    if (req.method === 'GET') {
      const result = await pool.query(`
        SELECT id, name, description, image_url AS "imageUrl", discount_type AS "discountType", discount_value AS "discountValue",
               coupon_code AS "couponCode", start_date::text AS "startDate", end_date::text AS "endDate",
               target_path AS "targetPath", button_label AS "buttonLabel", sort_order AS "sortOrder", is_active AS "isActive",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM campaigns
        ORDER BY sort_order ASC, id DESC
      `);
      return res.status(200).json({ success: true, items: result.rows.map(mapCampaignRow) });
    }

    if (req.method === 'POST') {
      const parsed = normalizeCampaignPayload(req.body || {});
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });

      const result = await pool.query(
        `INSERT INTO campaigns (name, description, image_url, discount_type, discount_value, coupon_code, start_date, end_date, target_path, button_label, sort_order, is_active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, NOW())
         RETURNING id, name, description, image_url AS "imageUrl", discount_type AS "discountType", discount_value AS "discountValue",
                   coupon_code AS "couponCode", start_date::text AS "startDate", end_date::text AS "endDate",
                   target_path AS "targetPath", button_label AS "buttonLabel", sort_order AS "sortOrder", is_active AS "isActive",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          parsed.value.name,
          parsed.value.description,
          parsed.value.imageUrl,
          parsed.value.discountType,
          parsed.value.discountValue,
          parsed.value.couponCode,
          parsed.value.startDate,
          parsed.value.endDate,
          parsed.value.targetPath,
          parsed.value.buttonLabel,
          parsed.value.sortOrder,
          parsed.value.isActive,
        ]
      );

      return res.status(201).json({ success: true, item: mapCampaignRow(result.rows[0]) });
    }

    if (req.method === 'PUT') {
      const id = Number(req.query.id || req.body?.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Geçersiz id.' });

      const parsed = normalizeCampaignPayload(req.body || {});
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });

      const result = await pool.query(
        `UPDATE campaigns
         SET name=$1, description=$2, image_url=$3, discount_type=$4, discount_value=$5, coupon_code=$6,
             start_date=$7::date, end_date=$8::date, target_path=$9, button_label=$10, sort_order=$11, is_active=$12, updated_at=NOW()
         WHERE id=$13
         RETURNING id, name, description, image_url AS "imageUrl", discount_type AS "discountType", discount_value AS "discountValue",
                   coupon_code AS "couponCode", start_date::text AS "startDate", end_date::text AS "endDate",
                   target_path AS "targetPath", button_label AS "buttonLabel", sort_order AS "sortOrder", is_active AS "isActive",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          parsed.value.name,
          parsed.value.description,
          parsed.value.imageUrl,
          parsed.value.discountType,
          parsed.value.discountValue,
          parsed.value.couponCode,
          parsed.value.startDate,
          parsed.value.endDate,
          parsed.value.targetPath,
          parsed.value.buttonLabel,
          parsed.value.sortOrder,
          parsed.value.isActive,
          id,
        ]
      );

      if (!result.rows.length) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
      return res.status(200).json({ success: true, item: mapCampaignRow(result.rows[0]) });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id || req.body?.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Geçersiz id.' });
      const result = await pool.query('DELETE FROM campaigns WHERE id = $1 RETURNING id', [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Desteklenmeyen method.' });
  } catch (err) {
    console.error('campaigns admin error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};
