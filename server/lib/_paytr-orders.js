const { pool } = require('./_db');

let tableReadyPromise = null;

function asJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  return fallback;
}

async function ensurePaytrOrdersTable() {
  if (!tableReadyPromise) {
    tableReadyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS paytr_orders (
        merchant_oid TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','expired')),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        paytr_response JSONB NOT NULL DEFAULT '{}'::jsonb,
        total_amount INTEGER NOT NULL DEFAULT 0,
        order_id TEXT,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(async () => {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_paytr_orders_status ON paytr_orders(status)');
    }).catch((err) => {
      tableReadyPromise = null;
      throw err;
    });
  }
  return tableReadyPromise;
}

async function insertPending({ merchant_oid, payload = {}, total_amount = 0, paytr_response = {} }) {
  await ensurePaytrOrdersTable();
  const result = await pool.query(
    `INSERT INTO paytr_orders (merchant_oid, status, payload, total_amount, paytr_response, created_at, updated_at)
     VALUES ($1, 'pending', $2::jsonb, $3, $4::jsonb, NOW(), NOW())
     ON CONFLICT (merchant_oid)
     DO UPDATE SET
       status = 'pending',
       payload = EXCLUDED.payload,
       total_amount = EXCLUDED.total_amount,
       paytr_response = EXCLUDED.paytr_response,
       updated_at = NOW()
     RETURNING *`,
    [String(merchant_oid || ''), JSON.stringify(asJson(payload)), Math.max(0, Number(total_amount || 0)), JSON.stringify(asJson(paytr_response))]
  );
  return result.rows?.[0] || null;
}

async function markPaid({ merchant_oid, paytr_response = {}, order_id = null, paid_at = null }) {
  await ensurePaytrOrdersTable();
  const result = await pool.query(
    `UPDATE paytr_orders
     SET status = 'paid',
         paytr_response = COALESCE(paytr_response, '{}'::jsonb) || $2::jsonb,
         order_id = COALESCE($3, order_id),
         paid_at = COALESCE($4::timestamptz, NOW()),
         updated_at = NOW()
     WHERE merchant_oid = $1
     RETURNING *`,
    [String(merchant_oid || ''), JSON.stringify(asJson(paytr_response)), order_id ? String(order_id) : null, paid_at || null]
  );
  return result.rows?.[0] || null;
}

async function markFailed({ merchant_oid, status = 'failed', paytr_response = {} }) {
  await ensurePaytrOrdersTable();
  const normalizedStatus = ['failed', 'cancelled', 'expired'].includes(status) ? status : 'failed';
  const result = await pool.query(
    `UPDATE paytr_orders
     SET status = $2,
         paytr_response = COALESCE(paytr_response, '{}'::jsonb) || $3::jsonb,
         updated_at = NOW()
     WHERE merchant_oid = $1
     RETURNING *`,
    [String(merchant_oid || ''), normalizedStatus, JSON.stringify(asJson(paytr_response))]
  );
  return result.rows?.[0] || null;
}

async function setOrderReference({ merchant_oid, order_id }) {
  await ensurePaytrOrdersTable();
  const result = await pool.query(
    `UPDATE paytr_orders
     SET order_id = COALESCE($2, order_id), updated_at = NOW()
     WHERE merchant_oid = $1
     RETURNING *`,
    [String(merchant_oid || ''), order_id ? String(order_id) : null]
  );
  return result.rows?.[0] || null;
}

async function getStatus(merchant_oid) {
  await ensurePaytrOrdersTable();
  const result = await pool.query(
    `SELECT merchant_oid, status, payload, paytr_response, total_amount, order_id, paid_at, created_at, updated_at
     FROM paytr_orders WHERE merchant_oid = $1 LIMIT 1`,
    [String(merchant_oid || '')]
  );
  return result.rows?.[0] || null;
}

module.exports = {
  ensurePaytrOrdersTable,
  insertPending,
  markPaid,
  markFailed,
  setOrderReference,
  getStatus,
};
