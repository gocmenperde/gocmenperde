const fs = require('fs/promises');
const path = require('path');
const { sendResendEmail } = require('./_resend-mail');
const { sendStockBackTemplate } = require('./_whatsapp');
const { notifyAdminError } = require('./_admin-error-notify');
const { pool } = require('./_db');
const { ensureStockAlertSchema } = require('./_stock_alerts_schema');
const { ensureStockSnapshotSchema } = require('./_stock_snapshot_schema');

const PRODUCTS_PATH = path.join(__dirname, '..', '..', 'products.json');

async function readJsonSafe(p, fallback) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch (_) {
    return fallback;
  }
}

async function readSnapshot() {
  const { rows } = await pool.query('SELECT product_id, stock FROM stock_snapshot');
  const map = {};
  for (const r of rows) map[r.product_id] = Number(r.stock) || 0;
  return map;
}

async function writeSnapshot(snap) {
  const ids = Object.keys(snap || {});
  if (!ids.length) return;
  const values = ids.map((id, i) => `($${i * 2 + 1}, $${i * 2 + 2}, NOW())`).join(',');
  const params = ids.flatMap((id) => [id, Math.max(0, Math.floor(Number(snap[id]) || 0))]);
  await pool.query(
    `INSERT INTO stock_snapshot(product_id, stock, updated_at)
     VALUES ${values}
     ON CONFLICT (product_id) DO UPDATE
       SET stock=EXCLUDED.stock, updated_at=EXCLUDED.updated_at`,
    params
  );
}

async function checkRestocks({ dryRun = false } = {}) {
  try {
    await ensureStockAlertSchema();
    await ensureStockSnapshotSchema();

    const products = await readJsonSafe(PRODUCTS_PATH, []);
    const snapshot = await readSnapshot();
    const restocked = [];
    const nextSnap = {};

    for (const p of products) {
      const pid = String(p?.id || '').trim();
      if (!pid) continue;
      const stock = Math.max(0, Math.floor(Number(p?.stock) || 0));
      const prev = snapshot[pid] !== undefined ? snapshot[pid] : stock;
      nextSnap[pid] = stock;
      if (prev <= 0 && stock > 0) {
        restocked.push({ productId: pid, productName: String(p?.name || 'Ürün'), stock });
      }
    }

    if (dryRun) return { restockedCount: restocked.length, sent: 0, failed: 0, restocked };

    await writeSnapshot(nextSnap);

    let sent = 0;
    let failed = 0;
    const nowIso = new Date().toISOString();

    for (const r of restocked) {
      const pending = await pool.query(
        `SELECT id, email, phone, channel, notified_channels
         FROM stock_alerts
         WHERE product_id=$1 AND notified_at IS NULL`,
        [r.productId]
      );

      for (const item of pending.rows) {
        const wantsEmail = item.channel === 'email' || item.channel === 'both' || (!item.channel && item.email);
        const wantsWa = item.channel === 'whatsapp' || item.channel === 'both';
        const productUrl = `https://gocmenperde.com.tr/?product=${encodeURIComponent(r.productId)}`;
        const channelsDone = Array.isArray(item.notified_channels) ? [...item.notified_channels] : [];

        if (wantsEmail && item.email && !channelsDone.includes('email')) {
          const result = await sendResendEmail({
            to: item.email,
            subject: `${r.productName} tekrar stokta`,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:520px">
              <h2 style="margin:0 0 12px;color:#a3823f">Bekledikleriniz hazır 🎉</h2>
              <p>Merhaba, takip ettiğiniz <strong>${r.productName}</strong> ürünü yeniden stokta.</p>
              <p>Mevcut stok: <strong>${r.stock} adet</strong></p>
              <p style="margin:20px 0"><a href="${productUrl}" style="background:#c8a35a;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:700;display:inline-block">Ürünü İncele</a></p>
              <p style="font-size:.85rem;color:#666">Bu uyarı isteğiniz üzerine gönderildi. Artık almak istemiyorsanız e-postayı yanıtlayabilirsiniz.</p>
            </div>`,
          });
          if (result?.ok) {
            channelsDone.push('email');
            sent += 1;
          } else {
            failed += 1;
          }
        }

        if (wantsWa && item.phone && !channelsDone.includes('whatsapp')) {
          const result = await sendStockBackTemplate({
            to: item.phone,
            productName: r.productName,
            stock: r.stock,
            productUrl,
          });
          if (result?.ok) {
            channelsDone.push('whatsapp');
            sent += 1;
          } else if (!result?.skipped) {
            failed += 1;
          }
        }

        const allDone = (!wantsEmail || channelsDone.includes('email')) && (!wantsWa || channelsDone.includes('whatsapp'));
        await pool.query(
          `UPDATE stock_alerts
           SET notified_channels=$2::jsonb,
               notified_at=CASE WHEN $3 THEN $4::timestamptz ELSE notified_at END
           WHERE id=$1`,
          [item.id, JSON.stringify(channelsDone), allDone, nowIso]
        );
      }
    }

    return { restockedCount: restocked.length, sent, failed };
  } catch (err) {
    await notifyAdminError('stock-alert-runner', err);
    throw err;
  }
}

module.exports = { checkRestocks };
