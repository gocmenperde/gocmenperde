const fs = require('fs/promises');
const path = require('path');
const { sendResendEmail } = require('./_resend-mail');

const PRODUCTS_PATH = path.join(__dirname, '..', '..', 'products.json');
const ALERTS_PATH = path.join(__dirname, '..', 'data', 'stock-alerts.json');
const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'stock-snapshot.json');

async function readJsonSafe(p, fallback) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch (_) {
    return fallback;
  }
}

async function writeJsonSafe(p, v) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(v, null, 2), 'utf8');
}

async function checkRestocks({ dryRun = false } = {}) {
  const products = await readJsonSafe(PRODUCTS_PATH, []);
  const alerts = await readJsonSafe(ALERTS_PATH, []);
  const snapshot = await readJsonSafe(SNAPSHOT_PATH, {});
  const restocked = [];
  const nextSnap = {};

  for (const p of products) {
    const pid = String(p?.id || '').trim();
    if (!pid) continue;
    const stock = Math.max(0, Math.floor(Number(p?.stock) || 0));
    const prev = Number(snapshot[pid] ?? stock);
    nextSnap[pid] = stock;
    if (prev <= 0 && stock > 0) {
      restocked.push({ productId: pid, productName: String(p?.name || 'Ürün'), stock });
    }
  }

  if (dryRun) return { restockedCount: restocked.length, restocked };

  await writeJsonSafe(SNAPSHOT_PATH, nextSnap);

  let sent = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const r of restocked) {
    const pending = alerts.filter((a) => String(a.productId) === r.productId && !a.notifiedAt);
    for (const item of pending) {
      const result = await sendResendEmail({
        to: item.email,
        subject: `${r.productName} tekrar stokta`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:520px">
          <h2 style="margin:0 0 12px;color:#a3823f">Bekledikleriniz hazır 🎉</h2>
          <p>Merhaba, takip ettiğiniz <strong>${r.productName}</strong> ürünü yeniden stokta.</p>
          <p>Mevcut stok: <strong>${r.stock} adet</strong></p>
          <p style="margin:20px 0"><a href="https://gocmenperde.com.tr/?product=${encodeURIComponent(r.productId)}" style="background:#c8a35a;color:#1a1a1a;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:700;display:inline-block">Ürünü İncele</a></p>
          <p style="font-size:.85rem;color:#666">Bu uyarı isteğiniz üzerine gönderildi. Artık almak istemiyorsanız e-postayı yanıtlayabilirsiniz.</p>
        </div>`,
      });
      if (result?.ok) {
        item.notifiedAt = nowIso;
        sent += 1;
      } else {
        failed += 1;
      }
    }
  }

  await writeJsonSafe(ALERTS_PATH, alerts);
  return { restockedCount: restocked.length, sent, failed };
}

module.exports = { checkRestocks };
