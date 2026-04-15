const express = require('express');
const path = require('path');
const compression = require('compression');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const router = require('./api/router');

const app = express();
const PORT = process.env.PORT || 5000;
const RESIMLER_DIR = path.join(__dirname, 'resimler');
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'gocmen1993';

// ─── Güvenlik başlıkları ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ─── Sıkıştırma (gzip) ───────────────────────────────────────────────────────
app.use(compression());

// ─── Rate limiting (auth için) ────────────────────────────────────────────────
const authAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

function rateLimitMiddleware(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = authAttempts.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.start = now;
  } else {
    entry.count++;
  }
  authAttempts.set(ip, entry);
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Çok fazla istek. Lütfen bekleyin.' });
  }
  next();
}

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── Resim yükleme (admin — sharp ile otomatik boyutlandırma) ──────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.post('/api/admin-upload', rateLimitMiddleware, upload.array('files', 20), async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'Yetkisiz.' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Dosya bulunamadı.' });
  }

  if (!fs.existsSync(RESIMLER_DIR)) {
    fs.mkdirSync(RESIMLER_DIR, { recursive: true });
  }

  const results = [];
  for (const file of req.files) {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${timestamp}-${safeName.replace(/\.[^.]+$/, '')}.webp`;
    const filePath = path.join(RESIMLER_DIR, fileName);
    try {
      await sharp(file.buffer)
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(filePath);
      results.push({ success: true, path: `resimler/${fileName}`, name: file.originalname });
    } catch (err) {
      results.push({ success: false, name: file.originalname, error: String(err.message) });
    }
  }

  return res.status(200).json({ success: true, results });
});

// ─── Ürün & Kategori JSON kayıt (admin) ──────────────────────────────────────
app.post('/api/admin-save-json', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'Yetkisiz.' });
  }
  const { type, data } = req.body || {};
  if (!['products', 'categories'].includes(type) || !data) {
    return res.status(400).json({ error: 'Geçersiz istek.' });
  }
  const filePath = path.join(__dirname, `${type}.json`);
  try {
    const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    JSON.parse(json);
    fs.writeFileSync(filePath, json, 'utf8');
    return res.status(200).json({ success: true, file: `${type}.json` });
  } catch (err) {
    return res.status(500).json({ error: 'Kayıt başarısız: ' + err.message });
  }
});

// ─── Uygulama API rotaları ────────────────────────────────────────────────────
app.use('/api', rateLimitMiddleware, async (req, res) => {
  const route = req.path.replace(/^\/+|\/+$/g, '');
  req.query = { ...req.query, route };
  return router(req, res);
});

// ─── Statik dosyalar (önbellek + lazy loading desteği) ───────────────────────
app.use('/resimler', express.static(RESIMLER_DIR, {
  maxAge: '7d',
  immutable: true,
  etag: true,
}));

app.use(express.static(path.join(__dirname), {
  maxAge: '1h',
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ─── HTML sayfaları ───────────────────────────────────────────────────────────
const HTML_ROUTES = {
  '/hesabim': 'hesabim.html',
  '/hesap': 'hesap.html',
  '/admin': 'admin.html',
  '/gizlilik-politikasi': 'gizlilik-politikasi.html',
  '/iade-politikasi': 'iade-politikasi.html',
  '/mesafeli-satis': 'mesafeli-satis.html',
};

app.get('/admin.html', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

for (const [route, file] of Object.entries(HTML_ROUTES)) {
  app.get(route, (_req, res) => res.sendFile(path.join(__dirname, file)));
}

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Global hata yakalayıcı ───────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[HATA]', err.message);
  res.status(500).json({ error: 'Sunucu hatası.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
