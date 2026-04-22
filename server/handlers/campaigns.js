const { pool } = require('../lib/_db');
const { ensureCampaignsSchema, mapCampaignRow } = require('../lib/_campaigns');

const { applyCors } = require('../lib/_cors');
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Desteklenmeyen method.' });

  try {
    await ensureCampaignsSchema();
    const includeInactive = String(req.query?.includeInactive || '').toLowerCase() === '1';
    const today = new Date().toISOString().slice(0, 10);

    const query = includeInactive
      ? `SELECT id, name, description, image_url AS "imageUrl", discount_type AS "discountType", discount_value AS "discountValue",
                coupon_code AS "couponCode", start_date::text AS "startDate", end_date::text AS "endDate",
                target_path AS "targetPath", button_label AS "buttonLabel", sort_order AS "sortOrder", is_active AS "isActive",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM campaigns
         ORDER BY sort_order ASC, id DESC`
      : `SELECT id, name, description, image_url AS "imageUrl", discount_type AS "discountType", discount_value AS "discountValue",
                coupon_code AS "couponCode", start_date::text AS "startDate", end_date::text AS "endDate",
                target_path AS "targetPath", button_label AS "buttonLabel", sort_order AS "sortOrder", is_active AS "isActive",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM campaigns
         WHERE is_active = TRUE
           AND (start_date IS NULL OR start_date <= $1::date)
           AND (end_date IS NULL OR end_date >= $1::date)
         ORDER BY sort_order ASC, id DESC`;

    const result = includeInactive
      ? await pool.query(query)
      : await pool.query(query, [today]);

    return res.status(200).json({ success: true, items: result.rows.map(mapCampaignRow), date: today });
  } catch (err) {
    console.error('campaigns public error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};