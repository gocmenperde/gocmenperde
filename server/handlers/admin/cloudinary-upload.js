const crypto = require('crypto');

const ADMIN_API_KEY = 'gocmen1993';

/**
 * Cloudinary yapılandırmasını güvenli bir şekilde okur.
 * Vercel'deki Environment Variables alanından beslenir.
 */
function readCloudinaryConfig() {
  // Next.js'in build sırasında bu değerleri statik olarak koda gömebilmesi için 
  // direkt process.env üzerinden erişim sağlıyoruz.
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET || '').trim();

  return {
    cloudName,
    apiKey,
    apiSecret
  };
}

function getMissingConfigKeys(config) {
  const missing = [];
  if (!config.cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!config.apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!config.apiSecret) missing.push('CLOUDINARY_API_SECRET');
  return missing;
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
  const safePrefix = String(prefix || 'image').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'image';
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-admin-key'] !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Yetkisiz.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Desteklenmeyen method.' });
  }

  const config = readCloudinaryConfig();
  const missingKeys = getMissingConfigKeys(config);

  if (missingKeys.length > 0) {
    console.error('[cloudinary-upload] Eksik yapılandırma:', missingKeys);
    return res.status(503).json({
      error: 'Sistem yapılandırması eksik (Env vars).',
      details: missingKeys
    });
  }

  const { dataUrl, fileName, prefix } = req.body;

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Geçersiz görsel verisi.' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'gocmenperde';
    const publicId = buildPublicId(prefix || 'product', fileName || 'image');
    
    const signParams = {
      folder,
      public_id: publicId,
      timestamp
    };

    const signature = createSignature(signParams, config.apiSecret);

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

    const payload = await cloudinaryRes.json();
    
    if (!cloudinaryRes.ok) {
      return res.status(502).json({ error: payload?.error?.message || 'Cloudinary hatası.' });
    }

    return res.status(200).json({
      success: true,
      imageUrl: payload.secure_url || payload.url,
      publicId: payload.public_id
    });

  } catch (err) {
    console.error('[cloudinary-upload] Hata:', err);
    return res.status(500).json({ error: `Sunucu hatası: ${err.message}` });
  }
};
