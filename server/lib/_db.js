const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL tanımlı değil. API istekleri veritabanına bağlanamayabilir.');
}

const parseSslMode = (value) => String(value || '').trim().toLowerCase();

const normalizeSslMode = (sslMode) => {
  if (sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
    // pg v9/libpq geçişinde semantik değişimini önlemek için mevcut güvenli davranışı açıkça koru.
    return 'verify-full';
  }

  return sslMode;
};

const buildPoolConfig = (dbUrl) => {
  const pgSslEnv = String(process.env.PG_SSL || '').trim().toLowerCase();

  if (!dbUrl) {
    return {
      max: Number(process.env.PG_POOL_MAX || 12),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
      ssl: pgSslEnv === 'true' ? { rejectUnauthorized: false } : undefined,
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(dbUrl);
  } catch (error) {
    console.warn('DATABASE_URL parse edilemedi, connectionString ile devam ediliyor.');
    return {
      connectionString: dbUrl,
      max: Number(process.env.PG_POOL_MAX || 12),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
      ssl: pgSslEnv === 'true' ? { rejectUnauthorized: false } : undefined,
    };
  }

  const rawSslMode = parseSslMode(parsedUrl.searchParams.get('sslmode'));
  const sslMode = normalizeSslMode(rawSslMode);

  const sslEnabled = pgSslEnv === 'true' || ['verify-full', 'verify-ca', 'require'].includes(sslMode);

  const config = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 5432),
    database: parsedUrl.pathname.replace(/^\//, ''),
    user: decodeURIComponent(parsedUrl.username || ''),
    password: decodeURIComponent(parsedUrl.password || ''),
    max: Number(process.env.PG_POOL_MAX || 12),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 10000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
    ssl: sslEnabled ? { rejectUnauthorized: sslMode === 'verify-full' } : undefined,
  };

  return config;
};

const pool = new Pool(buildPoolConfig(connectionString));

module.exports = { pool };
