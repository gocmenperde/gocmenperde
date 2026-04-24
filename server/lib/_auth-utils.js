const crypto = require('crypto');

const FALLBACK_TOKEN_SECRET = 'gocmenperde-admin-jwt-fallback-2026';
const TOKEN_SECRET = String(
  process.env.JWT_SECRET || process.env.AUTH_TOKEN_SECRET || FALLBACK_TOKEN_SECRET
).trim();
const USER_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const LEGACY_SALT = 'gocmen_salt_2024';
let warnedMissingTokenSecret = false;

function ensureTokenSecret() {
  if (TOKEN_SECRET) return true;
  if (!warnedMissingTokenSecret) {
    warnedMissingTokenSecret = true;
    console.warn('JWT_SECRET (veya AUTH_TOKEN_SECRET) tanımlı değil. Token doğrulama/devamlılık sorunları yaşanabilir.');
  }
  return false;
}

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64urlDecode(value) {
  return Buffer.from(value, 'base64url').toString();
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function signPayload(payload) {
  if (!ensureTokenSecret()) return '';
  const body = base64urlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySignedToken(token) {
  if (!ensureTokenSecret()) return null;
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  if (!safeEqual(expected, signature)) return null;

  const decoded = JSON.parse(base64urlDecode(body));
  if (!decoded?.id || !decoded?.email || !decoded?.exp) return null;
  if (Date.now() > Number(decoded.exp)) return null;
  return decoded;
}

function parseLegacyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    if (!decoded?.id || !decoded?.email) return null;
    return decoded;
  } catch {
    return null;
  }
}

function createAuthToken(user) {
  const now = Date.now();
  const isAdmin = user?.isAdmin === true;
  const expiresIn = isAdmin ? ADMIN_TOKEN_TTL_MS : USER_TOKEN_TTL_MS;
  return signPayload({
    id: Number(user.id),
    email: String(user.email || '').toLowerCase(),
    isAdmin,
    iat: now,
    exp: now + expiresIn,
    v: 2,
  });
}

function verifyAuthToken(req) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const raw = auth.slice(7).trim();
    return verifySignedToken(raw) || parseLegacyToken(raw);
  } catch {
    return null;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const normalized = String(password || '');
  const hash = crypto.pbkdf2Sync(normalized, salt, 120000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPassword(password, storedHash = '') {
  const raw = String(storedHash || '');
  if (raw.startsWith('pbkdf2$')) {
    const [, salt, hash] = raw.split('$');
    if (!salt || !hash) return false;
    const next = crypto.pbkdf2Sync(String(password || ''), salt, 120000, 64, 'sha512').toString('hex');
    return safeEqual(next, hash);
  }

  const legacy = crypto.createHash('sha256').update(String(password || '') + LEGACY_SALT).digest('hex');
  return safeEqual(legacy, raw);
}

module.exports = {
  createAuthToken,
  verifyAuthToken,
  hashPassword,
  verifyPassword,
};
