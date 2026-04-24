const fs = require('fs/promises');
const path = require('path');
const { pool } = require('./_db');
const { ensureReviewSchema } = require('./_reviews_schema');

const PRODUCTS_PATH = path.join(__dirname, '..', '..', 'products.json');
const TARGET = 8;
const FIRST = ['Ayşe','Fatma','Zeynep','Merve','Elif','Selin','Hülya','Sevgi','Esra','Tuğba','Buse','Damla','Ezgi','Hatice','Pınar','Yasemin','Aslı','Berna','Canan','Mehmet','Ahmet','Mustafa','Ali','Hasan','Hüseyin','Emre','Burak','Onur','Serkan','Tolga','Volkan','Furkan','Kerem','Murat','Selim'];
const LAST = ['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir','Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özkan','Şimşek','Polat','Erdoğan','Avcı','Tekin','Korkmaz','Bulut','Güneş','Tan','Türk'];
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
const pick=(a,r)=>a[Math.floor(r()*a.length)];
function nm(r,used){ for(let i=0;i<10;i++){ const n=pick(FIRST,r)+' '+pick(LAST,r).charAt(0)+'.'; if(!used.has(n)){used.add(n); return n;} } return pick(FIRST,r)+' '+pick(LAST,r).charAt(0)+'.'; }
function dt(r){ return new Date(Date.now()-(Math.floor(r()*180)+7)*86400000); }

async function readProducts(){
  try { return JSON.parse(await fs.readFile(PRODUCTS_PATH,'utf8')); } catch (_) { return []; }
}

async function ensureSeedsForProduct(productId){
  await ensureReviewSchema();
  const c = await pool.query(`SELECT COUNT(*)::int n FROM product_reviews WHERE product_id=$1 AND is_seed=TRUE`,[productId]);
  const have = c.rows[0]?.n||0;
  if(have>=TARGET) return {added:0,productId};
  const need = TARGET-have;
  const r = rng(`gocmen-${productId}-${have}`);
  const used = new Set();
  let added = 0;

  for(let i=0;i<need;i++){
    const t = TPL[Math.floor(r()*TPL.length)];
    const name = nm(r,used);
    const date = dt(r);
    const dup = await pool.query(`SELECT 1 FROM product_reviews WHERE product_id=$1 AND is_seed=TRUE AND name=$2 AND text=$3 LIMIT 1`,[productId,name,t.t]);
    if(dup.rowCount) continue;
    await pool.query(`INSERT INTO product_reviews(product_id,name,rating,text,photos,verified_purchase,status,is_seed,source,created_at,moderated_at) VALUES($1,$2,$3,$4,'[]'::jsonb,FALSE,'approved',TRUE,'seed',$5,$5)`,[productId,name,t.r,t.t,date.toISOString()]);
    added++;
  }
  return {added,productId};
}

async function ensureSeedsForAllProducts(){
  const ps = await readProducts();
  let total = 0;
  let touched = 0;
  for(const p of ps){
    const id = String(p?.id||'').trim();
    if(!id) continue;
    const r = await ensureSeedsForProduct(id);
    if(r.added>0){ total+=r.added; touched++; }
  }
  return { totalAdded: total, productsTouched: touched, productsTotal: ps.length };
}

async function regenerateSeedsForProduct(productId){
  await ensureReviewSchema();
  await pool.query(`DELETE FROM product_reviews WHERE product_id=$1 AND is_seed=TRUE`,[productId]);
  return ensureSeedsForProduct(productId);
}

module.exports = { ensureSeedsForProduct, ensureSeedsForAllProducts, regenerateSeedsForProduct };
