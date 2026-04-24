const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  } catch (_) {}
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.resolve(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
}

if (!process.env.JWT_SECRET && !process.env.AUTH_TOKEN_SECRET) {
  console.error('[FATAL] JWT_SECRET tanımlı değil. Auth çalışmaz.');
}
const app = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      // TODO: inline'ları dış dosyaya çıkarınca 'unsafe-inline' kaldırılacak
      "script-src": ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://www.googletagmanager.com', 'https://www.google-analytics.com'],
      "style-src": ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      "font-src": ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com', 'data:'],
      "img-src": ["'self'", 'data:', 'blob:', 'https:'],
      "connect-src": [
        "'self'",
        'https://www.google-analytics.com',
        'https://www.paytr.com', 'https://*.paytr.com',
        'https://api.cloudinary.com',
        'https://res.cloudinary.com'
      ],
      "frame-src": ["'self'", 'https://www.google.com', 'https://www.youtube.com', 'https://www.paytr.com', 'https://*.paytr.com'],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy-Report-Only', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://www.google-analytics.com https://www.paytr.com https://*.paytr.com https://api.cloudinary.com https://res.cloudinary.com; frame-src 'self' https://www.google.com https://www.youtube.com https://www.paytr.com https://*.paytr.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; report-uri /csp-report");
  next();
});

app.post('/csp-report', express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'] }), (req, res) => {
  console.warn('[csp-report]', JSON.stringify(req.body || {}));
  res.status(204).end();
});

const APP_BOOTSTAMP = new Date().toISOString();
function isLoopbackIp(ip = '') {
  return ip === '127.0.0.1' || ip === '::1';
}

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, ts: Date.now(), bootedAt: APP_BOOTSTAMP });
});

app.get('/readyz', (req, res) => {
  res.status(200).json({ ready: true, pid: process.pid, host: HOST, port: PORT });
});

let _sitemapCache = { ts: 0, body: '' };
app.get('/sitemap.xml', (req, res) => {
  if (Date.now() - _sitemapCache.ts < 60_000 && _sitemapCache.body) {
    return res.type('application/xml').send(_sitemapCache.body);
  }
  try {
    const products = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'products.json'), 'utf8'));
    const base = 'https://gocmenperde.com.tr';
    const staticUrls = ['/', '/hesap.html', '/gizlilik-politikasi.html', '/iade-politikasi.html', '/mesafeli-satis.html'];
    const urls = staticUrls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('');
    const productUrls = products
      .filter((p) => p?.active !== false)
      .map((p) => `<url><loc>${base}/?product=${encodeURIComponent(p.id)}</loc></url>`)
      .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}${productUrls}</urlset>`;
    _sitemapCache = { ts: Date.now(), body: xml };
    res.type('application/xml').send(xml);
  } catch (_) {
    res.status(500).type('text/plain').send('sitemap unavailable');
  }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip || '';
    return isLoopbackIp(ip);
  },
  message: { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
});
const orderLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads'), { maxAge: '30d', immutable: true }));
const WEBP_AVAILABLE = new Set();
try {
  fs.readdirSync(path.resolve(__dirname, '..', 'resimler'))
    .filter((f) => f.endsWith('.webp'))
    .forEach((f) => WEBP_AVAILABLE.add('/resimler/' + f.replace(/\.webp$/i, '')));
} catch (_) {}

app.use((req, res, next) => {
  if (!req.path.startsWith('/resimler/')) return next();
  if (!/\.(jpe?g|png)$/i.test(req.path)) return next();
  if (!String(req.headers.accept || '').includes('image/webp')) return next();
  const baseKey = req.path.replace(/\.(jpe?g|png)$/i, '');
  if (!WEBP_AVAILABLE.has(baseKey)) return next();
  res.type('image/webp');
  res.sendFile(path.join(__dirname, '..', baseKey + '.webp'));
});

const READ_ONLY_GET = /^\/(slider|slider-ads|payment-logos|reviews-summary|premium-showcase|from-you-showcase|measure-guide|address-data|paytr-callback)(\?|\/|$)/;
if (!process.env.VERCEL) {
  app.use('/api/orders', orderLimiter);
  app.use('/api/payment', paymentLimiter);
  app.use('/api', (req, res, next) => {
    if (req.path === '/paytr-callback') return next();
    if (req.method === 'GET' && READ_ONLY_GET.test(req.path)) return next();
    return apiLimiter(req, res, next);
  });
}
const routerHandler = require('../api/router');
app.all('/api/*', routerHandler);

app.use((req, res, next) => {
  if (/^\/(server|api|lib|scripts|node_modules|\.git|\.env)/i.test(req.path)) {
    return res.status(404).end();
  }
  next();
});

app.use(
  express.static(path.resolve(__dirname, '..'), {
    etag: true,
    lastModified: true,
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
      if (/\.html?$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else if (/\.json$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
      } else if (/\.(js|css)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=300');
      } else if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      }
    },
    extensions: ['html'],
    index: 'index.html',
  })
);
const { checkRestocks } = require('./lib/_stock-alert-runner');
const { sendReviewInvites } = require('./lib/_review-invite-runner');
const { ensureReviewSchema } = require('./lib/_reviews_schema');
if (process.env.ALLOW_REVIEW_SEEDING === '1' && process.env.DISABLE_REVIEW_SEED !== '1') {
  setTimeout(() => {
    ensureReviewSchema()
      .catch((e) => console.warn('[review-seed startup]', e?.message));
  }, 3000);
}
const server = app.listen(PORT, HOST, () => {
  console.log(`Sunucu hazır: http://${HOST}:${PORT}`);
});
['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.on(sig, () => {
    console.log(`${sig} alındı, sunucu kapatılıyor...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
});

if (!process.env.VERCEL) {
  setInterval(() => {
    sendReviewInvites().catch((e) => console.warn('[review-invite]', e?.message));
  }, 15 * 60 * 1000);
}
