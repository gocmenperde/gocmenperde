const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });

  const { action, ad_soyad, email, telefon, sifre } = req.body;

  try {
    if (action === 'register') {
      const result = await pool.query(
        'INSERT INTO musteriler (ad_soyad, email, telefon, sifre_hash) VALUES ($1, $2, $3, $4) RETURNING id',
        [ad_soyad, email, telefon, sifre]
      );
      return res.status(200).json({ success: true });
    }
    
    if (action === 'login') {
      const result = await pool.query(
        'SELECT * FROM musteriler WHERE email = $1 AND sifre_hash = $2',
        [email, sifre]
      );
      if (result.rows.length > 0) {
        return res.status(200).json({ success: true, user: result.rows[0] });
      }
      return res.status(401).json({ success: false, error: 'E-posta veya şifre hatalı!' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
