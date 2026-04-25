const { verifyAuthToken } = require('./_auth-utils');

// Geriye dönük uyumluluk için statik token (varsa hala kabul edilir).
const STATIC_TOKEN = String(
  process.env.ADMIN_TOKEN || process.env.ADMIN_API_KEY || process.env.ADMIN_API_TOKEN || ''
).trim();

// Admin sayılacak email listesi (env: ADMIN_EMAILS="a@x.com,b@y.com")
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
// Geriye dönük uyumluluk: ADMIN_EMAILS listesindeki ilk email "ana admin" sayılır.
// ADMIN_EMAILS yoksa hiçbir email otomatik admin olmaz.
const VALID_ADMIN_EMAIL = (ADMIN_EMAILS[0] || '').toLowerCase();

function readAdminHeader(req) {
  return normalizeToken(
    req.headers['x-admin-token'] ||
    req.headers['x-admin-key'] ||
    req.headers.authorization ||
    req.body?.adminToken ||
    req.query?.adminToken ||
    ''
  );
}

function normalizeToken(rawToken) {
  let token = String(rawToken || '').trim();
  if (!token) return '';
  token = token.replace(/^['"]+|['"]+$/g, '').trim();
  if (/^bearer\s+/i.test(token)) {
    token = token.replace(/^bearer\s+/i, '').trim();
  }
  return token;
}

function tryStaticMatch(token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return false;
  const acceptedTokens = [
    STATIC_TOKEN,
    process.env.ADMIN_API_KEY,
    process.env.ADMIN_TOKEN,
    process.env.ADMIN_API_TOKEN,
  ].filter(Boolean).map(normalizeToken);
  if (!acceptedTokens.length) return false;
  return acceptedTokens.includes(normalizedToken);
}

function tryJwtMatch(req, token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return null;
  const fakeReq = {
    headers: { ...req.headers, authorization: `Bearer ${normalizedToken}` },
  };

  const decoded = verifyAuthToken(fakeReq);
  if (decoded) {
    const email = String(decoded.email || '').toLowerCase();
    if (decoded.isAdmin === true || email === VALID_ADMIN_EMAIL) return decoded;
    if (ADMIN_EMAILS.includes(email)) return decoded;
  }
  return null;
}

function isAdmin(req) {
  const token = readAdminHeader(req);
  if (tryStaticMatch(token)) return { kind: 'static' };

  const jwt = tryJwtMatch(req, token);
  if (jwt) return { kind: 'jwt', user: jwt };

  return false;
}

function requireAdmin(req, res) {
  const ok = isAdmin(req);
  if (!ok) {
    res.status(403).json({ error: 'Yetkisiz erişim' });
    return false;
  }

  // Aşağı katmanlar isterse req.admin üzerinden kullanıcıya ulaşabilir
  req.admin = ok;
  return true;
}

module.exports = { isAdmin, requireAdmin };
