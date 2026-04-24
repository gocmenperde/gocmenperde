const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
if (process.env.NODE_ENV !== 'production' && typeof process.loadEnvFile === 'function') {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
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
      "connect-src": ["'self'", 'https://www.google-analytics.com'],
      "frame-src": ["'self'", 'https://www.google.com', 'https://www.youtube.com'],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
}));


const APP_BOOTSTAMP = new Date().toISOString();
function isLoopbackIp(ip = '') {
  return ip === '127.0.0.1' || ip === '::1' || String(ip).startsWith('192.168.');
}

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, ts: Date.now(), bootedAt: APP_BOOTSTAMP });
});

app.get('/readyz', (req, res) => {
  res.status(200).json({ ready: true, pid: process.pid, host: HOST, port: PORT });
});

app.get('/sitemap.xml', (req, res) => {
  try {
    const products = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'products.json'), 'utf8'));
    const base = 'https://gocmenperde.com.tr';
    const staticUrls = ['/', '/hesap.html', '/gizlilik-politikasi.html', '/iade-politikasi.html', '/mesafeli-satis.html'];
    const urls = staticUrls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('');
    const productUrls = products
      .filter((p) => p?.active !== false)
      .map((p) => `<url><loc>${base}/?product=${encodeURIComponent(p.id)}</loc></url>`)
      .join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}${productUrls}</urlset>`);
  } catch (_) {
    res.status(500).type('text/plain').send('sitemap unavailable');
  }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
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
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads'), { maxAge: '30d', immutable: true }));
app.use((req, res, next) => {
  if (!req.path.startsWith('/resimler/')) return next();
  if (!/\.(jpe?g|png)$/i.test(req.path)) return next();
  const accepts = String(req.headers.accept || '');
  if (!accepts.includes('image/webp')) return next();
  const webp = path.join(__dirname, '..', req.path.replace(/\.(jpe?g|png)$/i, '.webp'));
  fs.access(webp, fs.constants.R_OK, (err) => {
    if (err) return next();
    res.type('image/webp');
    res.sendFile(webp);
  });
});
app.use(
  express.static(path.resolve(__dirname, '..'), {
    etag: true,
    lastModified: true,
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
  })
);
if (!process.env.VERCEL) {
  app.use('/api/orders', orderLimiter);
  app.use('/api/payment', paymentLimiter);
  app.use('/api', apiLimiter);
}
const routerHandler = require('../api/router');
const { checkRestocks } = require('./lib/_stock-alert-runner');
const { sendReviewInvites } = require('./lib/_review-invite-runner');
const { ensureSeedsForAllProducts } = require('./lib/_seed-reviews');
const { ensureReviewSchema } = require('./lib/_reviews_schema');
const STOCK_CHECK_INTERVAL_MS = Number(process.env.STOCK_CHECK_INTERVAL_MS || 60000);
if (process.env.DISABLE_STOCK_CHECK !== '1') {
  setInterval(() => {
    checkRestocks()
      .then((r) => {
        if (r.restockedCount) console.log(`[stock-check] restocked=${r.restockedCount} sent=${r.sent} failed=${r.failed}`);
      })
      .catch((e) => console.warn('[stock-check] err', e?.message));
  }, STOCK_CHECK_INTERVAL_MS);
}
if (process.env.DISABLE_REVIEW_SEED !== '1') {
  setTimeout(() => {
    ensureReviewSchema()
      .then(() => ensureSeedsForAllProducts())
      .then((r) => {
        if (r.totalAdded) console.log(`[review-seed] startup eklendi=${r.totalAdded} ürün=${r.productsTouched}/${r.productsTotal}`);
      })
      .catch((e) => console.warn('[review-seed startup]', e?.message));
  }, 3000);
  setInterval(() => {
    ensureReviewSchema()
      .then(() => ensureSeedsForAllProducts())
      .then((r) => {
        if (r.totalAdded) console.log(`[review-seed cron] eklendi=${r.totalAdded} ürün=${r.productsTouched}/${r.productsTotal}`);
      })
      .catch((e) => console.warn('[review-seed cron]', e?.message));
  }, Number(process.env.REVIEW_SEED_INTERVAL_MS || 5 * 60 * 1000));
}
app.all('/api/*', routerHandler);
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

setInterval(() => {
  sendReviewInvites().catch((e) => console.warn('[review-invite]', e?.message));
}, 15 * 60 * 1000);
