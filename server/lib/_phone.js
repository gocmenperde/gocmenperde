function normalizePhoneTR(value) {
  const raw = String(value || '').replace(/[^\d+]/g, '');
  if (!raw) return '';

  let digits = raw.replace(/^\+/, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('90') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('5') && digits.length === 10) return `+90${digits}`;
  if (digits.startsWith('05') && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.startsWith('0') && digits.length === 11) return `+90${digits.slice(1)}`;
  return '';
}

function isValidPhoneTR(value) {
  const n = normalizePhoneTR(value);
  return /^\+905\d{9}$/.test(n);
}

module.exports = { normalizePhoneTR, isValidPhoneTR };
