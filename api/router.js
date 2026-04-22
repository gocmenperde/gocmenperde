const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV !== 'production' && typeof process.loadEnvFile === 'function') {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
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
  'from-you-showcase': () => require('../server/handlers/from-you-showcase'),
  'admin/from-you-showcase': () => require('../server/handlers/admin/from-you-showcase'),
  slider: () => require('../server/handlers/slider'),
  visits: () => require('../server/handlers/visits'),
  'address-data': () => require('../server/handlers/address-data'),
  'stock-alerts': () => require('../server/handlers/stock-alerts'),
  campaigns: () => require('../server/handlers/campaigns'),
  'admin/campaigns': () => require('../server/handlers/admin/campaigns'),
  'premium-showcase': () => require('../server/handlers/premium-showcase'),
  'live-support': () => require('../server/handlers/live-support'),
  'measure-guide': () => require('../server/handlers/measure-guide'),
  'admin/measure-guide': () => require('../server/handlers/admin/measure-guide'),
};

module.exports = async function handler(req, res) {
  const reqUrl = String(req.url || '');
  const parsedUrl = new URL(reqUrl, 'http://localhost');
  const routeParam = parsedUrl.searchParams.get('route') || '';
  const route = String(routeParam).replace(/^\/+|\/+$/g, '');
  const loader = ROUTES[route];

  if (!loader) {
    return res.status(404).json({ error: 'API endpoint bulunamadı.' });
  }

  const endpoint = loader();
  return endpoint(req, res);
};
