const { pool } = require('./_db');

let schemaReady = false;

const DEFAULT_PAYMENT_LOGOS = [
  ['Visa', '/payment-logos/visa.svg', 'Visa', 10],
  ['Mastercard', '/payment-logos/mastercard.svg', 'Mastercard', 20],
  ['Troy', '/payment-logos/troy.svg', 'Troy', 30],
  ['American Express', '/payment-logos/amex.svg', 'American Express', 40],
  ['UnionPay', '/payment-logos/unionpay.svg', 'UnionPay', 50],
  ['3D Secure', '/payment-logos/3d-secure.svg', '3D Secure', 60],
  ['Mastercard SecureCode', '/payment-logos/mastercard-securecode.svg', 'Mastercard SecureCode', 70],
  ['Verified by Visa', '/payment-logos/verified-by-visa.svg', 'Verified by Visa', 80],
  ['iyzico', '/payment-logos/iyzico.svg', 'iyzico', 90],
  ['PayTR', '/payment-logos/paytr.svg', 'PayTR', 100],
  ['Güvenli Öde', '/payment-logos/guvenli-ode.svg', 'Güvenli Öde', 110],
];

async function ensurePaymentLogosSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_logos (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      alt_text TEXT,
      sort_order INT DEFAULT 0,
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const count = await pool.query('SELECT COUNT(*)::int AS count FROM payment_logos');
  if (Number(count.rows[0]?.count || 0) === 0) {
    for (const row of DEFAULT_PAYMENT_LOGOS) {
      await pool.query(
        'INSERT INTO payment_logos (name, image_url, alt_text, sort_order) VALUES ($1,$2,$3,$4)',
        row
      );
    }
  }

  schemaReady = true;
}

module.exports = {
  ensurePaymentLogosSchema,
};
