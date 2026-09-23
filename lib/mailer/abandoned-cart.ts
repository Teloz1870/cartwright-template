import "server-only";
import { Resend } from "resend";
import { brand } from "@/brand.config";
import { previewMailer } from "@/lib/mailer";
import { getResendApiKey, shouldUseResend } from "@/lib/mailer/resend";

/**
 * Abandoned-cart email (WooCommerce-paritet). Sendes til logged-in kunder hvis
 * kurv har ligget inaktiv i N timer. Transactional (cart recovery) — ikke
 * marketing-pixel. Mirror af lib/mailer/review-prompt.ts. Idempotens håndteres
 * af cron'en via AbandonedCartLog.
 */

export type AbandonedCartItem = {
  productName: string;
  quantity: number;
  unitPriceDkk: number;
};

export type AbandonedCartData = {
  to: string;
  recipientName: string | null;
  items: AbandonedCartItem[];
  cartUrl: string;
};

export async function sendAbandonedCartEmail(
  data: AbandonedCartData,
): Promise<{ messageId: string | null }> {
  const rendered = renderAbandonedCartHtml(data);

  if (await shouldUseResend()) {
    const key = await getResendApiKey();
    if (key) {
      const client = new Resend(key);
      const result = await client.emails.send({
        from: `${brand.emails.fromName} <${brand.emails.from}>`,
        to: data.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      if (result.error) throw new Error(`Resend error: ${result.error.message}`);
      return { messageId: result.data?.id ?? null };
    }
  }

  await previewMailer.sendMail({
    to: data.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  return { messageId: null };
}

function kr(oere: number): string {
  return `${(oere / 100).toFixed(0)} kr`;
}

function renderAbandonedCartHtml(data: AbandonedCartData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Du glemte noget i kurven hos ${brand.storeName}`;
  const greeting = data.recipientName ? `Hej ${escapeHtml(data.recipientName)}` : "Hej";

  const itemList = data.items
    .map(
      (i) =>
        `<li style="margin:4px 0;">${escapeHtml(i.productName)}${i.quantity > 1 ? ` ×${i.quantity}` : ""} — ${kr(i.unitPriceDkk * i.quantity)}</li>`,
    )
    .join("");
  const itemListText = data.items
    .map((i) => `· ${i.productName}${i.quantity > 1 ? ` ×${i.quantity}` : ""} — ${kr(i.unitPriceDkk * i.quantity)}`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="da">
<head><meta charset="UTF-8"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${brand.emailColors.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${brand.emailColors.ink};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${brand.emailColors.cream};padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${brand.emailColors.accent};color:#fff;padding:24px 32px;">
          <h1 style="margin:0;font-size:22px;font-weight:900;">${escapeHtml(brand.storeName)}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;font-size:24px;font-weight:900;color:${brand.emailColors.ink};">
            ${greeting} — din kurv venter
          </h2>
          <p style="margin:0 0 20px;line-height:1.5;color:${brand.emailColors.ink};">
            Du lagde nogle varer i kurven men nåede ikke at gøre købet færdigt.
            Vi har gemt den til dig.
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;color:${brand.emailColors.ink};">
            ${itemList}
          </ul>
          <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td style="background:${brand.emailColors.accent};border-radius:10px;">
              <a href="${escapeHtml(data.cartUrl)}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-weight:900;font-size:15px;">
                Fortsæt til kurven
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:${brand.emailColors.sand};padding:16px 32px;font-size:11px;color:${brand.emailColors.muted};">
          &copy; ${new Date().getFullYear()} ${escapeHtml(brand.storeName)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greeting} — din kurv venter

Du lagde nogle varer i kurven men nåede ikke at gøre købet færdigt:
${itemListText}

Fortsæt til kurven: ${data.cartUrl}

— ${brand.storeName}`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
