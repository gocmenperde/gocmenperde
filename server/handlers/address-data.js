const TURKIYE_API_BASE = 'https://turkiyeapi.dev/api/v1/districts';

function toComparable(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .trim();
}

function uniqTrimmedStrings(values) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((v) => String(v || '').trim()).filter(Boolean))
  );
}

function normalizeStreetValues(entry) {
  return uniqTrimmedStrings([
    ...(Array.isArray(entry?.streets) ? entry.streets : []),
    ...(Array.isArray(entry?.roads) ? entry.roads : []),
    ...(Array.isArray(entry?.avenues) ? entry.avenues : []),
    ...(Array.isArray(entry?.bulvards) ? entry.bulvards : []),
    ...(Array.isArray(entry?.boulevards) ? entry.boulevards : []),
    ...(Array.isArray(entry?.streets_and_roads) ? entry.streets_and_roads : []),
    ...(Array.isArray(entry?.caddeSokaklar) ? entry.caddeSokaklar : []),
  ]);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const city = String(req.query?.city || '').trim();
  const district = String(req.query?.district || '').trim();

  if (!city || !district) {
    return res.status(400).json({ error: 'city ve district zorunludur.' });
  }

  try {
    const endpoint = `${TURKIYE_API_BASE}?name=${encodeURIComponent(district)}&province=${encodeURIComponent(city)}`;
    const upstream = await fetch(endpoint);
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Adres verisi alınamadı.' });
    }
    const payload = await upstream.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const matchedDistrict =
      rows.find((row) => toComparable(row?.name) === toComparable(district)) || rows[0] || {};

    const neighborhoodsRaw = Array.isArray(matchedDistrict?.neighborhoods) ? matchedDistrict.neighborhoods : [];
    const streetsByNeighborhood = {};
    neighborhoodsRaw.forEach((entry) => {
      const neighborhoodName = String(entry?.name || entry || '').trim();
      if (!neighborhoodName) return;
      streetsByNeighborhood[neighborhoodName] = normalizeStreetValues(entry);
    });

    return res.status(200).json({
      success: true,
      city,
      district,
      neighborhoods: uniqTrimmedStrings(neighborhoodsRaw.map((entry) => entry?.name || entry)),
      streetsByNeighborhood,
    });
  } catch (_) {
    return res.status(500).json({ error: 'Adres verisi alınırken hata oluştu.' });
  }
};
