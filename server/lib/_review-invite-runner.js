const { pool } = require('./_db');
const { sendResendEmail } = require('./_resend-mail');
const { ensureReviewSchema } = require('./_reviews_schema');

function inviteHtml({ productName, token }) {
  return `<h2>Deneyiminizi paylaşır mısınız?</h2>
<p><strong>${productName}</strong> ürününü kullandığınızı umuyoruz. 30 saniyenizi alacak kısa bir değerlendirme bizim için çok değerli.</p>
<a href="https://gocmenperde.com.tr/?reviewToken=${token}" style="background:#c8a35a;color:#1a1a1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Yorum Yaz</a>
<p style="font-size:.8rem;color:#888">Yorum yazınca otomatik onaylanır. Bu link size özeldir.</p>`;
}

async function sendReviewInvites() {
  await ensureReviewSchema();
  const result = await pool.query(
    'SELECT id, email, product_name, token FROM review_invites WHERE sent_at IS NULL AND scheduled_at <= NOW() ORDER BY scheduled_at ASC LIMIT 50'
  );
  for (const row of result.rows) {
    const sent = await sendResendEmail({
      to: row.email,
      subject: 'Göçmen Perde | Ürün deneyiminizi paylaşın',
      html: inviteHtml({ productName: row.product_name, token: row.token }),
    });
    if (sent.ok) {
      await pool.query('UPDATE review_invites SET sent_at=NOW() WHERE id=$1', [row.id]);
    }
  }
  return { scanned: result.rowCount || 0 };
}

module.exports = { sendReviewInvites };
