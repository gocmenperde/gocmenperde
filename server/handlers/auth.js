const { createAuthToken, verifyAuthToken, hashPassword, verifyPassword } = require('../lib/_auth-utils');

const { pool } = require('../lib/_db');
const loginAttempts = new Map();
const MAX_ATTEMPTS = 7;
const WINDOW_MS = 1000 * 60 * 10;

const { applyCors } = require('../lib/_cors');
const FALLBACK_ADMIN_EMAIL = 'muhammedeminturk.16@gmail.com';
const FALLBACK_ADMIN_SECRET = 'Emin.016';

async function listUserAddresses(userId) {
  const hasAddressTable = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'adresler') AS exists"
  );

  if (hasAddressTable.rows?.[0]?.exists) {
    const columns = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'adresler'"
    );
    const available = new Set(columns.rows.map((row) => row.column_name));
    const selectFragments = [
      available.has('id') ? 'id' : 'ROW_NUMBER() OVER (ORDER BY COALESCE(created_at, NOW()) DESC) AS id',
      available.has('baslik') ? 'baslik' : "'Kayıtlı Adres'::text AS baslik",
      available.has('adres') ? 'adres' : "''::text AS adres",
      available.has('created_at') ? 'created_at' : 'NOW() AS created_at',
    ];
    const whereColumn = available.has('musteri_id') ? 'musteri_id' : null;
    if (whereColumn) {
      const result = await pool.query(
        `SELECT ${selectFragments.join(', ')} FROM adresler WHERE ${whereColumn} = $1 ORDER BY created_at DESC NULLS LAST`,
        [userId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        baslik: row.baslik || 'Kayıtlı Adres',
        adres: row.adres || '',
        created_at: row.created_at || null,
      }));
    }
  }

  const fallbackRows = await pool.query(
    `SELECT MIN(id) AS id, MAX(created_at) AS created_at, adres
     FROM siparisler
     WHERE musteri_id = $1 AND COALESCE(TRIM(adres), '') <> ''
     GROUP BY adres
     ORDER BY MAX(created_at) DESC`,
    [userId]
  );

  return fallbackRows.rows.map((row, index) => ({
    id: row.id || `order_addr_${index + 1}`,
    baslik: `Sipariş Adresi ${index + 1}`,
    adres: row.adres,
    created_at: row.created_at || null,
  }));
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  const { action } = req.query;

  try {
    const isAllowedEmailDomain = (email = '') => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
    const isStrongPassword = (sifre = '') => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(sifre));

    if (action === 'admin-login' && req.method === 'POST') {
      const { email, key, password } = req.body || {};
      const providedSecret = String(password || key || '').trim();
      const providedEmail = String(email || '').trim().toLowerCase();
      const adminSecret = String(
        process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || FALLBACK_ADMIN_SECRET
      ).trim();
      const adminEmails = String(process.env.ADMIN_EMAILS || FALLBACK_ADMIN_EMAIL)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (!providedSecret || providedSecret !== adminSecret) {
        return res.status(401).json({ error: 'Yetkisiz.' });
      }

      if (adminEmails.length) {
        if (!providedEmail) {
          if (adminEmails.length !== 1) {
            return res.status(401).json({ error: 'Yetkisiz.' });
          }
        } else if (!adminEmails.includes(providedEmail)) {
          return res.status(401).json({ error: 'Yetkisiz.' });
        }
      }

      const adminUser = {
        id: 0,
        email: providedEmail || adminEmails[0] || 'admin@gocmenperde.local',
      };
      const token = createAuthToken(adminUser);
      if (!token) return res.status(500).json({ error: 'Token üretilemedi.' });
      return res.status(200).json({ success: true, token });
    }

    if (action === 'register' && req.method === 'POST') {
      const { ad_soyad, email, telefon, sifre } = req.body || {};
      if (!ad_soyad || !email || !sifre)
        return res.status(400).json({ error: 'Ad soyad, email ve şifre zorunludur.' });
      if (!isAllowedEmailDomain(email))
        return res.status(400).json({ error: 'Geçerli bir e-posta adresi giriniz.' });
      if (!isStrongPassword(sifre))
        return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı ve harf ile sayı içermelidir.' });

      const safeEmail = String(email).trim().toLowerCase();
      const existing = await pool.query('SELECT id FROM musteriler WHERE email = $1', [safeEmail]);
      if (existing.rows.length > 0)
        return res.status(409).json({ error: 'Bu email zaten kayıtlı.' });

      const sifre_hash = hashPassword(sifre);
      const result = await pool.query(
        'INSERT INTO musteriler (ad_soyad, email, telefon, sifre_hash) VALUES ($1,$2,$3,$4) RETURNING id, ad_soyad, email, telefon, created_at',
        [ad_soyad, safeEmail, telefon || '', sifre_hash]
      );
      const user = result.rows[0];
      const token = createAuthToken(user);
      return res.status(201).json({ success: true, token, user });
    }

    if (action === 'login' && req.method === 'POST') {
      const { email, sifre } = req.body || {};
      if (!email || !sifre)
        return res.status(400).json({ error: 'Email ve şifre zorunludur.' });

      const safeEmail = String(email).trim().toLowerCase();
      const key = `${safeEmail}:${String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')}`;
      const now = Date.now();
      const bucket = loginAttempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };
      if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + WINDOW_MS;
      }
      if (bucket.count >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Çok fazla deneme yapıldı. Lütfen 10 dakika sonra tekrar deneyin.' });
      }

      const result = await pool.query('SELECT * FROM musteriler WHERE email = $1 LIMIT 1', [safeEmail]);
      if (!result.rows.length) {
        bucket.count += 1;
        loginAttempts.set(key, bucket);
        return res.status(401).json({ error: 'Email veya şifre hatalı.' });
      }

      const user = result.rows[0];
      const validPassword = verifyPassword(sifre, user.sifre_hash);
      if (!validPassword) {
        bucket.count += 1;
        loginAttempts.set(key, bucket);
        return res.status(401).json({ error: 'Email veya şifre hatalı.' });
      }

      loginAttempts.delete(key);

      if (!String(user.sifre_hash || '').startsWith('pbkdf2$')) {
        await pool.query('UPDATE musteriler SET sifre_hash = $1 WHERE id = $2', [hashPassword(sifre), user.id]);
      }

      const token = createAuthToken(user);
      return res.status(200).json({
        success: true,
        token,
        user: { id: user.id, ad_soyad: user.ad_soyad, email: user.email, telefon: user.telefon, created_at: user.created_at },
      });
    }

    if (action === 'profile' && req.method === 'GET') {
      const user = verifyAuthToken(req);
      if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
      const result = await pool.query(
        'SELECT id, ad_soyad, email, telefon, created_at FROM musteriler WHERE id = $1',
        [user.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
      return res.status(200).json({ success: true, user: result.rows[0] });
    }

    if (action === 'update' && req.method === 'PUT') {
      const user = verifyAuthToken(req);
      if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
      const { ad_soyad, telefon } = req.body || {};
      if (!ad_soyad) return res.status(400).json({ error: 'Ad soyad zorunludur.' });
      await pool.query('UPDATE musteriler SET ad_soyad = $1, telefon = $2 WHERE id = $3', [ad_soyad, telefon || '', user.id]);
      return res.status(200).json({ success: true });
    }

    if (action === 'change-password' && req.method === 'POST') {
      const user = verifyAuthToken(req);
      if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
      const { eski_sifre, yeni_sifre } = req.body || {};
      if (!eski_sifre || !yeni_sifre) return res.status(400).json({ error: 'Mevcut ve yeni şifre zorunludur.' });

      const result = await pool.query('SELECT id, sifre_hash FROM musteriler WHERE id = $1 LIMIT 1', [user.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

      const row = result.rows[0];
      if (!verifyPassword(eski_sifre, row.sifre_hash)) return res.status(401).json({ error: 'Mevcut şifre hatalı.' });
      if (!isStrongPassword(yeni_sifre)) return res.status(400).json({ error: 'Yeni şifre en az 8 karakter olmalı, harf ve sayı içermelidir.' });
      await pool.query('UPDATE musteriler SET sifre_hash = $1 WHERE id = $2', [hashPassword(yeni_sifre), user.id]);
      return res.status(200).json({ success: true });
    }

    if (action === 'addresses' && req.method === 'GET') {
      const user = verifyAuthToken(req);
      if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
      const addresses = await listUserAddresses(user.id);
      return res.status(200).json({ success: true, addresses });
    }

    if (action === 'add-address' && req.method === 'POST') {
      const user = verifyAuthToken(req);
      if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
      const { baslik, adres } = req.body || {};
      if (!baslik || !adres) return res.status(400).json({ error: 'Başlık ve adres zorunludur.' });

      const normalizedAddress = String(adres || '').trim();
      const hasStreetInfo = /(mahalle|mah\.?|sokak|sk\.?|cadde|cd\.?|bulvar)/i.test(normalizedAddress);
      if (normalizedAddress.length < 15 || !hasStreetInfo) {
        return res.status(400).json({ error: 'Adres en az 15 karakter olmalı ve mahalle/sokak/cadde bilgisi içermelidir.' });
      }

      await pool.query('INSERT INTO adresler (musteri_id, baslik, adres) VALUES ($1,$2,$3)', [user.id, baslik, adres]);
      return res.status(201).json({ success: true });
    }

    if (action === 'delete-address' && req.method === 'POST') {
      const user = verifyAuthToken(req);
      if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
      const { id } = req.body || {};
      await pool.query('DELETE FROM adresler WHERE id = $1 AND musteri_id = $2', [id, user.id]);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Geçersiz işlem.' });
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
};
