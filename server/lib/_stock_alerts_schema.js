const { pool } = require('./_db');

let _ensured = false;

async function ensureStockAlertSchema() {
  if (_ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id            BIGSERIAL PRIMARY KEY,
      product_id    TEXT NOT NULL,
      product_name  TEXT NOT NULL,
      email         TEXT DEFAULT '',
      phone         TEXT DEFAULT '',
      channel       TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notified_at   TIMESTAMPTZ NULL,
      notified_channels JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_stock_alerts_pending
      ON stock_alerts (product_id) WHERE notified_at IS NULL;
  `);
  _ensured = true;
}

module.exports = { ensureStockAlertSchema };
