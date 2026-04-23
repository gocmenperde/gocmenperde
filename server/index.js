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
  contentSecurityPolicy: false,
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
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
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
