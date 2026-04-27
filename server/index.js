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

// Friendly URL'leri tüm ortamlarda garanti et (Express + Vercel parity).
const staticHtmlAliases = {
  '/mesafeli-satis': 'mesafeli-satis.html',
  '/mesafeli-satis-sozlesmesi': 'mesafeli-satis.html',
  '/iade-politikasi': 'iade-politikasi.html',
  '/cayma-kosullari': 'iade-politikasi.html',
  '/cayma-kosullari.html': 'iade-politikasi.html',
  '/gizlilik-politikasi': 'gizlilik-politikasi.html',
  '/hesapim': 'hesabim.html',
  '/hesap': 'hesap.html',
  '/admin': 'admin.html',
};

Object.entries(staticHtmlAliases).forEach(([route, fileName]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', fileName));
  });
});

app.get('/sitemap.xml', (req, res) => {
  try {
    const products = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'products.json'), 'utf8'));
    const base = 'https://gocmenperde.com.tr';
    const staticUrls = ['/', '/hesap.html', '/gizlilik-politikasi', '/gizlilik-politikasi.html', '/iade-politikasi', '/iade-politikasi.html', '/mesafeli-satis', '/mesafeli-satis.html'];
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
app.use(express.json({ limit: '4mb' }));
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
const { ensureReviewSchema } = require('./lib/_reviews_schema');
const { ensureSeedsForAllProducts } = require('./lib/_seed-reviews');
const { ensureSiteSettingsSchema } = require('./lib/_site_settings');
// Başlangıçta schema garanti et + tüm ürünler için eksik sahte yorumları doldur.
setTimeout(() => {
  ensureSiteSettingsSchema().catch((e) => console.warn('[site-settings startup]', e?.message));
  ensureReviewSchema()
    .then(() => ensureSeedsForAllProducts())
    .then((r) => {
      if (r?.totalAdded > 0) {
        console.log(`[review-seed startup] ${r.totalAdded} sahte yorum eklendi (${r.productsTouched} ürün)`);
      }
    })
    .catch((e) => console.warn('[review-seed startup]', e?.message));
}, 5000);
// Vercel olmayan ortamda (Replit, self-host) her 30 dakikada bir yeni eklenen ürünler için seed çalıştır.
const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

if (!process.env.VERCEL) {
  setInterval(() => {
    ensureSeedsForAllProducts()
      .then((r) => {
        if (r?.totalAdded > 0) {
          console.log(`[review-seed cron] ${r.totalAdded} sahte yorum eklendi (${r.productsTouched} ürün)`);
        }
      })
      .catch((e) => console.warn('[review-seed cron]', e?.message));
  }, 30 * 60 * 1000);
}
app.use('/api/site-settings', wrap(require('./handlers/site-settings')));
app.use('/api/admin/site-settings', wrap(require('./handlers/admin/site-settings')));
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

if (!process.env.VERCEL) {
  setInterval(() => {
    sendReviewInvites().catch((e) => console.warn('[review-invite]', e?.message));
  }, 15 * 60 * 1000);
}
