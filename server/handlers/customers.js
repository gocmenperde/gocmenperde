const { pool } = require('../lib/_db');
const { requireAdmin } = require('../lib/_admin-auth');

const { applyCors } = require('../lib/_cors');
module.exports = async function handler(req, res) {
  if (applyCors(req, res, { allowAdminHeaders: true })) return;

  if (!requireAdmin(req, res)) return;

  const { action } = req.query;

  try {
    if (action === 'all' && req.method === 'GET') {
      const result = await pool.query(`
        SELECT
          m.id,
          m.ad_soyad AS ad,
          m.email,
          COALESCE(NULLIF(m.telefon, ''), '-') AS telefon,
          m.created_at,
          COALESCE(COUNT(s.id), 0)::int AS siparis_sayisi,
          COALESCE(SUM(s.toplam), 0)::numeric AS toplam_harcama
        FROM musteriler m
        LEFT JOIN siparisler s ON s.musteri_id = m.id
        GROUP BY m.id, m.ad_soyad, m.email, m.telefon, m.created_at
        ORDER BY m.created_at DESC
      `);

      const customers = result.rows.map((row) => ({
        ...row,
        toplam_harcama: Number(row.toplam_harcama) || 0,
      }));

      return res.status(200).json({ success: true, customers });
    }

    return res.status(400).json({ error: 'Geçersiz işlem.' });
  } catch (err) {
    console.error('Customers error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};
