const crypto = require('crypto');

function cfg() {
  const url = process.env.CLOUDINARY_URL || '';
  let cloud = process.env.CLOUDINARY_CLOUD_NAME || '';
  let key = process.env.CLOUDINARY_API_KEY || '';
  let secret = process.env.CLOUDINARY_API_SECRET || '';
  if (!cloud && url) {
    const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
    if (m) {
      key = m[1];
      secret = m[2];
      cloud = m[3];
    }
  }
  if (!cloud || !key || !secret) return null;
  return { cloud, key, secret };
}

async function uploadDataUrl(dataUrl, folder = 'reviews') {
  const c = cfg();
  if (!c) throw new Error('Cloudinary yapılandırılmamış');
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(paramsToSign + c.secret).digest('hex');
  const form = new FormData();
  form.append('file', dataUrl);
  form.append('api_key', c.key);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const j = await res.json();
  if (!res.ok || !j.secure_url) {
    throw new Error(j?.error?.message || 'Cloudinary yükleme başarısız');
  }
  return j.secure_url;
}

module.exports = { uploadDataUrl, isConfigured: () => !!cfg() };
