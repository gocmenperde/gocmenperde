const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = (strings, ...values) => {
  let text = '';
  strings.forEach((s, i) => { text += s + (values[i] !== undefined ? `$${i+1}` : ''); });
  return pool.query(text, values).then(r => r.rows);
};

module.exports = async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, POST, PUT, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type, Authorization’);
if (req.method === ‘OPTIONS’) return res.status(200).end();

const { action } = req.query;

let sql;
try {
sql = neon(process.env.DATABASE_URL);
} catch(e) {
return res.status(500).json({ error: ’DB bağlantı hatası: ’ + e.message });
}

try {
// KAYIT
if (action === ‘register’ && req.method === ‘POST’) {
const { ad_soyad, email, telefon, sifre } = req.body;
if (!ad_soyad || !email || !sifre)
return res.status(400).json({ error: ‘Ad soyad, email ve şifre zorunludur.’ });
if (sifre.length < 6)
return res.status(400).json({ error: ‘Şifre en az 6 karakter olmalıdır.’ });

```
  const existing = await sql`SELECT id FROM musteriler WHERE email = ${email.toLowerCase()}`;
  if (existing.length > 0)
    return res.status(409).json({ error: 'Bu email zaten kayıtlı.' });

  // Basit hash (crypto modülü - harici paket gerektirmez)
  const crypto = require('crypto');
  const sifre_hash = crypto.createHash('sha256').update(sifre + 'gocmen_salt_2024').digest('hex');

  const result = await sql`
    INSERT INTO musteriler (ad_soyad, email, telefon, sifre_hash)
    VALUES (${ad_soyad}, ${email.toLowerCase()}, ${telefon || ''}, ${sifre_hash})
    RETURNING id, ad_soyad, email, telefon, created_at
  `;
  const user = result[0];
  const token = Buffer.from(JSON.stringify({ id: user.id, email: user.email, ts: Date.now() })).toString('base64');
  return res.status(201).json({ success: true, token, user });
}

// GİRİŞ
if (action === 'login' && req.method === 'POST') {
  const { email, sifre } = req.body;
  if (!email || !sifre)
    return res.status(400).json({ error: 'Email ve şifre zorunludur.' });

  const crypto = require('crypto');
  const sifre_hash = crypto.createHash('sha256').update(sifre + 'gocmen_salt_2024').digest('hex');

  const result = await sql`SELECT * FROM musteriler WHERE email = ${email.toLowerCase()} AND sifre_hash = ${sifre_hash}`;
  if (!result.length)
    return res.status(401).json({ error: 'Email veya şifre hatalı.' });

  const user = result[0];
  const token = Buffer.from(JSON.stringify({ id: user.id, email: user.email, ts: Date.now() })).toString('base64');
  return res.status(200).json({ success: true, token, user: { id: user.id, ad_soyad: user.ad_soyad, email: user.email, telefon: user.telefon, created_at: user.created_at } });
}

// PROFİL
if (action === 'profile' && req.method === 'GET') {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
  const result = await sql`SELECT id, ad_soyad, email, telefon, created_at FROM musteriler WHERE id = ${user.id}`;
  if (!result.length) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  return res.status(200).json({ success: true, user: result[0] });
}

// GÜNCELLE
if (action === 'update' && req.method === 'PUT') {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
  const { ad_soyad, telefon } = req.body;
  await sql`UPDATE musteriler SET ad_soyad = ${ad_soyad}, telefon = ${telefon} WHERE id = ${user.id}`;
  return res.status(200).json({ success: true });
}

// ŞİFRE DEĞİŞTİR
if (action === 'change-password' && req.method === 'POST') {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
  const { eski_sifre, yeni_sifre } = req.body;
  const crypto = require('crypto');
  const eski_hash = crypto.createHash('sha256').update(eski_sifre + 'gocmen_salt_2024').digest('hex');
  const result = await sql`SELECT id FROM musteriler WHERE id = ${user.id} AND sifre_hash = ${eski_hash}`;
  if (!result.length) return res.status(401).json({ error: 'Mevcut şifre hatalı.' });
  if (yeni_sifre.length < 6) return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı.' });
  const yeni_hash = crypto.createHash('sha256').update(yeni_sifre + 'gocmen_salt_2024').digest('hex');
  await sql`UPDATE musteriler SET sifre_hash = ${yeni_hash} WHERE id = ${user.id}`;
  return res.status(200).json({ success: true });
}

// ADRESLER
if (action === 'addresses' && req.method === 'GET') {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
  const result = await sql`SELECT * FROM adresler WHERE musteri_id = ${user.id} ORDER BY created_at DESC`;
  return res.status(200).json({ success: true, addresses: result });
}

if (action === 'add-address' && req.method === 'POST') {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
  const { baslik, adres } = req.body;
  if (!baslik || !adres) return res.status(400).json({ error: 'Başlık ve adres zorunludur.' });
  await sql`INSERT INTO adresler (musteri_id, baslik, adres) VALUES (${user.id}, ${baslik}, ${adres})`;
  return res.status(201).json({ success: true });
}

if (action === 'delete-address' && req.method === 'POST') {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
  const { id } = req.body;
  await sql`DELETE FROM adresler WHERE id = ${id} AND musteri_id = ${user.id}`;
  return res.status(200).json({ success: true });
}

return res.status(400).json({ error: 'Geçersiz işlem.' });
```

} catch (err) {
console.error(‘Auth error:’, err.message);
return res.status(500).json({ error: ’Sunucu hatası: ’ + err.message });
}
};

function verifyToken(req) {
try {
const auth = req.headers.authorization;
if (!auth || !auth.startsWith(’Bearer ’)) return null;
const decoded = JSON.parse(Buffer.from(auth.slice(7), ‘base64’).toString());
if (!decoded.id || !decoded.email) return null;
return decoded;
} catch { return null; }
}