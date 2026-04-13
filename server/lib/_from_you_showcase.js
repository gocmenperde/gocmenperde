const { pool } = require('./_db');

let schemaReadyPromise = null;

function ensureString(value, maxLen = 400, fallback = '') {
  const str = String(value ?? '').trim();
  if (!str) return fallback;
  return str.slice(0, maxLen);
}

function normalizeImages(item = {}) {
  const list = Array.isArray(item.images) ? item.images : [];
  const merged = [item.src, ...list]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(merged)].slice(0, 20);
}

function normalizeFromYouItem(item = {}, orderNo = 0) {
  const images = normalizeImages(item);
  const src = ensureString(item.src || images[0], 1024, '');
  if (!src) return null;
  return {
    src,
    images,
    title: ensureString(item.title, 180, ''),
    location: ensureString(item.location, 180, ''),
    note: ensureString(item.note, 500, ''),
    comment: ensureString(item.comment, 1200, ''),
    author: ensureString(item.author, 120, 'Doğrulanmış Müşteri'),
    isActive: item.isActive !== false,
    orderNo: Number.isFinite(Number(orderNo)) ? Number(orderNo) : 0,
  };
}

async function ensureFromYouShowcaseSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS from_you_showcase (
          id BIGSERIAL PRIMARY KEY,
          src TEXT NOT NULL,
          images JSONB NOT NULL DEFAULT '[]'::jsonb,
          title TEXT,
          location TEXT,
          note TEXT,
          comment TEXT,
          author TEXT,
          order_no INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_from_you_showcase_order ON from_you_showcase(order_no ASC, id DESC)');
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

module.exports = {
  ensureFromYouShowcaseSchema,
  normalizeFromYouItem,
};
