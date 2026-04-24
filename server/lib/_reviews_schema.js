const { pool } = require('./_db');

let _ensured = false;

async function ensureReviewSchema() {
  if (_ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_reviews(
      id SERIAL PRIMARY KEY,
      product_id TEXT NOT NULL,
      email_hash TEXT,
      name TEXT NOT NULL,
      rating SMALLINT NOT NULL CHECK(rating BETWEEN 1 AND 5),
      text TEXT NOT NULL,
      photos JSONB NOT NULL DEFAULT '[]'::jsonb,
      verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
      order_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      helpful_count INTEGER NOT NULL DEFAULT 0,
      is_seed BOOLEAN NOT NULL DEFAULT FALSE,
      source TEXT NOT NULL DEFAULT 'user',
      ip_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      moderated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id, status);
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON product_reviews(status, created_at DESC);
    ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';
    CREATE INDEX IF NOT EXISTS idx_reviews_product_seed ON product_reviews(product_id, is_seed);

    CREATE TABLE IF NOT EXISTS review_invites(
      id SERIAL PRIMARY KEY,
      order_id TEXT NOT NULL,
      email TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scheduled_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_invites_pending ON review_invites(sent_at, scheduled_at);
  `);
  _ensured = true;
}

module.exports = { ensureReviewSchema };
