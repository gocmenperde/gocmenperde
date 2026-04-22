const RESEND_EMAILS_ENDPOINT = new URL('/emails', 'https://api.resend.com');

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
  if (!configuredFrom) return 'Göçmen Perde <onboarding@resend.dev>';

  const emailMatch = configuredFrom.match(/<?([^<>\s]+@[^<>\s]+)>?$/);
  const email = emailMatch ? emailMatch[1].toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Göçmen Perde <onboarding@resend.dev>';
  }
  return configuredFrom;
}

async function sendResendEmail({ to, subject, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const recipients = normalizeRecipients(to);
  if (!apiKey) return { ok: false, skipped: true, reason: 'missing_api_key', error: 'RESEND_API_KEY tanımlı değil' };
  if (!recipients.length) return { ok: false, skipped: true, reason: 'missing_recipient', error: 'Geçerli alıcı yok' };

  try {
    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resolveFromAddress(),
        to: recipients,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, skipped: false, reason: 'provider_error', status: response.status, error: body.slice(0, 300) };
    }
    return { ok: true, skipped: false };
  } catch (err) {
    return { ok: false, skipped: false, reason: 'mail_error', error: err.message || 'mail_error' };
  }
}

module.exports = { sendResendEmail, normalizeRecipients, normalizeEmail, resolveFromAddress };
