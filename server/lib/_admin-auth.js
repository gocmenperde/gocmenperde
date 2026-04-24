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
  return (
    req.headers['x-admin-token'] ||
    req.headers['x-admin-key'] ||
    req.body?.adminToken ||
    req.query?.adminToken ||
    ''
  );
}

function tryStaticMatch(token) {
  if (!STATIC_TOKEN) return false;
  if (!token) return false;
  // timing-safe değil ama statik token deprecated yol — JWT yolu öncelikli
  return String(token) === STATIC_TOKEN;
}

function tryJwtMatch(req, token) {
  if (!token) return null;
  // verifyAuthToken `Authorization: Bearer ...` bekliyor; biz x-admin-token'dan alıyoruz.
  // Token'ı geçici olarak Authorization header'ına yerleştirip verifyAuthToken'ı kullan.
  const fakeReq = {
    headers: {
      ...req.headers,
      authorization: `Bearer ${token}`,
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
