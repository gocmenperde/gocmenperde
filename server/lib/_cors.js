const ALLOWED_ORIGINS = [
  'https://gocmenperde.com.tr',
  'https://www.gocmenperde.com.tr',
];
const ALLOWED_PATTERNS = [/\.replit\.dev$/, /\.replit\.app$/, /^http:\/\/localhost(:\d+)?$/];

function applyCors(req, res, { allowAdminHeaders = false } = {}) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || ALLOWED_PATTERNS.some((p) => p.test(origin));

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  const headers = ['Content-Type', 'Authorization'];
  if (allowAdminHeaders) headers.push('x-admin-key');
  res.setHeader('Access-Control-Allow-Headers', headers.join(', '));

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

module.exports = { applyCors };
