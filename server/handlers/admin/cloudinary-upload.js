const crypto = require('crypto');

// Bu key sabit kalabilir veya bunu da env'ye taşıyabilirsin
const ADMIN_API_KEY = 'gocmen1993';

/**
 * Vercel ortam değişkenlerini en güvenli ve statik şekilde okur.
 */
function readCloudinaryConfig() {
  // Next.js build sırasında process.env.DEGISKEN_ADI şeklinde açık yazımı tercih eder.
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET || '').trim();

  return { cloudName, apiKey, apiSecret };
}

function sanitizeFileName(value) {
  return String(value || 'image')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'image';
}

function buildPublicId(prefix, fileName) {
  const safePrefix = String(prefix || 'product').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const stamp = Date.now();
  const randomPart = crypto.randomUUID().slice(0, 8);
  const baseName = sanitizeFileName(fileName).replace(/\.[^.]+$/, '');
  
  return `gocmenperde/${safePrefix}/${stamp}-${randomPart}-${baseName}`;
}

function createSignature(params, apiSecret) {
  const toSign = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
}

module.exports = async function handler(req, res) {
  // CORS Ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Yetki Kontrolü
  if (req.headers['x-admin-key'] !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Yetkisiz erişim.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST desteklenir.' });
  }

  // Yapılandırmayı oku
  const config = readCloudinaryConfig();

  // Eksik değişken kontrolü (Hata ayıklama için detaylı log bırakır)
  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    console.error('[Config Error] Eksik Değişkenler:', {
      cloudName: !!config.cloudName,
      apiKey: !!config.apiKey,
      apiSecret: !!config.apiSecret
    });
    return res.status(503).json({ error: 'Sunucu yapılandırması eksik. Lütfen Vercel Env ayarlarını kontrol edin.' });
  }

  const { dataUrl, fileName, prefix } = req.body;

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Geçersiz görsel formatı (Base64 dataUrl gerekli).' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'gocmenperde';
    const publicId = buildPublicId(prefix, fileName);

    // İmza (Signature) Parametreleri
    const signParams = {
      folder,
      public_id: publicId,
      timestamp
    };

    const signature = createSignature(signParams, config.apiSecret);

    // Cloudinary'ye gönderilecek Form verisi
    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('api_key', config.apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('folder', folder);
    formData.append('public_id', publicId);
    formData.append('signature', signature);

    const cloudinaryRes = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const result = await cloudinaryRes.json();

    if (!cloudinaryRes.ok) {
      throw new Error(result.error?.message || 'Cloudinary yükleme hatası.');
    }

    return res.status(200).json({
      success: true,
      imageUrl: result.secure_url || result.url,
      publicId: result.public_id
    });

  } catch (err) {
    console.error('[Upload Error]:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
