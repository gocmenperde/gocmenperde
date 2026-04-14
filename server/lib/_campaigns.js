const { pool } = require('./_db');

let schemaReady = false;

const DEFAULT_CAMPAIGNS = [
  {
    name: 'Sezon Sonu %25 İndirim',
    description: 'Tüm ürünlerde geçerli sezon sonu kampanyası.',
    imageUrl: 'resimler/foto8.jpg',
    discountType: 'percent',
    discountValue: 25,
    couponCode: '',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    targetPath: '#products',
    buttonLabel: 'Kampanyayı İncele',
    sortOrder: 0,
    isActive: true,
  },
  {
    name: 'İlk Sipariş Kuponu',
    description: 'Yeni müşterilere %10 indirim.',
    imageUrl: 'resimler/foto6.jpg',
    discountType: 'percent',
    discountValue: 10,
    couponCode: 'ILKSIPARIS10',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    targetPath: '#cart',
    buttonLabel: 'Kuponu Kullan',
    sortOrder: 1,
    isActive: true,
  },
];

function parseDateValue(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sanitizeDiscountType(raw) {
  return String(raw || '').trim() === 'amount' ? 'amount' : 'percent';
}

function mapCampaignRow(row = {}) {
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    description: String(row.description || ''),
    imageUrl: String(row.imageUrl || ''),
    discountType: sanitizeDiscountType(row.discountType),
    discountValue: Number(row.discountValue || 0),
    couponCode: String(row.couponCode || ''),
    startDate: row.startDate || null,
    endDate: row.endDate || null,
    targetPath: String(row.targetPath || ''),
    buttonLabel: String(row.buttonLabel || ''),
    sortOrder: Number(row.sortOrder || 0),
    isActive: row.isActive !== false,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

async function ensureCampaignsSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
      coupon_code TEXT NOT NULL DEFAULT '',
      start_date DATE,
      end_date DATE,
      target_path TEXT NOT NULL DEFAULT '',
      button_label TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS button_label TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_path TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'percent'`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2) NOT NULL DEFAULT 0`);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_campaigns_active_order ON campaigns (is_active, sort_order, id DESC)');

  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM campaigns');
  if (Number(countResult.rows[0]?.count || 0) === 0) {
    for (const item of DEFAULT_CAMPAIGNS) {
      await pool.query(
        `INSERT INTO campaigns (name, description, image_url, discount_type, discount_value, coupon_code, start_date, end_date, target_path, button_label, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12)`,
        [
          item.name,
          item.description,
          item.imageUrl,
          sanitizeDiscountType(item.discountType),
          Number(item.discountValue || 0),
          String(item.couponCode || ''),
          parseDateValue(item.startDate),
          parseDateValue(item.endDate),
          item.targetPath,
          item.buttonLabel,
          Number(item.sortOrder || 0),
          item.isActive !== false,
        ]
      );
    }
  }

  schemaReady = true;
}

function normalizeCampaignPayload(body = {}) {
  const name = String(body.name || '').trim();
  const description = String(body.description || body.desc || '').trim();
  const imageUrl = String(body.imageUrl || body.image_url || '').trim();
  const discountType = sanitizeDiscountType(body.discountType || body.discount_type || 'percent');
  const discountValueRaw = Number(body.discountValue ?? body.discount_value ?? body.discount ?? 0);
  const couponCode = String(body.couponCode || body.coupon_code || body.code || '').trim().toUpperCase();
  const startDate = parseDateValue(body.startDate || body.start_date || body.start);
  const endDate = parseDateValue(body.endDate || body.end_date || body.end);
  const targetPath = String(body.targetPath || body.target_path || '').trim();
  const buttonLabel = String(body.buttonLabel || body.button_label || '').trim();
  const sortOrderRaw = Number(body.sortOrder ?? body.sort_order ?? body.orderNo ?? 0);
  const isActive = body.isActive !== false && body.is_active !== false;

  if (!name) return { ok: false, error: 'Kampanya adı zorunlu.' };
  if (!imageUrl) return { ok: false, error: 'Kampanya görseli zorunlu.' };

  const discountValue = Number.isFinite(discountValueRaw) ? Math.max(0, discountValueRaw) : 0;
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.round(sortOrderRaw) : 0;

  if (discountType === 'percent' && discountValue > 100) {
    return { ok: false, error: 'Yüzde indirim 100 değerini geçemez.' };
  }

  if (startDate && endDate && startDate > endDate) {
    return { ok: false, error: 'Başlangıç tarihi bitiş tarihinden büyük olamaz.' };
  }

  return {
    ok: true,
    value: {
      name: name.slice(0, 160),
      description: description.slice(0, 1000),
      imageUrl: imageUrl.slice(0, 1000),
      discountType,
      discountValue,
      couponCode: couponCode.slice(0, 60),
      startDate,
      endDate,
      targetPath: targetPath.slice(0, 500),
      buttonLabel: buttonLabel.slice(0, 80),
      sortOrder,
      isActive,
    },
  };
}

module.exports = {
  ensureCampaignsSchema,
  normalizeCampaignPayload,
  mapCampaignRow,
};
