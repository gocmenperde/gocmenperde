function parseUrlWithFallback(value, base) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    return base ? new URL(raw, base) : new URL(raw);
  } catch (_) {
    return null;
  }
}

module.exports = { parseUrlWithFallback };
