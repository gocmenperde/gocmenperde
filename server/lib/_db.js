const { Pool } = require('pg');

const rawConnectionString = String(process.env.DATABASE_URL || '').trim();

if (!rawConnectionString) {
  console.warn('DATABASE_URL tanımlı değil. API istekleri veritabanına bağlanamayabilir.');
}

function normalizeSslMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'prefer' || value === 'require' || value === 'verify-ca') return 'verify-full';
  return value;
}

function readBooleanEnv(name) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function buildPoolConfig(connectionString) {
  const baseConfig = {
    max: Number(process.env.PG_POOL_MAX || 12),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 10000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
  };

  if (!connectionString) return baseConfig;

  try {
    const parsed = new URL(connectionString);
    if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
      return { ...baseConfig, connectionString };
    }

    const urlSslMode = normalizeSslMode(parsed.searchParams.get('sslmode'));
    const forcedSsl = readBooleanEnv('PG_SSL');
    const sslEnabled = forcedSsl || Boolean(urlSslMode);

    const host = parsed.hostname || undefined;
    const port = parsed.port ? Number(parsed.port) : undefined;
    const database = parsed.pathname ? decodeURIComponent(parsed.pathname.replace(/^\//, '')) : undefined;
    const user = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;

    return {
      ...baseConfig,
      host,
      port,
      database,
      user,
      password,
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
    };
  } catch (err) {
    console.warn('DATABASE_URL parse edilemedi, connectionString fallback kullanılacak.', err?.message || err);
    return { ...baseConfig, connectionString };
  }
}

const pool = new Pool(buildPoolConfig(rawConnectionString));

module.exports = { pool };
