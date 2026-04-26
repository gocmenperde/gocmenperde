const { requireAdmin } = require('../../lib/_admin-auth');
const { applyCors } = require('../../lib/_cors');
const {
  ensureSiteSettingsSchema,
  getSocialLinks,
  setSocialLinks,
  getCheckoutSettings,
  setCheckoutSettings,
} = require('../../lib/_site_settings');

module.exports = async function handler(req, res) {
  if (applyCors(req, res, { allowAdminHeaders: true })) return;
  if (!requireAdmin(req, res)) return;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  try {
    await ensureSiteSettingsSchema();

    if (req.method === 'GET') {
      const links = await getSocialLinks();
      const checkout = await getCheckoutSettings();
      return res.status(200).json({ social: links, ...checkout });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body || {};
      let links = await getSocialLinks();
      let checkout = await getCheckoutSettings();
      if (body.social && typeof body.social === 'object') {
        links = await setSocialLinks(body.social);
      }
      const hasCheckoutFields = ['giftWrapFee', 'freeShipThreshold', 'memberDiscount', 'deliveryRange']
        .some((k) => k in body);
      if (hasCheckoutFields) {
        checkout = await setCheckoutSettings(body);
      }
      return res.status(200).json({ social: links, ...checkout });
    }

    return res.status(405).json({ error: 'method' });
  } catch (e) {
    if (e?.status === 400 && /^invalid url:/.test(String(e.message || ''))) {
      return res.status(400).json({ error: e.message });
    }
    console.error('[admin/site-settings]', e);
    return res.status(500).json({ error: 'db', message: e?.message || 'unknown' });
  }
};
