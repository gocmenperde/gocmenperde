const { ensureSiteSettingsSchema, getSocialLinks, getCheckoutSettings } = require('../lib/_site_settings');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  try {
    await ensureSiteSettingsSchema();
    const links = await getSocialLinks();
    const checkout = await getCheckoutSettings();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    return res.json({ social: links, ...checkout });
  } catch (e) {
    console.error('[site-settings]', e?.message || e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'db', social: {} });
  }
};
