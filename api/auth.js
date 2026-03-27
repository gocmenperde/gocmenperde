const { Pool } = require('pg');

// Bağlantı dizesini en temiz haliyle buraya yazdım
const connectionString = 'psql -h pg.neon.tech';

const pool = new Pool({
  connectionString,
  max: 1, // Ücretsiz paket için bağlantı sınırını düşük tutalım
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export default async function handler(req, res) {
  // CORS ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Yalnızca POST' });

  const { action, ad_soyad, email, telefon, sifre } = req.body;

  try {
    if (action === 'register') {
      const result = await pool.query(
        'INSERT INTO musteriler (ad_soyad, email, telefon, sifre_hash) VALUES ($1, $2, $3, $4) RETURNING id, ad_soyad',
        [ad_soyad, email, telefon, sifre]
      );
      return res.status(200).json({ success: true, user: result.rows[0] });
    }
    return res.status(400).json({ error: 'İşlem belirtilmedi' });
  } catch (error) {
    // Hatayı Vercel loglarında görmek için
    console.error('DATABASE_ERROR:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
