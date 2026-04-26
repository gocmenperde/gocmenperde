const { pool } = require('./_db');

let schemaReady = false;

const DEFAULT_SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/gocmen.perde/',
  facebook: '',
  tiktok: '',
  youtube: '',
  x: ''
};
const DEFAULT_CHECKOUT_SETTINGS = {
  giftWrapFee: '',
  freeShipThreshold: '',
  memberDiscount: '',
  deliveryRange: '',
};

const ALLOWED_KEYS = ['instagram', 'facebook', 'tiktok', 'youtube', 'x'];

function isValidUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  return /^https?:\/\//i.test(raw);
}

async function ensureSiteSettingsSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(
    `INSERT INTO site_settings (key, value)
     VALUES ('social_links', $1::jsonb)
     ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DEFAULT_SOCIAL_LINKS)]
  );
  await pool.query(
    `INSERT INTO site_settings (key, value)
     VALUES ('checkout_settings', $1::jsonb)
     ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DEFAULT_CHECKOUT_SETTINGS)]
  );

  schemaReady = true;
}

async function getSocialLinks() {
  await ensureSiteSettingsSchema();
  const { rows } = await pool.query('SELECT value FROM site_settings WHERE key = $1 LIMIT 1', ['social_links']);
  const value = rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {};
  return { ...DEFAULT_SOCIAL_LINKS, ...value };
}

async function setSocialLinks(payload) {
  await ensureSiteSettingsSchema();
  const next = { ...DEFAULT_SOCIAL_LINKS };
  const source = payload && typeof payload === 'object' ? payload : {};

  for (const key of ALLOWED_KEYS) {
    const raw = String(source[key] || '').trim();
    if (!isValidUrl(raw)) {
      const err = new Error(`invalid url: ${key}`);
      err.status = 400;
      throw err;
    }
    next[key] = raw;
  }

  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('social_links', $1::jsonb, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(next)]
  );

  return next;
}

async function getCheckoutSettings() {
  await ensureSiteSettingsSchema();
  const { rows } = await pool.query('SELECT value FROM site_settings WHERE key = $1 LIMIT 1', ['checkout_settings']);
  const value = rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {};
  return { ...DEFAULT_CHECKOUT_SETTINGS, ...value };
}

async function setCheckoutSettings(payload) {
  await ensureSiteSettingsSchema();
  const source = payload && typeof payload === 'object' ? payload : {};
  const normalizeNumberField = (key, { min = 0, max = Number.POSITIVE_INFINITY } = {}) => {
    if (!(key in source)) return undefined;
    const raw = source[key];
    if (raw == null || raw === '') return '';
    const normalizedRaw = String(raw).trim().replace(',', '.');
    const num = Number(normalizedRaw);
    if (!Number.isFinite(num)) return '';
    return Math.min(max, Math.max(min, num));
  };
  const next = await getCheckoutSettings();
  const giftWrapFee = normalizeNumberField('giftWrapFee', { min: 0 });
  const freeShipThreshold = normalizeNumberField('freeShipThreshold', { min: 0 });
  const memberDiscount = normalizeNumberField('memberDiscount', { min: 0, max: 50 });
  if (giftWrapFee !== undefined) next.giftWrapFee = giftWrapFee;
  if (freeShipThreshold !== undefined) next.freeShipThreshold = freeShipThreshold;
  if (memberDiscount !== undefined) next.memberDiscount = memberDiscount;
  if ('deliveryRange' in source) next.deliveryRange = String(source.deliveryRange || '').trim().slice(0, 24);

  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('checkout_settings', $1::jsonb, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(next)]
  );
  return next;
}

module.exports = {
  ensureSiteSettingsSchema,
  getSocialLinks,
  setSocialLinks,
  getCheckoutSettings,
  setCheckoutSettings,
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_CHECKOUT_SETTINGS,
};
