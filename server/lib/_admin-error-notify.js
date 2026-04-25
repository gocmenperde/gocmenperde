const { sendResendEmail } = require('./_resend-mail');

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || '';
let lastSentAt = 0;
const COOLDOWN_MS = 5 * 60 * 1000; // aynı tip hata için 5 dk cooldown

async function notifyAdminError(context, error) {
  if (!ADMIN_EMAIL) return;

  const now = Date.now();
  if (now - lastSentAt < COOLDOWN_MS) return;
  lastSentAt = now;

  try {
    await sendResendEmail({
      to: ADMIN_EMAIL,
      subject: `[gocmenperde] Sunucu hatası: ${context}`,
      html: `<pre style="font-family:monospace;font-size:.85rem;background:#f5f5f5;padding:12px;border-radius:8px;white-space:pre-wrap">${String(error?.stack || error?.message || error).slice(0, 2000)}</pre><p style="color:#666;font-size:.8rem">Cooldown: ${COOLDOWN_MS / 60000}dk. Aynı tip hata bu süre içinde tekrar bildirilmez.</p>`,
    });
  } catch (_) {}
}

module.exports = { notifyAdminError };
