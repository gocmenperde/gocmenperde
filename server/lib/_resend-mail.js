const RESEND_EMAILS_ENDPOINT = new URL('/emails', 'https://api.resend.com');
const RESEND_DEFAULT_FROM = 'Göçmen Perde <onboarding@resend.dev>';

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function splitRecipientInput(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return String(value)
    .split(/[;,\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRecipients(to) {
  const list = splitRecipientInput(to).flatMap((item) => splitRecipientInput(item));
  const clean = list.map((item) => normalizeEmail(item)).filter(Boolean);
  return Array.from(new Set(clean));
}

function resolveFromAddress() {
  const configuredFrom = String(process.env.ORDER_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '').trim();
  if (!configuredFrom) return RESEND_DEFAULT_FROM;

  const emailMatch = configuredFrom.match(/<?([^<>\s]+@[^<>\s]+)>?$/);
  const email = emailMatch ? emailMatch[1].toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return RESEND_DEFAULT_FROM;
  }
  return configuredFrom;
}

function parseResendError(bodyText) {
  if (!bodyText) return '';
  try {
    const parsed = JSON.parse(bodyText);
    if (typeof parsed?.message === 'string' && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) return parsed.error.message.trim();
  } catch (_) {
    // JSON değilse raw body kullanılacak
  }
  return bodyText.slice(0, 300).trim();
}

async function postResendEmail({ apiKey, payload }) {
  const response = await fetch(RESEND_EMAILS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    return {
      ok: false,
      skipped: false,
      reason: 'provider_error',
      status: response.status,
      error: parseResendError(bodyText),
    };
  }

  return { ok: true, skipped: false };
}

async function sendResendEmail({ to, subject, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const recipients = normalizeRecipients(to);
  if (!apiKey) return { ok: false, skipped: true, reason: 'missing_api_key', error: 'RESEND_API_KEY tanımlı değil' };
  if (!recipients.length) return { ok: false, skipped: true, reason: 'missing_recipient', error: 'Geçerli alıcı yok' };

  try {
    const from = resolveFromAddress();
    const primaryResult = await postResendEmail({
      apiKey,
      payload: { from, to: recipients, subject, html },
    });
    if (primaryResult.ok) return primaryResult;

    const shouldRetryWithDefaultFrom =
      from !== RESEND_DEFAULT_FROM
      && primaryResult.reason === 'provider_error'
      && [400, 401, 403, 422].includes(Number(primaryResult.status));

    if (!shouldRetryWithDefaultFrom) return primaryResult;

    const fallbackResult = await postResendEmail({
      apiKey,
      payload: { from: RESEND_DEFAULT_FROM, to: recipients, subject, html },
    });
    if (fallbackResult.ok) {
      return {
        ok: true,
        skipped: false,
        usedFallbackFrom: true,
        fallbackFrom: RESEND_DEFAULT_FROM,
      };
    }
    return fallbackResult;
  } catch (err) {
    return { ok: false, skipped: false, reason: 'mail_error', error: err.message || 'mail_error' };
  }
}

module.exports = { sendResendEmail, normalizeRecipients, normalizeEmail, resolveFromAddress };
