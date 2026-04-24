const TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_API_KEY || '';

function isAdmin(req) {
  if (!TOKEN) return false;
  const got = req.headers['x-admin-token']
    || req.headers['x-admin-key']
    || req.body?.adminToken
    || req.query?.adminToken;
  return got === TOKEN;
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: 'Yetkisiz erişim' });
    return false;
  }
  return true;
}

module.exports = { isAdmin, requireAdmin };
