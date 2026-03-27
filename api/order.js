import { neon } from ‘@neondatabase/serverless’;
import jwt from ‘jsonwebtoken’;

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || ‘gocmen-perde-secret-2024’;

export default async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type, Authorization’);
if (req.method === ‘OPTIONS’) return res.status(200).end();

const { action } = req.query;

try {
// ── SİPARİŞ OLUŞTUR (giriş yapmış veya misafir) ──
if (action === ‘create’ && req.method === ‘POST’) {
const { name, phone, address, note, payment, items, total } = req.body;
if (!name || !phone || !address || !items || !total)
return res.status(400).json({ error: ‘Eksik bilgi.’ });

```
  // Token varsa musteri_id bağla
  let musteri_id = null;
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
      musteri_id = decoded.id;
    }
  } catch {}

  const result = await sql`
    INSERT INTO siparisler (musteri_id, musteri_adi, telefon, adres, odeme_yontemi, urunler, toplam, siparis_notu)
    VALUES (${musteri_id}, ${name}, ${phone}, ${address}, ${payment}, ${JSON.stringify(items)}, ${total}, ${note || ''})
    RETURNING id, created_at
  `;
  return res.status(201).json({ success: true, order_id: result[0].id, created_at: result[0].created_at });
}

// ── SİPARİŞLERİMİ GETİR ──
if (action === 'my-orders' && req.method === 'GET') {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });

  const result = await sql`
    SELECT id, musteri_adi, telefon, adres, odeme_yontemi, urunler, toplam, durum, siparis_notu, created_at
    FROM siparisler
    WHERE musteri_id = ${user.id}
    ORDER BY created_at DESC
  `;
  return res.status(200).json({ success: true, orders: result });
}

// ── TÜM SİPARİŞLER (admin) ──
if (action === 'all' && req.method === 'GET') {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== (process.env.ADMIN_KEY || 'gocmen-admin-2024'))
    return res.status(403).json({ error: 'Yetkisiz.' });

  const result = await sql`
    SELECT s.*, m.email
    FROM siparisler s
    LEFT JOIN musteriler m ON s.musteri_id = m.id
    ORDER BY s.created_at DESC
    LIMIT 100
  `;
  return res.status(200).json({ success: true, orders: result });
}

// ── SİPARİŞ DURUMU GÜNCELLE (admin) ──
if (action === 'update-status' && req.method === 'POST') {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== (process.env.ADMIN_KEY || 'gocmen-admin-2024'))
    return res.status(403).json({ error: 'Yetkisiz.' });

  const { id, durum } = req.body;
  await sql`UPDATE siparisler SET durum = ${durum} WHERE id = ${id}`;
  return res.status(200).json({ success: true });
}

return res.status(400).json({ error: 'Geçersiz işlem.' });
```

} catch (err) {
console.error(‘Orders error:’, err);
return res.status(500).json({ error: ’Sunucu hatası: ’ + err.message });
}
}

function verifyToken(req) {
try {
const auth = req.headers.authorization;
if (!auth || !auth.startsWith(’Bearer ’)) return null;
return jwt.verify(auth.slice(7), JWT_SECRET);
} catch { return null; }
}