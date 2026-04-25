const { pool } = require('./_db');

let _ensured = false;

async function ensureStockSnapshotSchema() {
  if (_ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_snapshot (
      product_id TEXT PRIMARY KEY,
      stock      INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  _ensured = true;
}

module.exports = { ensureStockSnapshotSchema };
