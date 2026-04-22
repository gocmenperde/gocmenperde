const { verifyAuthToken } = require('../lib/_auth-utils');

const { pool } = require('../lib/_db');
const { sendResendEmail } = require('../lib/_resend-mail');
const ADMIN_API_KEY = 'gocmen1993';
const ORDER_STATUSES = ['Beklemede', 'Hazırlanıyor', 'Kargoya Verildi', 'Yolda', 'Dağıtımda', 'Teslim Edildi', 'İptal'];
const ORDER_STATUS_ALIASES = {
  beklemede: 'Beklemede',
  hazirlaniyor: 'Hazırlanıyor',
  kargoyaverildi: 'Kargoya Verildi',
  kargoda: 'Yolda',
  yolda: 'Yolda',
  dagitimda: 'Dağıtımda',
  teslimedildi: 'Teslim Edildi',
  iptal: 'İptal',
};
const ORDER_NO_DIGITS = 14;

let cachedEmailColumn = null;
let cachedCustomerEmailColumns = null;
let cachedOrderNoColumn = null;
let inMemoryTrackingStore = {};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    if (action === 'create' && req.method === 'POST') {
      const { name, phone, email, address, note, payment, items, total } = req.body || {};
      const validation = validateCreateOrderPayload({ name, phone, email, address, note, payment, items, total });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      let musteri_id = null;
      try {
        const auth = req.headers.authorization;
        if (auth && auth.startsWith('Bearer ')) {
          const decoded = verifyAuthToken(req);
          musteri_id = decoded?.id || null;
        }
      } catch (error) {
        console.warn('Auth token doğrulama atlandı:', error.message);
      }

      const cleanEmail = normalizeEmail(validation.value.email);
      const insertResult = await insertOrder({
        musteri_id,
        name: validation.value.name,
        phone: validation.value.phone,
        email: cleanEmail,
        address: validation.value.address,
        payment: validation.value.payment,
        items: validation.value.items,
        total: validation.value.total,
        note: validation.value.note,
      });
      const createdOrder = insertResult.rows[0] || {};
      const orderId = Number(createdOrder.id || 0);
      const orderNo = (await ensureOrderTrackingRecord({
        orderId,
        createdAt: createdOrder.created_at,
      })) || String(orderId);

      const emailResult = await sendOrderCreatedEmails({
        orderId,
        orderNo,
        customer: { name: validation.value.name, phone: validation.value.phone, email: cleanEmail, address: validation.value.address },
        note: validation.value.note,
        payment: validation.value.payment,
        items: validation.value.items,
        total: validation.value.total,
      });

      return res.status(201).json({
        success: true,
        order_id: orderId,
        order_no: orderNo,
        email: emailResult,
      });
    }

    if (action === 'my-orders' && req.method === 'GET') {
      const user = verifyAuthToken(req);
      if (!user) return res.status(401).json({ error: 'Oturum geçersiz.' });
      const result = await pool.query(
        'SELECT id, musteri_adi, telefon, adres, odeme_yontemi, urunler, toplam, durum, siparis_notu, created_at FROM siparisler WHERE musteri_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      const orders = await withTrackingData(result.rows);
      return res.status(200).json({ success: true, orders });
    }

    if (action === 'all' && req.method === 'GET') {
      if (req.headers['x-admin-key'] !== ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Yetkisiz.' });
      }
      const result = await pool.query('SELECT * FROM siparisler ORDER BY created_at DESC');
      const orders = await withTrackingData(result.rows);
      return res.status(200).json({ success: true, orders });
    }

    if (action === 'track' && req.method === 'GET') {
      const rawOrderNo = String(req.query?.orderNo || '').trim();
      const resolved = await resolveOrderLookup(rawOrderNo);
      if (!resolved.ok) {
        return res.status(400).json({ error: 'Geçerli bir sipariş numarası girin.' });
      }

      const result = await pool.query(
        'SELECT id, musteri_adi, durum, created_at FROM siparisler WHERE id = $1 LIMIT 1',
        [resolved.orderId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Sipariş bulunamadı.' });
      }
      const order = (await withTrackingData(result.rows))[0];
      return res.status(200).json({ success: true, order });
    }

    if (action === 'update-status' && req.method === 'POST') {
      if (req.headers['x-admin-key'] !== ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Yetkisiz.' });
      }
      const { id, durum, trackingNote, trackingCode } = req.body || {};
      const normalizedStatus = normalizeOrderStatus(durum);
      if (!id || !normalizedStatus || !ORDER_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Geçersiz veri.' });
      }

      const beforeResult = await pool.query('SELECT * FROM siparisler WHERE id = $1 LIMIT 1', [id]);
      if (!beforeResult.rows.length) {
        return res.status(404).json({ error: 'Sipariş bulunamadı.' });
      }
      const order = beforeResult.rows[0];
      const oldStatus = order.durum || 'Beklemede';

      await pool.query('UPDATE siparisler SET durum = $1 WHERE id = $2', [normalizedStatus, id]);
      await upsertTracking({
        orderId: Number(id),
        newStatus: normalizedStatus,
        createdAt: order.created_at,
        trackingNote,
        trackingCode,
      });

      if (oldStatus !== normalizedStatus) {
        await sendOrderStatusEmail({
          order,
          previousStatus: oldStatus,
          newStatus: normalizedStatus,
        });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Geçersiz işlem.' });
  } catch (err) {
    console.error('Orders error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};

async function insertOrder({ musteri_id, name, phone, email, address, payment, items, total, note }) {
  const emailColumn = await getOrderEmailColumn();
  const serializedItems = JSON.stringify(items);

  if (emailColumn) {
    return pool.query(
      `INSERT INTO siparisler (musteri_id, musteri_adi, telefon, ${emailColumn}, adres, odeme_yontemi, urunler, toplam, siparis_notu)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, created_at`,
      [musteri_id, name, phone, email || null, address, payment, serializedItems, total, note || '']
    );
  }

  return pool.query(
    'INSERT INTO siparisler (musteri_id, musteri_adi, telefon, adres, odeme_yontemi, urunler, toplam, siparis_notu) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at',
    [musteri_id, name, phone, address, payment, serializedItems, total, note || '']
  );
}

async function getOrderEmailColumn() {
  if (cachedEmailColumn !== null) return cachedEmailColumn;
  const candidates = ['email', 'musteri_email', 'eposta'];
  try {
    const result = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='siparisler'"
    );
    const available = new Set(result.rows.map((r) => String(r.column_name || '').toLowerCase()));
    cachedEmailColumn = candidates.find((c) => available.has(c)) || '';
    return cachedEmailColumn;
  } catch (err) {
    console.warn('Siparisler tablosu kolonları okunamadı:', err.message);
    cachedEmailColumn = '';
    return cachedEmailColumn;
  }
}

async function getOrderNoColumn() {
  if (cachedOrderNoColumn !== null) return cachedOrderNoColumn;
  const candidates = ['order_no', 'siparis_no', 'siparis_numarasi'];
  try {
    const result = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='siparisler'"
    );
    const available = new Set(result.rows.map((r) => String(r.column_name || '').toLowerCase()));
    cachedOrderNoColumn = candidates.find((c) => available.has(c)) || '';
    return cachedOrderNoColumn;
  } catch (err) {
    console.warn('Siparisler tablosu sipariş no kolonları okunamadı:', err.message);
    cachedOrderNoColumn = '';
    return cachedOrderNoColumn;
  }
}

async function persistOrderNo(orderId, orderNo) {
  if (!Number.isInteger(orderId) || orderId <= 0) return;
  const normalizedOrderNo = String(orderNo || '').replace(/\D+/g, '');
  if (normalizedOrderNo.length !== ORDER_NO_DIGITS) return;
  const orderNoColumn = await getOrderNoColumn();
  if (!orderNoColumn) return;
  try {
    await pool.query(
      `UPDATE siparisler SET ${orderNoColumn} = $1 WHERE id = $2 AND (COALESCE(${orderNoColumn}::text, '') = '' OR ${orderNoColumn}::text <> $1)`,
      [normalizedOrderNo, orderId]
    );
  } catch (err) {
    console.warn(`Sipariş #${orderId} için sipariş no DB'ye yazılamadı:`, err.message);
  }
}

async function findOrderIdByPersistedOrderNo(rawValue) {
  const digits = String(rawValue || '').replace(/\D+/g, '');
  if (!digits) return 0;
  const orderNoColumn = await getOrderNoColumn();
  if (!orderNoColumn) return 0;
  try {
    const result = await pool.query(
      `SELECT id FROM siparisler WHERE ${orderNoColumn}::text = $1 LIMIT 1`,
      [digits]
    );
    return Number(result.rows?.[0]?.id || 0);
  } catch (err) {
    console.warn('DB üzerinden sipariş no sorgusu başarısız:', err.message);
    return 0;
  }
}

async function sendOrderCreatedEmails({ orderId, orderNo, customer, note, payment, items, total }) {
  const customerHtml = buildOrderEmailHtml({
    title: 'Siparişiniz Alındı',
    subtitle: `Sipariş numaranız: ${orderNo}. Bu numarayla siparişinizi kolayca sorgulayabilirsiniz.`,
    accent: '#c9a84c',
    orderNo,
    customer,
    payment,
    items,
    total,
    note,
  });

  const adminHtml = buildOrderEmailHtml({
    title: 'Yeni Sipariş Geldi',
    subtitle: `Yeni sipariş numarası: ${orderNo} (DB #${orderId})`,
    accent: '#0f0e0d',
    orderNo,
    customer,
    payment,
    items,
    total,
    note,
  });

  const jobs = [];
  if (customer.email) {
    jobs.push(sendTransactionalEmail({
      to: customer.email,
      subject: 'Göçmen Perde | Sipariş Özetiniz',
      html: customerHtml,
    }));
  }

  const adminEmail = String(process.env.ADMIN_ORDER_EMAIL || '').trim();
  if (adminEmail) {
    jobs.push(sendTransactionalEmail({
      to: adminEmail,
      subject: `Yeni Sipariş #${orderId} — ${customer.name}`,
      html: adminHtml,
    }));
  } else {
    console.warn('ADMIN_ORDER_EMAIL tanımlı değil. Admin bilgilendirme e-postası atlandı.');
  }

  const results = await Promise.all(jobs);
  const sent = results.filter((result) => result.ok).length;
  const skipped = results.filter((result) => result.skipped).map((result) => result.reason);
  const failed = results.filter((result) => !result.ok && !result.skipped);

  if (failed.length) {
    console.warn(`Sipariş #${orderId} için ${failed.length} e-posta görevi başarısız oldu.`);
  }

  return {
    sent,
    failed: failed.length,
    skipped,
  };
}

async function sendOrderStatusEmail({ order, previousStatus, newStatus }) {
  const customerEmail = await resolveOrderCustomerEmail(order);
  if (!customerEmail) {
    console.warn(`Sipariş #${order?.id || '-'} için durum maili atlandı: müşteri e-postası bulunamadı.`);
    return;
  }

  const items = parseOrderItems(order.urunler);
  const html = buildOrderEmailHtml({
    title: 'Sipariş Durumu Güncellendi',
    subtitle: `Sipariş durumunuz "${newStatus}" olarak güncellendi.`,
    accent: '#2471a3',
    customer: {
      name: order.musteri_adi,
      phone: order.telefon,
      email: customerEmail,
      address: order.adres,
    },
    payment: order.odeme_yontemi,
    items,
    total: order.toplam,
    note: order.siparis_notu,
    extra: `<p style="margin:0 0 10px;color:#4a4743"><strong>Önceki Durum:</strong> ${escapeHtml(previousStatus)}</p><p style="margin:0;color:#4a4743"><strong>Yeni Durum:</strong> ${escapeHtml(newStatus)}</p>`,
  });

  await sendTransactionalEmail({
    to: customerEmail,
    subject: `Göçmen Perde | Sipariş Durum Güncellemesi: ${newStatus}`,
    html,
  });
}

function parseOrderItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractOrderEmail(order) {
  return normalizeEmail(order?.email || order?.musteri_email || order?.eposta || '');
}

async function resolveOrderCustomerEmail(order) {
  const fromOrder = extractOrderEmail(order);
  if (fromOrder) return fromOrder;

  const customerId = Number(order?.musteri_id || 0);
  if (!customerId) return '';

  try {
    const customerEmailColumns = await getCustomerEmailColumns();
    if (!customerEmailColumns.length) return '';
    const selectCols = customerEmailColumns.join(', ');
    const result = await pool.query(`SELECT ${selectCols} FROM musteriler WHERE id = $1 LIMIT 1`, [customerId]);
    if (!result.rows.length) return '';
    const row = result.rows[0] || {};
    for (const col of customerEmailColumns) {
      const email = normalizeEmail(row[col] || '');
      if (email) return email;
    }
    return '';
  } catch (err) {
    console.warn('Müşteri e-posta sorgusu başarısız:', err.message);
    return '';
  }
}

async function getCustomerEmailColumns() {
  if (cachedCustomerEmailColumns !== null) return cachedCustomerEmailColumns;
  const candidates = ['email', 'eposta', 'musteri_email'];
  try {
    const result = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='musteriler'"
    );
    const available = new Set(result.rows.map((r) => String(r.column_name || '').toLowerCase()));
    cachedCustomerEmailColumns = candidates.filter((c) => available.has(c));
    return cachedCustomerEmailColumns;
  } catch (err) {
    console.warn('Musteriler tablosu kolonları okunamadı:', err.message);
    cachedCustomerEmailColumns = [];
    return cachedCustomerEmailColumns;
  }
}

function normalizeStatusKey(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeOrderStatus(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (ORDER_STATUSES.includes(raw)) return raw;
  return ORDER_STATUS_ALIASES[normalizeStatusKey(raw)] || '';
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '').slice(0, 20);
}

function normalizePayment(value) {
  const allowed = new Set(['kapida', 'havale', 'kredikarti']);
  const candidate = String(value || '').trim().toLocaleLowerCase('tr-TR');
  return allowed.has(candidate) ? candidate : '';
}

function validateCreateOrderPayload(payload) {
  const name = String(payload?.name || '').trim().slice(0, 120);
  const phone = normalizePhone(payload?.phone);
  const email = normalizeEmail(payload?.email);
  const address = String(payload?.address || '').trim().slice(0, 1200);
  const note = String(payload?.note || '').trim().slice(0, 1500);
  const payment = normalizePayment(payload?.payment);
  const items = sanitizeOrderItems(payload?.items);
  const total = Number(payload?.total);

  if (!name || name.length < 2) return { ok: false, error: 'Geçerli bir ad soyad girin.' };
  if (!phone || phone.replace(/\D/g, '').length < 10) return { ok: false, error: 'Geçerli bir telefon numarası girin.' };
  if (payload?.email && !email) return { ok: false, error: 'Geçerli bir e-posta adresi girin.' };
  if (!address || address.length < 8) return { ok: false, error: 'Teslimat adresi eksik görünüyor.' };
  if (!payment) return { ok: false, error: 'Geçersiz ödeme yöntemi.' };
  if (!items.length) return { ok: false, error: 'Sipariş için en az bir ürün gereklidir.' };
  if (!Number.isFinite(total) || total <= 0) return { ok: false, error: 'Toplam tutar geçersiz.' };

  const computedTotal = items.reduce((sum, item) => sum + Number(item.sub || 0), 0);
  if (Math.abs(computedTotal - total) > 1) {
    return { ok: false, error: 'Sepet toplamı uyuşmuyor. Lütfen sepeti güncelleyip tekrar deneyin.' };
  }

  return {
    ok: true,
    value: {
      name,
      phone,
      email,
      address,
      note,
      payment,
      items,
      total: Number(total.toFixed(2)),
    },
  };
}

function sanitizeOrderItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const price = Number(item?.price || 0);
      const qty = Number(item?.qty || 1);
      const sub = Number(item?.sub || price * qty);
      if (!Number.isFinite(price) || price <= 0) return null;
      if (!Number.isFinite(qty) || qty <= 0) return null;
      if (!Number.isFinite(sub) || sub <= 0) return null;
      return {
        id: String(item?.id || '').slice(0, 120),
        name: String(item?.name || 'Ürün').trim().slice(0, 180),
        price: Number(price.toFixed(2)),
        qty: Number(qty.toFixed(3)),
        sub: Number(sub.toFixed(2)),
        image: String(item?.image || '').slice(0, 600),
        unitLabel: String(item?.unitLabel || item?.unit || 'adet').slice(0, 40),
        width: item?.width ?? null,
        height: item?.height ?? null,
      };
    })
    .filter(Boolean)
    .slice(0, 120);
}

function paymentLabel(payment) {
  const labels = {
    kapida: 'Kapıda Ödeme',
    havale: 'Havale / EFT',
    kredikarti: 'Kredi Kartı',
  };
  return labels[payment] || payment || 'Belirtilmedi';
}

function buildOrderEmailHtml({ title, subtitle, accent, orderNo = '', customer, payment, items, total, note, extra = '' }) {
  const siteUrl = resolveSiteUrl();
  const customerOrdersUrl = `${siteUrl}/hesabim.html?tab=orders`;
  const itemsSafe = Array.isArray(items) ? items : [];
  const itemCards = itemsSafe
    .map((item) => {
      const qty = Number(item.qty || item.quantity || item.adet || 1);
      const price = Number(item.price || 0);
      const subtotal = Number(item.sub || (qty * price));
      const rawImage = String(item.image || item.img || item.photo || '').trim();
      const imageUrl = normalizeAssetUrl(rawImage, siteUrl) || `${siteUrl}/resimler/logo.jpg`;
      const productId = item.id || item.productId || item.urun_id || '';
      const productName = escapeHtml(item.name || item.ad || 'Ürün');
      const productUrl = productId
        ? `${siteUrl}/?product=${encodeURIComponent(String(productId))}#products`
        : `${siteUrl}/#products`;
      const qtyLabel = qty > 1 ? `${qty} adet` : '1 adet';

      return `
        <a href="${escapeHtml(productUrl)}" style="display:block;text-decoration:none;color:#1a1f36 !important;margin:0 0 12px;border:1px solid #eceff3;border-radius:14px;overflow:hidden;background:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td width="96" style="padding:12px;vertical-align:top;">
                <img src="${escapeHtml(imageUrl)}" alt="${productName}" width="84" height="84" style="display:block;width:84px;height:84px;object-fit:cover;border-radius:12px;border:1px solid #eef1f5;background:#f8fafc" />
              </td>
              <td style="padding:12px 12px 12px 0;vertical-align:top;">
                <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#1a1f36 !important">${productName}</p>
                <p style="margin:0 0 3px;font-size:13px;color:#4b5563 !important">${escapeHtml(qtyLabel)}</p>
                <p style="margin:0 0 7px;font-size:13px;color:#4b5563 !important">Birim Fiyat: ${formatCurrency(price)}</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#1a1f36 !important">Toplam: ${formatCurrency(subtotal)}</p>
              </td>
            </tr>
          </table>
        </a>`;
    })
    .join('');

  const noteText = String(note || '').trim() || '-';
  const normalizedAccent = String(accent || '').trim();
  const headingText = escapeHtml(title || 'Yeni Sipariş Geldi');
  const headingSubtitle = escapeHtml(subtitle || 'Sipariş detayları hazır');
  const headingColor = normalizedAccent === '#0f0e0d' ? '#f3f4f6' : '#ffffff';

  return `
  <div style="margin:0;padding:28px 12px;background:#f6f9fc;font-family:Inter,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1f36">
    <div style="max-width:760px;width:100%;margin:0 auto;background:#ffffff;border:1px solid #edf1f7;border-radius:16px;overflow:hidden;box-shadow:0 16px 34px rgba(26,31,54,.08)">
      <div style="padding:26px 24px 22px;background:#1a1f36;text-align:center">
        <div style="font-size:18px;font-weight:700;letter-spacing:.9px;color:#ffffff !important">GÖÇMEN PERDE</div>
        <h1 style="margin:10px 0 0;font-size:25px;font-weight:500;line-height:1.35;color:${headingColor} !important">${headingText}</h1>
        <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,.78) !important">${headingSubtitle}</p>
      </div>
      <div style="padding:22px 20px 20px;">
        <div style="margin:0 0 18px;padding:14px 0;border-bottom:1px solid #eee">
          <p style="margin:0;font-size:14px;color:#4b5563 !important">Merhaba ${escapeHtml(customer?.name || 'Değerli müşterimiz')}, sipariş detaylarınız aşağıdadır.</p>
        </div>

        <h2 style="margin:0 0 10px;font-size:18px;color:#1a1f36 !important;font-weight:600">Müşteri Bilgileri</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:14px">
          <tr><td style="width:38%;padding:10px 0;color:#6b7280;font-weight:600;border-bottom:1px solid #eee">Ad Soyad</td><td style="padding:10px 0;color:#111827;border-bottom:1px solid #eee">${escapeHtml(customer?.name || '-')}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-weight:600;border-bottom:1px solid #eee">Sipariş No</td><td style="padding:10px 0;color:#111827;font-weight:700;border-bottom:1px solid #eee">${escapeHtml(orderNo || '-')}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-weight:600;border-bottom:1px solid #eee">Telefon</td><td style="padding:10px 0;color:#111827;border-bottom:1px solid #eee">${escapeHtml(customer?.phone || '-')}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-weight:600;border-bottom:1px solid #eee">E-posta</td><td style="padding:10px 0;color:#111827;border-bottom:1px solid #eee">${escapeHtml(customer?.email || '-')}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-weight:600;border-bottom:1px solid #eee">Ödeme</td><td style="padding:10px 0;color:#111827;border-bottom:1px solid #eee">${escapeHtml(paymentLabel(payment))}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-weight:600;border-bottom:1px solid #eee;vertical-align:top">Adres</td><td style="padding:10px 0;color:#111827;border-bottom:1px solid #eee;line-height:1.55">${escapeHtml(customer?.address || '-')}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-weight:600;border-bottom:1px solid #eee;vertical-align:top">Sipariş Notu</td><td style="padding:10px 0;color:#111827;border-bottom:1px solid #eee;line-height:1.55">${escapeHtml(noteText)}</td></tr>
        </table>

        ${extra}

        <div style="margin:18px 0 12px;padding:16px;border:1px solid #edf1f5;border-radius:14px;background:#ffffff">
          <h2 style="margin:0 0 12px;font-size:19px;font-weight:600;color:#1a1f36 !important">Sipariş Özeti</h2>
          ${itemCards || '<p style="margin:0;color:#4b5563 !important;font-size:14px">Ürün bilgisi bulunamadı.</p>'}
          <div style="padding-top:12px;border-top:1px solid #eee;margin-top:10px;text-align:right">
            <p style="margin:0;font-size:20px;font-weight:700;color:#1a1f36 !important">Toplam Tutar: ${formatCurrency(total)}</p>
          </div>
        </div>

        <div style="text-align:center;padding:4px 0 8px">
          <a href="${escapeHtml(customerOrdersUrl)}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#1a1f36;color:#ffffff !important;font-size:14px;font-weight:600;text-decoration:none">Müşteri Paneline Git</a>
        </div>
      </div>
      <div style="padding:14px 20px 20px;text-align:center;color:#888888;font-size:12px;line-height:1.6;background:#ffffff">
        Göçmen Perde • Bursa, Türkiye<br />
        <a href="tel:+905012110958" style="color:#888888;text-decoration:none">+90 501 211 09 58</a>
        <span style="opacity:.65"> • </span>
        <a href="mailto:muhammedeminturk.16@gmail.com" style="color:#888888;text-decoration:none">muhammedeminturk.16@gmail.com</a>
      </div>
    </div>
  </div>`;
}


function resolveSiteUrl() {
  const raw = String(
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    'https://gocmenperde.com'
  ).trim();
  if (!raw) return 'https://gocmenperde.com';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, '');
}

function normalizeAssetUrl(value, siteUrl) {
  const src = String(value || '').trim();
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('//')) return `https:${src}`;
  const prefixed = src.startsWith('/') ? src : `/${src}`;
  return `${siteUrl}${prefixed}`;
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('tr-TR')} TL`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendTransactionalEmail({ to, subject, html }) {
  if (!to) {
    return { ok: false, skipped: true, reason: 'missing_recipient' };
  }
  const result = await sendResendEmail({ to, subject, html });
  if (!result.ok) {
    console.warn('Mail gönderilemedi:', result.reason || 'mail_error', result.status || '', result.error || '');
  }
  return result;
}


async function withTrackingData(orders = []) {
  if (!Array.isArray(orders) || !orders.length) return [];
  const store = await readTrackingStore();
  let storeDirty = false;
  const mapped = orders.map((order) => {
    const key = String(order.id || '');
    const ensured = ensureOrderNoRecord(store, key, Number(order.id || 0));
    const record = ensured.record;
    if (ensured.changed) storeDirty = true;
    return {
      ...order,
      order_no: String(record.orderNo || ''),
      tracking: {
        code: String(record.code || ''),
        history: buildTrackingHistory({
          createdAt: order.created_at,
          currentStatus: order.durum || 'Beklemede',
          storedHistory: record.history,
        }),
      },
    };
  });
  if (storeDirty) await writeTrackingStore(store);
  await Promise.all(
    mapped.map((order) => persistOrderNo(Number(order.id || 0), order.order_no))
  );
  return mapped;
}

function buildTrackingHistory({ createdAt, currentStatus, storedHistory }) {
  const timeline = Array.isArray(storedHistory) ? storedHistory.filter(Boolean) : [];
  if (timeline.length) return timeline;
  return [{
    status: currentStatus || 'Beklemede',
    note: 'Sipariş kaydı oluşturuldu.',
    at: createdAt || new Date().toISOString(),
  }];
}

async function upsertTracking({ orderId, newStatus, createdAt, trackingNote, trackingCode }) {
  if (!Number.isInteger(orderId) || orderId <= 0) return;
  const store = await readTrackingStore();
  const key = String(orderId);
  const record = ensureOrderNoRecord(store, key, orderId).record;
  const prevHistory = Array.isArray(record.history) ? record.history : [];
  const safeNote = String(trackingNote || '').trim().slice(0, 350);
  const safeCode = String(trackingCode || '').trim().slice(0, 80);

  if (safeCode) record.code = safeCode;
  if (!prevHistory.length) {
    prevHistory.push({
      status: 'Beklemede',
      note: 'Sipariş kaydı oluşturuldu.',
      at: createdAt || new Date().toISOString(),
    });
  }
  const lastStatus = String(prevHistory[prevHistory.length - 1]?.status || '');
  if (lastStatus !== newStatus || safeNote) {
    prevHistory.push({
      status: newStatus,
      note: safeNote || `${newStatus} olarak güncellendi.`,
      at: new Date().toISOString(),
    });
  }
  record.history = prevHistory.slice(-40);
  store[key] = record;
  await writeTrackingStore(store);
}

async function ensureOrderTrackingRecord({ orderId, createdAt }) {
  if (!Number.isInteger(orderId) || orderId <= 0) return '';
  const store = await readTrackingStore();
  const key = String(orderId);
  const record = ensureOrderNoRecord(store, key, orderId).record;
  if (!Array.isArray(record.history) || !record.history.length) {
    record.history = [{
      status: 'Beklemede',
      note: 'Sipariş kaydı oluşturuldu.',
      at: createdAt || new Date().toISOString(),
    }];
  }
  store[key] = record;
  await writeTrackingStore(store);
  await persistOrderNo(orderId, record.orderNo);
  return String(record.orderNo || '');
}

async function resolveOrderLookup(rawValue) {
  const digits = String(rawValue || '').replace(/\D+/g, '');
  if (!digits) return { ok: false, orderId: 0 };
  const store = await readTrackingStore();
  const matchByOrderNo = Object.entries(store).find(([, record]) => {
    const normalizedOrderNo = String(record?.orderNo || '').replace(/\D+/g, '');
    return normalizedOrderNo && normalizedOrderNo === digits;
  });
  if (matchByOrderNo) {
    return { ok: true, orderId: Number(matchByOrderNo[0]) };
  }
  const persistedOrderId = await findOrderIdByPersistedOrderNo(digits);
  if (persistedOrderId > 0) {
    return { ok: true, orderId: persistedOrderId };
  }
  const PG_INT_MAX = 2147483647;
  if (digits.length === ORDER_NO_DIGITS) {
    const embeddedOrderId = Number(digits.slice(0, 7));
    if (Number.isInteger(embeddedOrderId) && embeddedOrderId > 0 && embeddedOrderId <= PG_INT_MAX) {
      return { ok: true, orderId: embeddedOrderId };
    }
  }
  if (digits.length > String(PG_INT_MAX).length) {
    return { ok: false, orderId: 0 };
  }
  const maybeId = Number(digits);
  if (!Number.isInteger(maybeId) || maybeId <= 0 || maybeId > PG_INT_MAX) {
    return { ok: false, orderId: 0 };
  }
  return { ok: true, orderId: maybeId };
}

function ensureOrderNoRecord(store, key, orderId) {
  const record = store[key] && typeof store[key] === 'object' ? store[key] : {};
  const current = String(record.orderNo || '').replace(/\D+/g, '');
  let changed = false;
  if (current.length !== ORDER_NO_DIGITS) {
    record.orderNo = generateOrderNo(orderId, store, key);
    changed = true;
  }
  if (!store[key] || store[key] !== record) changed = true;
  store[key] = record;
  return { record, changed };
}

function generateOrderNo(orderId, store, currentKey) {
  const used = new Set(
    Object.entries(store || {})
      .filter(([key]) => String(key) !== String(currentKey))
      .map(([, value]) => String(value?.orderNo || '').replace(/\D+/g, ''))
      .filter((value) => value.length === ORDER_NO_DIGITS)
  );
  const safeOrderId = Math.max(1, Number(orderId) || 1);
  const idPart = String(safeOrderId).padStart(7, '0').slice(-7);
  const timePart = Date.now().toString().slice(-7);
  let candidate = `${idPart}${timePart}`;
  let tries = 0;
  while (used.has(candidate) && tries < 20) {
    tries += 1;
    candidate = `${idPart}${String(Date.now() + tries).slice(-7)}`;
  }
  return candidate.slice(0, ORDER_NO_DIGITS);
}

async function readTrackingStore() {
  if (!inMemoryTrackingStore || typeof inMemoryTrackingStore !== 'object') {
    inMemoryTrackingStore = {};
  }
  return inMemoryTrackingStore;
}

async function writeTrackingStore(store) {
  inMemoryTrackingStore = store && typeof store === 'object' ? store : {};
}
