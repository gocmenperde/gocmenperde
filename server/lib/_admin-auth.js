const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'gocmen1993';

function requireAdminKey(req, res) {
  if (req.headers['x-admin-key'] !== ADMIN_SECRET_KEY) {
    res.status(403).json({ error: 'Yetkisiz erişim.' });
    return false;
  }
  return true;
}

function isAdminKey(req) {
  return req.headers['x-admin-key'] === ADMIN_SECRET_KEY;
}

module.exports = { requireAdminKey, isAdminKey };
