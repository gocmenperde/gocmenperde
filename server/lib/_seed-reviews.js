const fs = require('fs/promises');
const path = require('path');
const { pool } = require('./_db');
const { ensureReviewSchema } = require('./_reviews_schema');

const PRODUCTS_PATH = path.join(__dirname, '..', '..', 'products.json');
const TARGET = 8;
const FIRST = ['Ayşe','Fatma','Zeynep','Merve','Elif','Selin','Hülya','Sevgi','Esra','Tuğba','Buse','Damla','Ezgi','Hatice','Pınar','Yasemin','Aslı','Berna','Canan','Mehmet','Ahmet','Mustafa','Ali','Hasan','Hüseyin','Emre','Burak','Onur','Serkan','Tolga','Volkan','Furkan','Kerem','Murat','Selim'];
const LAST = ['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir','Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özkan','Şimşek','Polat','Erdoğan','Avcı','Tekin','Korkmaz','Bulut','Güneş','Tan','Türk'];
const SEED_CHECK_TTL_MS = 30 * 60 * 1000;
const _seedCheckCache = new Map();

function isSeedingAllowed(){
  return process.env.ALLOW_REVIEW_SEEDING === '1';
}

const TPL = [
  {r:5,t:'Beklediğimden çok daha kaliteli geldi. Dikim çok düzgün, ölçüler tam tutuyor. Bursa içi aynı gün teslim de büyük artı, teşekkürler!'},
  {r:5,t:'Fiyat performans olarak harika. Renk fotoğraftaki gibi, salonumuza çok yakıştı. Tavsiye ederim.'},
  {r:5,t:'Üçüncü siparişimi verdim, hiç hayal kırıklığına uğratmadılar. Müşteri hizmetleri çok ilgili, kumaş kalitesi premium.'},
  {r:4,t:'Genel olarak memnun kaldım. Birkaç gün geç geldi ama ürün gerçekten kaliteli. Tekrar tercih edebilirim.'},
  {r:5,t:'Annem çok beğendi, ev tamamen değişti. Kumaş dökümlü ve ışığı güzel süzüyor. Paketleme çok özenliydi.'},
  {r:5,t:'Mağazada baktığımdan daha güzel çıktı. Dikiş işçiliği kusursuz, kenarları çok temiz. Profesyonel bir ekipleri var.'},
  {r:4,t:'Renk biraz daha açık geldi ama yine de güzel duruyor. Kumaş kalitesi iyi, fiyatına değer.'},
  {r:5,t:'Komşum tavsiye etmişti, şimdi ben de herkese öneriyorum. Aynı gün Bursa içi teslimat olağanüstü.'},
  {r:5,t:'30 yıllık tecrübe boşuna değilmiş. Ölçü almaya gelen usta çok profesyoneldi, perdelerin oturuşu mükemmel.'},
  {r:4,t:'Sipariş takip süreci güzel, kargo bilgilendirmeleri zamanında. Ürün de fotoğraflardaki gibi.'},
  {r:5,t:'Yıllardır beklediğim kalitede bir ürün. Çok uzun yıllar dayanacak gibi duruyor.'},
  {r:5,t:'Hem fiyat hem kalite hem hizmet kusursuz. Yeni evimizin tüm perdelerini buradan aldık.'},
  {r:4,t:'İlk siparişimde küçük bir ölçü sorunu oldu, hemen değiştirip yeniden gönderdiler. İade süreci çok hızlı işledi.'},
  {r:5,t:'Modeli kataloğa baktığımdan çok daha şık duruyor. Salonumuz tamamen değişti. Kesinlikle tavsiye ederim.'},
  {r:5,t:'Ütüye gerek kalmadan bile takılır gibi geldi, çok iyi paketlenmiş. Renk ve dokuma kalitesi süper.'},
  {r:4,t:'Stor perdem çok güzel ama mekanizmayı takmak biraz zor oldu. Yardımcı olunca hallettik. Ürün gayet kaliteli.'},
];

function rng(seed){ let h=2166136261>>>0; for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i); h=Math.imul(h,16777619)>>>0;} return ()=>{h=Math.imul(h^(h>>>15),2246822507)>>>0; h=Math.imul(h^(h>>>13),3266489909)>>>0; return ((h^=h>>>16)>>>0)/4294967295;}; }

function shuffled(arr, r){
  const out = [...arr];
  for(let i = out.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dt(r, i){
  const days = 7 + ((i * 17) + Math.floor(r() * 23)) % 180;
  return new Date(Date.now() - days * 86400000);
}

function formatName(first, last){
  const a = String(last || '').charAt(0).toUpperCase();
  const b = String(last || '').charAt(1).toUpperCase();
  return b ? `${first} ${a}.${b}.` : `${first} ${a}.`;
}

function buildNamePool(r){
  const sf = shuffled(FIRST, r);
  const sl = shuffled(LAST, r);
  const pool = [];
  for(const f of sf){
    for(const l of sl){
      pool.push(formatName(f, l));
    }
  }
  return pool;
}

function getProductId(product){
  return String(product?.id || product?.slug || product?.productId || product?.code || '').trim();
}

async function readProducts(){
  try {
    if (!isSeedingAllowed()) return { added: 0, productId, lastError: 'seeding disabled' }; return JSON.parse(await fs.readFile(PRODUCTS_PATH,'utf8')); } catch (_) { return []; }
}

async function ensureSeedsForProduct(productId){
  try {
    const now = Date.now();
    const lastCheckedAt = _seedCheckCache.get(productId) || 0;
    if (lastCheckedAt && (now - lastCheckedAt) < SEED_CHECK_TTL_MS) {
      return { added: 0, productId, lastError: null, skippedByCache: true };
    }
    _seedCheckCache.set(productId, now);
    if (!isSeedingAllowed()) return { totalAdded: 0, productsTouched: 0, productsTotal: 0, lastError: 'seeding disabled' };
  if (!isSeedingAllowed()) return { added: 0, productId, lastError: 'seeding disabled' };
  await ensureReviewSchema();
    const existing = await pool.query(
      `SELECT name, text FROM product_reviews WHERE product_id=$1 AND is_seed=TRUE`,
      [productId]
    );
    const have = existing.rowCount || 0;
    if (have >= TARGET) return { added: 0, productId, lastError: null };

    const need = TARGET - have;
    const r = rng(`gocmen-${productId}-${have}`);
    const existingPairs = new Set(existing.rows.map((row) => `${row.name}|||${row.text}`));
    const usedNames = new Set(existing.rows.map((row) => String(row.name || '').trim()).filter(Boolean));

    const names = buildNamePool(r).filter((name) => !usedNames.has(name)).slice(0, need * 3);
    const templates = shuffled(TPL, r);
    const rowsToInsert = [];

    for (let i = 0; i < need; i++) {
      const tpl = templates[i % templates.length];
      let name = names[i] || names[i % names.length] || formatName(FIRST[i % FIRST.length], LAST[i % LAST.length]);
      if (!name || usedNames.has(name)) {
        for (const candidate of buildNamePool(r)) {
          if (!usedNames.has(candidate)) { name = candidate; break; }
        }
      }
      const key = `${name}|||${tpl.t}`;
      if (existingPairs.has(key)) continue;
      usedNames.add(name);
      existingPairs.add(key);
      const when = dt(r, i).toISOString();
      rowsToInsert.push({ name, rating: tpl.r, text: tpl.t, createdAt: when });
    }

    if (!rowsToInsert.length) return { added: 0, productId, lastError: null };

    const values = [];
    const args = [];
    let n = 1;
    for (const row of rowsToInsert) {
      values.push(`($${n++},$${n++},$${n++},$${n++},'[]'::jsonb,FALSE,'approved',TRUE,'seed',$${n++},$${n++})`);
      args.push(productId, row.name, row.rating, row.text, row.createdAt, row.createdAt);
    }

    await pool.query(
      `INSERT INTO product_reviews(product_id,name,rating,text,photos,verified_purchase,status,is_seed,source,created_at,moderated_at)
       VALUES ${values.join(',')}`,
      args
    );

    return { added: rowsToInsert.length, productId, lastError: null };
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[seed]', productId, message);
    return { added: 0, productId, lastError: message };
  }
}

async function ensureSeedsForAllProducts(){
  await ensureReviewSchema();
  const psRaw = await readProducts();
  const ps = Array.isArray(psRaw) ? psRaw.filter((p) => p && p.active !== false) : [];
  let total = 0;
  let touched = 0;
  let lastError = null;

  console.log('[seed] product sample keys', Object.keys(ps[0] || {}), 'first id =', getProductId(ps[0]));

  for (const p of ps) {
    const id = getProductId(p);
    if (!id) continue;
    const r = await ensureSeedsForProduct(id);
    if (r.added > 0) {
      total += r.added;
      touched++;
    }
    if (r.lastError) lastError = r.lastError;
  }

  const summary = { totalAdded: total, productsTouched: touched, productsTotal: ps.length, lastError };
  console.log(`[review-seed] totalAdded=${summary.totalAdded} productsTouched=${summary.productsTouched} productsTotal=${summary.productsTotal}`);
  return summary;
}

async function regenerateSeedsForProduct(productId){
  await ensureReviewSchema();
  await pool.query(`DELETE FROM product_reviews WHERE product_id=$1 AND is_seed=TRUE`,[productId]);
  return ensureSeedsForProduct(productId);
}

module.exports = { ensureSeedsForProduct, ensureSeedsForAllProducts, regenerateSeedsForProduct };
