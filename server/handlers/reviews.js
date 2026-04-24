const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../lib/_db');
const { ensureReviewSchema } = require('../lib/_reviews_schema');
const { applyCors } = require('../lib/_cors');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'reviews');
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const _ipMap = new Map();

function rateOk(ip) {
  const now = Date.now();
  const arr = (_ipMap.get(ip) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= 5) return false;
  arr.push(now);
  _ipMap.set(ip, arr);
  return true;
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
}

function badWordSafe(text) {
  const banned = ['amk', 'aq', 'orospu', 'siktir', 'piç', 'pic', 'sikim', 'yarrak'];
  const lower = String(text).toLowerCase();
  return !banned.some((w) => lower.includes(w));
}

async function savePhoto(productId, dataUrl) {
  const raw = String(dataUrl || '').trim();
  if (!raw) return null;
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(raw);
  if (!m) {
    console.warn('[reviews:photo] geçersiz dataUrl formatı');
    throw new Error('Fotoğraf formatı desteklenmiyor. JPEG/PNG/WEBP yükleyin.');
  }
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_PHOTO_BYTES) {
    throw new Error('Fotoğraf boyutu 3 MB sınırını aşıyor.');
  }
  const ext = m[1].toLowerCase() === 'png' ? 'png' : (m[1].toLowerCase() === 'webp' ? 'webp' : 'jpg');
  const safePid = String(productId).replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
  const dir = path.join(UPLOAD_DIR, safePid);
  await fs.mkdir(dir, { recursive: true });
  const fname = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(dir, fname), buf);
  return `/uploads/reviews/${safePid}/${fname}`;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  await ensureReviewSchema();

  if (req.method === 'GET') {
    const productId = String(req.query?.productId || '').trim();
    if (!productId) return res.status(400).json({ error: 'productId zorunlu' });
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 20)));
    const offset = Math.max(0, Number(req.query?.offset || 0));
    const r = await pool.query(
      `SELECT id, name, rating, text, photos, verified_purchase, helpful_count, is_seed, source, created_at
       FROM product_reviews WHERE product_id=$1 AND status='approved'
       ORDER BY verified_purchase DESC, is_seed ASC, helpful_count DESC NULLS LAST, created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limit, offset]
    );
    const stats = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(AVG(rating),0)::float AS avg,
              COUNT(*) FILTER (WHERE photos != '[]'::jsonb)::int AS with_photo,
              COUNT(*) FILTER (WHERE verified_purchase)::int AS verified
       FROM product_reviews WHERE product_id=$1 AND status='approved'`,
      [productId]
    );
    return res.status(200).json({ success: true, items: r.rows, stats: stats.rows[0] });
  }

  if (req.method === 'POST') {
    try {
      const action = String(req.body?.action || 'create').trim();

      if (action === 'helpful') {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'id geçersiz' });
        await pool.query('UPDATE product_reviews SET helpful_count = helpful_count + 1 WHERE id=$1 AND status=\'approved\'', [id]);
        return res.status(200).json({ success: true });
      }

      const ip = clientIp(req);
      if (!rateOk(ip)) return res.status(429).json({ error: 'Saatte en fazla 5 yorum gönderebilirsiniz.' });

      const productId = String(req.body?.productId || '').trim();
      const name = String(req.body?.name || '').trim().slice(0, 80) || 'Misafir Müşteri';
      const text = String(req.body?.text || '').trim().slice(0, 2000);
      const rating = Math.max(1, Math.min(5, Math.round(Number(req.body?.rating) || 0)));
      const email = String(req.body?.email || '').trim().toLowerCase();
      const inviteToken = String(req.body?.inviteToken || '').trim();
      const photosIn = Array.isArray(req.body?.photos) ? req.body.photos.slice(0, MAX_PHOTOS) : [];

      if (!productId || !text || !rating) return res.status(400).json({ error: 'productId, text ve rating zorunlu' });
      if (text.length < 6) return res.status(400).json({ error: 'Yorum en az 6 karakter olmalı' });
      if (!badWordSafe(text)) return res.status(400).json({ error: 'Yorum metninde uygunsuz ifade var.' });

      let verified = false;
      let orderId = null;
      let autoApprove = false;
      let source = 'user';
      if (inviteToken) {
        const t = await pool.query('SELECT order_id, product_id, email FROM review_invites WHERE token=$1 AND used_at IS NULL', [inviteToken]);
        if (t.rows[0] && t.rows[0].product_id === productId) {
          verified = true;
          orderId = t.rows[0].order_id;
          autoApprove = true;
          source = 'verified';
          await pool.query('UPDATE review_invites SET used_at = NOW() WHERE token=$1', [inviteToken]);
        }
      }

      const savedPhotos = [];
      for (const p of photosIn) {
        const url = await savePhoto(productId, p);
        if (url) savedPhotos.push(url);
      }

      const AUTO_APPROVE = String(process.env.REVIEW_AUTO_APPROVE || '1') === '1';
      const status = (autoApprove || AUTO_APPROVE) ? 'approved' : 'pending';
      const ins = await pool.query(
        `INSERT INTO product_reviews(product_id,email_hash,name,rating,text,photos,verified_purchase,order_id,status,source,ip_hash)
         VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING id`,
        [productId, email ? sha256(email) : null, name, rating, text, JSON.stringify(savedPhotos), verified, orderId, status, source, sha256(ip)]
      );
      return res.status(200).json({ success: true, id: ins.rows[0].id, status, autoApproved: status === 'approved' });
    } catch (err) {
      console.error('[reviews:create]', err);
      return res.status(500).json({ error: err?.message || 'Sunucu hatası', code: err?.code || null });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
