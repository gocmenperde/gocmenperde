const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); } catch {}
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.resolve(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
}

function validateBasicBody(req, res){
  if(!['POST','PUT','PATCH'].includes(String(req.method || '').toUpperCase())) return true;
  const body = req.body;
  if(!body || typeof body !== 'object' || Array.isArray(body)){
    res.status(400).json({ error: 'Geçersiz body formatı.' });
    return false;
  }
  const serialized = JSON.stringify(body);
  if(serialized.length > 8 * 1024 * 1024){
    res.status(400).json({ error: 'Body çok büyük.' });
    return false;
  }
  return true;
}

const ROUTES = {
  auth: () => require('../server/handlers/auth'),
  customer: () => require('../server/handlers/customer'),
  customers: () => require('../server/handlers/customers'),
  favorites: () => require('../server/handlers/favorites'),
  orders: () => require('../server/handlers/orders'),
  payment: () => require('../server/handlers/payment'),
  'paytr-callback': () => require('../server/handlers/paytr-callback'),
  'paytr-refund': () => require('../server/handlers/paytr-refund'),
  'paytr-report': () => require('../server/handlers/paytr-report'),
  'slider-ads': () => require('../server/handlers/slider-ads'),
  'admin/slider-ads': () => require('../server/handlers/admin/slider-ads'),
  'admin/cloudinary-upload': () => require('../server/handlers/admin/cloudinary-upload'),
  'payment-logos': () => require('../server/handlers/payment-logos'),
  'admin/payment-logos': () => require('../server/handlers/admin/payment-logos'),
  'from-you-showcase': () => require('../server/handlers/from-you-showcase'),
  'admin/from-you-showcase': () => require('../server/handlers/admin/from-you-showcase'),
  slider: () => require('../server/handlers/slider'),
  visits: () => require('../server/handlers/visits'),
  'address-data': () => require('../server/handlers/address-data'),
  'stock-alerts': () => require('../server/handlers/stock-alerts'),
  'admin/stock-alerts': () => require('../server/handlers/admin/stock-alerts'),
  campaigns: () => require('../server/handlers/campaigns'),
  'admin/campaigns': () => require('../server/handlers/admin/campaigns'),
  'premium-showcase': () => require('../server/handlers/premium-showcase'),
  'live-support': () => require('../server/handlers/live-support'),
  'measure-guide': () => require('../server/handlers/measure-guide'),
  reviews: () => require('../server/handlers/reviews'),
  'reviews-summary': () => require('../server/handlers/reviews-summary'),
  'review-invite-token': () => require('../server/handlers/review-invite-token'),
  'admin/reviews': () => require('../server/handlers/admin/reviews'),
  'admin/measure-guide': () => require('../server/handlers/admin/measure-guide'),
  'site-settings': () => require('../server/handlers/site-settings'),
  'admin/site-settings': () => require('../server/handlers/admin/site-settings'),
};

module.exports = async function handler(req, res) {
  const rewrittenRoute = typeof req.query?.route === 'string' ? req.query.route : '';
  const pathRoute = String(req.path || req.url || '')
    .replace(/^\/api\/?/, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^router\/?/, '');
  const route = (rewrittenRoute || pathRoute || '').replace(/^\/+|\/+$/g, '');
  const loader = ROUTES[route];

  if (!loader) {
    return res.status(404).json({ error: 'API endpoint bulunamadı.' });
  }

  if(!validateBasicBody(req, res)) return;
  const endpoint = loader();
  try {
    return await endpoint(req, res);
  } catch (err) {
    console.error('[api-router]', route, err);
    return res.status(500).json({ error: err?.message || 'Sunucu hatası', code: err?.code || null });
  }
};
