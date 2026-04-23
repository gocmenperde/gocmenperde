const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

if (process.env.NODE_ENV !== 'production' && typeof process.loadEnvFile === 'function') {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip || '';
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.');
  },
  message: { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
});
const orderLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: { action: 'sameorigin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  express.static(path.resolve(__dirname, '..'), {
    setHeaders: (res, filePath) => {
      if (/resimler\//i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        return;
      }
      if (/\.html$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return;
      }
      if (/\.json$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=60');
        return;
      }
      if (/\.(js|css)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=300');
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
app.all('/api/*', async (req, res) => {
  req.url = `/?route=${req.path.replace(/^\/api\/?/, '')}`;
  return routerHandler(req, res);
});

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
