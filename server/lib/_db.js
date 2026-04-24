const { Pool } = require('pg');
const { parseUrlWithFallback } = require('./_safe-url');

const connectionString = process.env.DATABASE_URL;

function appendPgbouncerParams(dbUrl=''){
  if(!dbUrl) return dbUrl;
  const hasQuery = dbUrl.includes('?');
  const withPgbouncer = /[?&]pgbouncer=/i.test(dbUrl) ? dbUrl : `${dbUrl}${hasQuery ? '&' : '?'}pgbouncer=true`;
  return /[?&]connection_limit=/i.test(withPgbouncer) ? withPgbouncer : `${withPgbouncer}&connection_limit=1`;
}

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
      max: Number(process.env.PG_POOL_MAX || 1),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 5000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 8000),
      query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 10000),
      ssl: pgSslEnv === 'true' ? { rejectUnauthorized: false } : undefined,
    };
  }

  const parsedUrl = parseUrlWithFallback(dbUrl);
  if (!parsedUrl) {
    console.warn('DATABASE_URL parse edilemedi, connectionString ile devam ediliyor.');
    return {
      connectionString: appendPgbouncerParams(dbUrl),
      max: Number(process.env.PG_POOL_MAX || 1),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 5000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 8000),
      query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 10000),
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
    max: Number(process.env.PG_POOL_MAX || 1),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 5000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 8000),
      query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 10000),
    ssl: sslEnabled ? { rejectUnauthorized: sslMode === 'verify-full' } : undefined,
  };

  return config;
};

const pool = new Pool(buildPoolConfig(connectionString));

module.exports = { pool };
