const { pool } = require('../lib/_db');
const { ensureStockAlertSchema } = require('../lib/_stock_alerts_schema');
const { sendResendEmail, normalizeEmail } = require('../lib/_resend-mail');
const { normalizePhoneTR, isValidPhoneTR } = require('../lib/_phone');

const _rateMap = new Map();

function rateOk(ip) {
  const now = Date.now();
  const arr = (_rateMap.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 10) return false;
  arr.push(now);
  _rateMap.set(ip, arr);
  return true;
}

module.exports = async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      success: false,
      error: 'Stok uyarı sistemi şu an kullanılamıyor (veritabanı bağlantısı yok). Yöneticinin DATABASE_URL ortam değişkenini ayarlaması gerekiyor.'
    });
  }

  await ensureStockAlertSchema();

  if (req.method === 'POST') {
    const action = String(req.body?.action || '').trim();
    if (action === 'subscribe') {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
      if (!rateOk(ip)) return res.status(429).json({ error: 'Çok fazla istek. Lütfen biraz bekleyin.' });

      const productId = String(req.body?.productId || '').trim();
      const productName = String(req.body?.productName || '').trim();
      const email = normalizeEmail(req.body?.email || '');
      const phoneRaw = String(req.body?.phone || '').trim();
      const phone = phoneRaw ? normalizePhoneTR(phoneRaw) : '';
      const channelReq = String(req.body?.channel || '').trim().toLowerCase();
      if (!productId || !productName) return res.status(400).json({ error: 'productId ve productName zorunlu.' });
      if (phoneRaw && !isValidPhoneTR(phoneRaw)) return res.status(400).json({ error: 'Geçerli bir Türkiye cep numarası girin (+905XXXXXXXXX).' });
      if (!email && !phone) return res.status(400).json({ error: 'En az e-posta veya telefon zorunlu.' });

      let channel = channelReq;
      if (!['email', 'whatsapp', 'both'].includes(channel)) {
        if (email && phone) channel = 'both';
        else if (phone) channel = 'whatsapp';
        else channel = 'email';
      }

      const existsQ = await pool.query(
        `SELECT 1 FROM stock_alerts
         WHERE product_id=$1 AND notified_at IS NULL
           AND ((($2 <> '') AND email=$2) OR (($3 <> '') AND phone=$3))
         LIMIT 1`,
        [productId, email, phone]
      );
      const alreadyExists = existsQ.rowCount > 0;

      if (!alreadyExists) {
        await pool.query(
          `INSERT INTO stock_alerts(product_id, product_name, email, phone, channel)
           VALUES ($1,$2,$3,$4,$5)`,
          [productId, productName, email || '', phone || '', channel]
        );
      }

      if (email) {
        await sendResendEmail({
          to: email,
          subject: `${productName} stok bildirimi kaydınız alındı`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:520px">
            <h2 style="margin:0 0 12px;color:#a3823f">Kaydınız alındı ✅</h2>
            <p><strong>${productName}</strong> ürününün stok bildirimi için aboneliğiniz oluşturuldu.</p>
            <p>Ürün tekrar stokta olduğunda bu adrese tek seferlik bilgilendirme e-postası göndereceğiz.</p>
          </div>`,
        }).catch(() => null);
      }

      return res.status(200).json({ success: true, alreadyExists, channel });
    }
    return res.status(400).json({ error: 'Geçersiz action.' });
  }

  if (req.method === 'GET') {
    const productId = String(req.query?.productId || '').trim();
    const q = productId
      ? await pool.query(`SELECT COUNT(*)::int AS c FROM stock_alerts WHERE product_id=$1 AND notified_at IS NULL`, [productId])
      : await pool.query(`SELECT COUNT(*)::int AS c FROM stock_alerts WHERE notified_at IS NULL`);
    return res.status(200).json({ success: true, pendingCount: q.rows[0].c });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
