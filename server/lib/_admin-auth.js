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
  if (!STATIC_TOKEN) return false;
  if (!normalizedToken) return false;
  // timing-safe değil ama statik token deprecated yol — JWT yolu öncelikli
  return String(normalizedToken) === STATIC_TOKEN;
}

function tryJwtMatch(req, token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return null;
  // verifyAuthToken `Authorization: Bearer ...` bekliyor; biz x-admin-token'dan alıyoruz.
  // Token'ı geçici olarak Authorization header'ına yerleştirip verifyAuthToken'ı kullan.
  const fakeReq = {
    headers: {
      ...req.headers,
      authorization: `Bearer ${normalizedToken}`,
    },
  };

  const decoded = verifyAuthToken(fakeReq);
  if (!decoded) return null;

  // Email allowlist kontrolü (varsa). ADMIN_EMAILS boşsa, JWT geçerliliği yeterli sayılır
  // (yalnızca admin-login akışı bu JWT'yi çıkardığı için zaten admin'dir).
  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(String(decoded.email || '').toLowerCase())) {
    return null;
  }

  return decoded;
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
    res.status(401).json({ error: 'Yetkisiz erişim' });
    return false;
  }

  // Aşağı katmanlar isterse req.admin üzerinden kullanıcıya ulaşabilir
  req.admin = ok;
  return true;
}

module.exports = { isAdmin, requireAdmin };
