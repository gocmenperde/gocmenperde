
const crypto = require('crypto');
const { parseUrlWithFallback } = require('../../lib/_safe-url');

const { requireAdmin } = require('../../lib/_admin-auth');
const MAX_DATA_URL_SIZE_BYTES = 12 * 1024 * 1024; // ~12MB
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg','image/jpg','image/png','image/webp','image/avif','image/gif','image/svg+xml']);

const { applyCors } = require('../../lib/_cors');
function parseCloudinaryUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsed = parseUrlWithFallback(raw);
  if (!parsed || parsed.protocol !== 'cloudinary:') return null;

  const apiKey = decodeURIComponent(parsed.username || '').trim();
  const apiSecret = decodeURIComponent(parsed.password || '').trim();
  const cloudName = decodeURIComponent(parsed.hostname || '').trim();

  return { cloudName, apiKey, apiSecret };
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

function pickFromMatchingEnvKeys(patterns) {
  const regexList = Array.isArray(patterns) ? patterns : [];
  const envEntries = Object.entries(process.env || {});

  for (const [key, rawValue] of envEntries) {
    if (!regexList.some((regex) => regex && regex.test(key))) continue;
    const value = normalizeEnvValue(rawValue);
    if (value) return value;
  }

  return '';
}

function listMatchingEnvKeys(patterns) {
  const regexList = Array.isArray(patterns) ? patterns : [];
  return Object.keys(process.env || {}).filter((key) => regexList.some((regex) => regex && regex.test(key)));
}

function readCloudinaryConfig() {
  const cloudinaryUrl = pickFirstEnvValue([
    'CLOUDINARY_URL',
    'CLOUDINARY_API_URL',
      ]) || pickFromMatchingEnvKeys([
    /cloudinary.*url/i,
  ]);
  const parsedFromUrl = parseCloudinaryUrl(cloudinaryUrl);

  const cloudName = pickFirstEnvValue([
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_CLOUDNAME',
    'CLOUD_NAME',
          ]) || pickFromMatchingEnvKeys([
    /cloudinary.*cloud.*name/i,
    /^cloud_name$/i,
  ]) || parsedFromUrl?.cloudName || '';

  const apiKey = pickFirstEnvValue([
    'CLOUDINARY_API_KEY',
    'API_KEY',
      ]) || pickFromMatchingEnvKeys([
    /cloudinary.*api.*key/i,
  ]) || parsedFromUrl?.apiKey || '';

  const apiSecret = pickFirstEnvValue([
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_SECRET',
    'API_SECRET',
      ]) || pickFromMatchingEnvKeys([
    /cloudinary.*api.*secret/i,
    /cloudinary.*secret/i,
    /^api_secret$/i,
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
  const mimeType = String(rawBody.mimeType || rawBody.type || '').trim().toLowerCase();
  const mode = String(rawBody.mode || '').trim().toLowerCase();
  return { dataUrl, fileName, prefix, mimeType, mode };
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

function buildSignedUploadPayload({ cloudinaryConfig, fileName, prefix, folder = 'gocmenperde' }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = buildPublicId(prefix, fileName);
  const signParams = { folder, public_id: publicId, timestamp };
  const cloudinaryConnection = buildCloudinaryConnection(cloudinaryConfig);
  const signature = createSignature(signParams, cloudinaryConnection.api_secret);

  return {
    uploadUrl: cloudinaryConnection.upload_endpoint,
    apiKey: cloudinaryConnection.api_key,
    timestamp,
    folder,
    publicId,
    signature,
    cloudName: cloudinaryConnection.cloud_name,
  };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, { allowAdminHeaders: true })) return;
  console.log('[cloudinary-upload] header keys:', Object.keys(req.headers || {}));
  console.log('[cloudinary-upload] x-admin-token:', req.headers['x-admin-token']?.slice(0, 20));
  if (!requireAdmin(req, res)) {
    console.error('[cloudinary-upload] requireAdmin REJECTED.', {
      hasXAdminToken: Boolean(req.headers['x-admin-token']),
      tokenPreview: String(req.headers['x-admin-token'] || '').slice(0, 30),
      tokenLength: String(req.headers['x-admin-token'] || '').length,
      tokenHasDot: String(req.headers['x-admin-token'] || '').includes('.'),
    });
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Desteklenmeyen method.' });
  }

  const cloudinaryConfig = readCloudinaryConfig();
  const missingConfig = getMissingConfigKeys(cloudinaryConfig);
  if (missingConfig.length) {
    const nodeEnv = String(process.env.NODE_ENV || 'unknown').trim();
    const detectedCloudinaryEnvKeys = listMatchingEnvKeys([
      /cloudinary/i,
      /^cloud_name$/i,
      /^api_key$/i,
      /^api_secret$/i,
    ]);
    console.error('[cloudinary-upload] Cloudinary env değişkenleri eksik veya undefined.', {
      missing: missingConfig,
      nodeEnv,
      vercelEnv: process.env.VERCEL_ENV || null,
      hasCloudName: Boolean(pickFirstEnvValue(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_CLOUDNAME', 'CLOUD_NAME', 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'NEXT_PUBLIC_CLOUDINARY_CLOUDNAME'])),
      hasApiKey: Boolean(pickFirstEnvValue(['CLOUDINARY_API_KEY', 'API_KEY', 'NEXT_PUBLIC_CLOUDINARY_API_KEY'])),
      hasApiSecret: Boolean(pickFirstEnvValue(['CLOUDINARY_API_SECRET', 'CLOUDINARY_SECRET', 'API_SECRET', 'NEXT_PUBLIC_CLOUDINARY_API_SECRET'])),
      hasCloudinaryUrl: Boolean(pickFirstEnvValue(['CLOUDINARY_URL', 'CLOUDINARY_API_URL', 'NEXT_PUBLIC_CLOUDINARY_URL'])),
      cloudinaryUrlParsable: cloudinaryConfig.hasCloudinaryUrl,
      detectedCloudinaryEnvKeys,
      hint: 'Vercel Project Settings > Environment Variables alanındaki değerlerin ilgili ortama (Production/Preview) atanıp redeploy edildiğini doğrulayın. Server-side endpoint için NEXT_PUBLIC_ prefix zorunlu değildir. CLOUDINARY_URL kullanıyorsanız format cloudinary://API_KEY:API_SECRET@CLOUD_NAME olmalıdır.',
    });

    return res.status(503).json({
      error: 'Görsel yükleme servisi şu an yapılandırılamadı. Değişken adları doğruysa son deploy sonrası logları kontrol edin.',
    });
  }

  const { dataUrl, fileName, prefix, mimeType, mode } = resolveUploadBody(req.body);

  if (!dataUrl) {
    if (mimeType && !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({ error: 'Desteklenmeyen görsel formatı. JPG, PNG, WEBP, AVIF veya GIF kullanın.' });
    }

    const signedUpload = buildSignedUploadPayload({ cloudinaryConfig, fileName, prefix });
    return res.status(200).json({
      success: true,
      mode: mode || 'signed-upload',
      ...signedUpload,
    });
  }

  if (!dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Geçersiz görsel verisi. dataUrl veya file alanı data:image/* formatında olmalı.' });
  }

  const dataUrlMimeType = extractMimeTypeFromDataUrl(dataUrl);
  if (!ALLOWED_IMAGE_MIME_TYPES.has(dataUrlMimeType)) {
    return res.status(400).json({ error: 'Desteklenmeyen görsel formatı. JPG, PNG, WEBP, AVIF veya GIF kullanın.' });
  }

  if (Buffer.byteLength(dataUrl, 'utf8') > MAX_DATA_URL_SIZE_BYTES) {
    return res.status(413).json({ error: 'Görsel çok büyük. Lütfen daha düşük boyutlu bir dosya yükleyin.' });
  }

  try {
    const signedUpload = buildSignedUploadPayload({ cloudinaryConfig, fileName, prefix });

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('api_key', signedUpload.apiKey);
    formData.append('timestamp', String(signedUpload.timestamp));
    formData.append('folder', signedUpload.folder);
    formData.append('public_id', signedUpload.publicId);
    formData.append('signature', signedUpload.signature);

    const cloudinaryRes = await fetch(signedUpload.uploadUrl, {
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
      publicId: payload.public_id || signedUpload.publicId,
    });
  } catch (err) {
    return res.status(500).json({ error: `Cloudinary yükleme başarısız: ${err.message}` });
  }
};
