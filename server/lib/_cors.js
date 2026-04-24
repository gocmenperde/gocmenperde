const ALLOWED_ORIGINS = [
  'https://gocmenperde.com.tr',
  'https://www.gocmenperde.com.tr',
];
const ALLOWED_PATTERNS = process.env.NODE_ENV === 'production'
  ? []
  : [/\.vercel\.app$/, /\.replit\.dev$/, /\.replit\.app$/, /^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/];

function applyCors(req, res, { allowAdminHeaders = false } = {}) {
  const origin = req.headers.origin;
  const allowed =
    !!origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_PATTERNS.some((p) => p.test(origin)));

  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  const headers = ['Content-Type', 'Authorization'];
  if (allowAdminHeaders) headers.push('x-admin-token', 'x-admin-key');
  res.setHeader('Access-Control-Allow-Headers', headers.join(', '));

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

module.exports = { applyCors };
