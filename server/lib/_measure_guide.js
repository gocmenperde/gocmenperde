const { pool } = require('./_db');

const DEFAULT_MEASURE_GUIDE = {
  title: 'Doğru Ölçü Nasıl Alınır?',
  contentHtml: `
    <p>Perde ölçüsü alırken <strong>kornişten mermer seviyesine</strong> ve kullanım senaryonuza göre net ölçü girmeniz gerekir.</p>
    <h4>1) En (Genişlik) Ölçüsü</h4>
    <ul>
      <li>Kornişin sağ ve sol bitiş noktaları arasını ölçün.</li>
      <li>Duvar taşması isteniyorsa her iki yanda +10/+20 cm pay bırakabilirsiniz.</li>
      <li>Fon perde için en ölçüsünü kanat başına ayrı değerlendirin.</li>
    </ul>
    <h4>2) Boy (Yükseklik) Ölçüsü</h4>
    <ul>
      <li>Korniş altından zemine/mermere kadar olan mesafeyi ölçün.</li>
      <li>Tül perde için zeminden 1-2 cm yukarıda kalacak boy önerilir.</li>
      <li>Stor/zebra modellerde kasa başlangıcından bitiş noktasına kadar ölçün.</li>
    </ul>
    <h4>3) Pratik Kontrol Listesi</h4>
    <ul>
      <li>Ölçüyü en az 2 farklı noktadan tekrar alın.</li>
      <li>Ölçüleri <strong>metre cinsinden</strong> ve ondalıklı (örn: 2.45) girin.</li>
      <li>Petek, pencere kolu veya süpürgelik engellerini not edin.</li>
    </ul>
  `,
  images: [
    { url: 'resimler/foto2.jpg', alt: 'Perde ölçü alma şeması', sortOrder: 0 },
  ],
};

async function ensureMeasureGuideSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS measure_guide (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      title TEXT NOT NULL DEFAULT 'Doğru Ölçü Nasıl Alınır?',
      content_html TEXT NOT NULL DEFAULT '',
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT measure_guide_singleton CHECK (id = 1)
    )
  `);

  await pool.query(
    `INSERT INTO measure_guide (id, title, content_html, images)
     VALUES (1, $1, $2, $3::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_MEASURE_GUIDE.title, DEFAULT_MEASURE_GUIDE.contentHtml, JSON.stringify(DEFAULT_MEASURE_GUIDE.images)]
  );
}

function normalizeGuidePayload(payload = {}) {
  const title = String(payload.title || '').trim().slice(0, 120);
  const contentHtml = String(payload.contentHtml || '').trim();
  const imagesRaw = Array.isArray(payload.images) ? payload.images : [];

  const images = imagesRaw
    .map((item, idx) => ({
      url: String(item?.url || '').trim(),
      alt: String(item?.alt || '').trim().slice(0, 160),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : idx,
    }))
    .filter((item) => item.url);

  if (!title) return { ok: false, error: 'Başlık zorunludur.' };
  if (!contentHtml) return { ok: false, error: 'Rehber metni zorunludur.' };

  return {
    ok: true,
    value: {
      title,
      contentHtml,
      images,
    },
  };
}

function mapGuideRow(row = {}) {
  const images = Array.isArray(row.images) ? row.images : [];
  const normalizedImages = images
    .map((img, idx) => ({
      url: String(img?.url || '').trim(),
      alt: String(img?.alt || '').trim(),
      sortOrder: Number.isFinite(Number(img?.sortOrder)) ? Number(img.sortOrder) : idx,
    }))
    .filter((img) => img.url)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    title: String(row.title || DEFAULT_MEASURE_GUIDE.title),
    contentHtml: String(row.content_html || row.contentHtml || DEFAULT_MEASURE_GUIDE.contentHtml),
    images: normalizedImages,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

module.exports = {
  DEFAULT_MEASURE_GUIDE,
  ensureMeasureGuideSchema,
  normalizeGuidePayload,
  mapGuideRow,
};
