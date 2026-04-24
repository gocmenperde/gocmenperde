const TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_API_KEY || '';

function isAdmin(req) {
  const got = req.headers['x-admin-token'] || req.headers['x-admin-key'] || req.body?.adminToken || req.query?.adminToken;
  if (TOKEN && got === TOKEN) return true;
  try {
    const decoded = require('./_auth-utils').verifyAuthToken({ headers: { authorization: `Bearer ${got}` } });
    return decoded?.role === 'admin';
  } catch {
    return false;
  }
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: 'Yetkisiz erişim' });
    return false;
  }
  return true;
}

module.exports = { isAdmin, requireAdmin };
