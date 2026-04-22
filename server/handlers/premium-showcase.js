const fs = require('fs/promises');
const path = require('path');

const PRODUCTS_FILE = path.join(process.cwd(), 'products.json');

const { applyCors } = require('../lib/_cors');
async function readProducts(){
  const raw = await fs.readFile(PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizePremiumFlags(product = {}){
  return {
    ...product,
    isLiveShowcase: Boolean(product.isLiveShowcase),
    isFeatured: Boolean(product.isFeatured)
  };
}

module.exports = async function premiumShowcase(req, res){
  if (applyCors(req, res)) return;
  if(req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });

  try{
    const products = (await readProducts()).map(normalizePremiumFlags).filter(p => p.active !== false);
    const type = String(req.query?.type || 'all').trim().toLowerCase();

    if(type === 'live'){
      return res.status(200).json({
        items: products.filter((p)=>p.isLiveShowcase)
      });
    }

    if(type === 'featured'){
      return res.status(200).json({
        items: products.filter((p)=>p.isFeatured)
      });
    }

    return res.status(200).json({
      live: products.filter((p)=>p.isLiveShowcase),
      featured: products.filter((p)=>p.isFeatured)
    });
  }catch(err){
    console.error('premium-showcase error:', err.message);
    return res.status(500).json({ error:'Premium vitrin verileri alınamadı.' });
  }
};