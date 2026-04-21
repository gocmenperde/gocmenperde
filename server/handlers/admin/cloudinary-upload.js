
const crypto = require('crypto');

const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || process.env.X_ADMIN_KEY || 'gocmen1993').trim();
const MAX_DATA_URL_SIZE_BYTES = 12 * 1024 * 1024; // ~12MB
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg','image/jpg','image/png','image/webp','image/avif','image/gif']);

function parseCloudinaryUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'cloudinary:') return null;

    const apiKey = decodeURIComponent(parsed.username || '').trim();
    const apiSecret = decodeURIComponent(parsed.password || '').trim();
    const cloudName = decodeURIComponent(parsed.hostname || '').trim();

    return { cloudName, apiKey, apiSecret };
  } catch (_) {
    return null;
  }
}

function normalizeEnvValue(value) {
  if (value === undefined || value === null) return '';

  const normalized = String(value)
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();

  if (!normalized) return '';

  const lowered = normalized.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null') return '';

  return normalized;
}

function pickFirstEnvValue(keys) {
  for (const key of keys) {
    const value = normalizeEnvValue(process.env[key]);
    if (value) return value;
  }
  return '';
}

function readCloudinaryConfig() {
  const cloudinaryUrl = pickFirstEnvValue([
    'CLOUDINARY_URL',
    'CLOUDINARY_API_URL',
    'NEXT_PUBLIC_CLOUDINARY_URL',
  ]);
  const parsedFromUrl = parseCloudinaryUrl(cloudinaryUrl);

  const cloudName = pickFirstEnvValue([
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_CLOUDNAME',
    'CLOUD_NAME',
    'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',
    'NEXT_PUBLIC_CLOUDINARY_CLOUDNAME',
  ]) || parsedFromUrl?.cloudName || '';

  const apiKey = pickFirstEnvValue([
    'CLOUDINARY_API_KEY',
    'API_KEY',
    'NEXT_PUBLIC_CLOUDINARY_API_KEY',
  ]) || parsedFromUrl?.apiKey || '';

  const apiSecret = pickFirstEnvValue([
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_SECRET',
    'API_SECRET',
    'NEXT_PUBLIC_CLOUDINARY_API_SECRET',
  ]) || parsedFromUrl?.apiSecret || '';

  return { cloudName, apiKey, apiSecret, hasCloudinaryUrl: Boolean(parsedFromUrl) };
}

function getMissingConfigKeys(cloudinaryConfig) {
  const missing = [];
  if (!cloudinaryConfig.cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!cloudinaryConfig.apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!cloudinaryConfig.apiSecret) missing.push('CLOUDINARY_API_SECRET');
  return missing;
}

function buildCloudinaryConnection(cloudinaryConfig) {
  return {
    cloud_name: cloudinaryConfig.cloudName,
    api_key: cloudinaryConfig.apiKey,
    api_secret: cloudinaryConfig.apiSecret,
    upload_endpoint: `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
  };
}

function resolveUploadBody(reqBody) {
  const rawBody = reqBody && typeof reqBody === 'object' ? reqBody : {};
  const dataUrl = String(
    rawBody.dataUrl
    || rawBody.file
    || rawBody.image
    || (Array.isArray(rawBody.files) ? rawBody.files[0] : '')
    || ''
  ).trim();
  const fileName = String(rawBody.fileName || rawBody.filename || rawBody.name || 'image');
  const prefix = String(rawBody.prefix || 'image');
  return { dataUrl, fileName, prefix };
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
  return `${safePrefix}/${stamp}-${randomPart}-${baseName}`;
}

function extractMimeTypeFromDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,/i.exec(String(dataUrl || ''));
  return String(match?.[1] || '').toLowerCase();
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
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.headers['x-admin-key'] !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Yetkisiz.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Desteklenmeyen method.' });
  }

  const cloudinaryConfig = readCloudinaryConfig();
  const missingConfig = getMissingConfigKeys(cloudinaryConfig);
  if (missingConfig.length) {
    const nodeEnv = String(process.env.NODE_ENV || 'unknown').trim();
    console.error('[cloudinary-upload] Cloudinary env değişkenleri eksik veya undefined.', {
      missing: missingConfig,
      nodeEnv,
      vercelEnv: process.env.VERCEL_ENV || null,
      hasCloudName: Boolean(pickFirstEnvValue(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_CLOUDNAME', 'CLOUD_NAME', 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'NEXT_PUBLIC_CLOUDINARY_CLOUDNAME'])),
      hasApiKey: Boolean(pickFirstEnvValue(['CLOUDINARY_API_KEY', 'API_KEY', 'NEXT_PUBLIC_CLOUDINARY_API_KEY'])),
      hasApiSecret: Boolean(pickFirstEnvValue(['CLOUDINARY_API_SECRET', 'CLOUDINARY_SECRET', 'API_SECRET', 'NEXT_PUBLIC_CLOUDINARY_API_SECRET'])),
      hasCloudinaryUrl: Boolean(pickFirstEnvValue(['CLOUDINARY_URL', 'CLOUDINARY_API_URL', 'NEXT_PUBLIC_CLOUDINARY_URL'])),
      cloudinaryUrlParsable: cloudinaryConfig.hasCloudinaryUrl,
      hint: 'Vercel Project Settings > Environment Variables alanındaki değerlerin ilgili ortama (Production/Preview) atanıp redeploy edildiğini doğrulayın. CLOUDINARY_URL kullanıyorsanız format cloudinary://API_KEY:API_SECRET@CLOUD_NAME olmalıdır.',
    });

    return res.status(503).json({
      error: 'Görsel yükleme servisi şu an yapılandırılamadı. Sunucu loglarını kontrol edin.',
    });
  }

  const { dataUrl, fileName, prefix } = resolveUploadBody(req.body);

  if (!dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Geçersiz görsel verisi. dataUrl veya file alanı data:image/* formatında olmalı.' });
  }

  const mimeType = extractMimeTypeFromDataUrl(dataUrl);
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({ error: 'Desteklenmeyen görsel formatı. JPG, PNG, WEBP, AVIF veya GIF kullanın.' });
  }

  if (Buffer.byteLength(dataUrl, 'utf8') > MAX_DATA_URL_SIZE_BYTES) {
    return res.status(413).json({ error: 'Görsel çok büyük. Lütfen daha düşük boyutlu bir dosya yükleyin.' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'gocmenperde';
    const publicId = buildPublicId(prefix, fileName);
    const signParams = { folder, public_id: publicId, timestamp };
    const cloudinaryConnection = buildCloudinaryConnection(cloudinaryConfig);
    const signature = createSignature(signParams, cloudinaryConnection.api_secret);

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('api_key', cloudinaryConnection.api_key);
    formData.append('timestamp', String(timestamp));
    formData.append('folder', folder);
    formData.append('public_id', publicId);
    formData.append('signature', signature);

    const cloudinaryRes = await fetch(cloudinaryConnection.upload_endpoint, {
      method: 'POST',
      body: formData,
    });

    const payload = await cloudinaryRes.json().catch(() => ({}));
    if (!cloudinaryRes.ok) {
      return res.status(502).json({ error: payload?.error?.message || 'Cloudinary yükleme hatası.' });
    }

    return res.status(200).json({
      success: true,
      imageUrl: payload.secure_url || payload.url || '',
      publicId: payload.public_id || publicId,
    });
  } catch (err) {
    return res.status(500).json({ error: `Cloudinary yükleme başarısız: ${err.message}` });
  }
};
