import "server-only";
import { Resend } from "resend";
import { brand } from "@/brand.config";
import { previewMailer } from "@/lib/mailer";
import { getResendApiKey, shouldUseResend } from "@/lib/mailer/resend";

/**
 * Phase 10 Slice 7c — post-purchase review-prompt email.
 *
 * Sendes 7 dage efter ordrens paidAt (når status='shipped' eller 'paid').
 * Indeholder en stateless token-link til /[locale]/review/[token] hvor kunden
 * kan anmelde uden at logge ind.
 *
 * Idempotens: cron-routen checker ReviewPromptLog før kald — denne funktion
 * sender ubetinget når kaldt.
 */

export type ReviewPromptItem = {
  productName: string;
  productSlug: string;
};

export type ReviewPromptData = {
  to: string;
  recipientName: string;
  orderId: string;
  items: ReviewPromptItem[];
  tokenUrl: string; // fully-qualified URL til /review/[token]
};

export async function sendReviewPromptEmail(data: ReviewPromptData): Promise<{
  messageId: string | null;
}> {
  const rendered = renderReviewPromptHtml(data);

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
      if (result.error) {
        throw new Error(`Resend error: ${result.error.message}`);
      }
      return { messageId: result.data?.id ?? null };
    }
  }

  // Dev/preview fallback — skriv til .mail-previews/
  await previewMailer.sendMail({
    to: data.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  return { messageId: null };
}

function renderReviewPromptHtml(data: ReviewPromptData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Hvordan var dine produkter fra ${brand.storeName}?`;
  const greeting = data.recipientName ? `Hej ${escapeHtml(data.recipientName)}` : "Hej";

  const itemList = data.items
    .map(
      (i) =>
        `<li style="margin: 4px 0;">${escapeHtml(i.productName)}</li>`,
    )
    .join("");

  const itemListText = data.items.map((i) => `· ${i.productName}`).join("\n");

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
            ${greeting} — tak for dit køb!
          </h2>
          <p style="margin:0 0 20px;line-height:1.5;color:${brand.emailColors.ink};">
            Du købte for nogle dage siden. Hvis du har haft tid til at prøve dine
            produkter, vil vi meget gerne høre din mening — det hjælper andre kunder
            med at træffe gode valg.
          </p>
          <p style="margin:0 0 12px;font-weight:700;">Dine produkter:</p>
          <ul style="margin:0 0 24px;padding-left:20px;color:${brand.emailColors.ink};">
            ${itemList}
          </ul>
          <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td style="background:${brand.emailColors.accent};border-radius:10px;">
              <a href="${escapeHtml(data.tokenUrl)}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-weight:900;font-size:15px;">
                Skriv anmeldelse
              </a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:${brand.emailColors.muted};line-height:1.5;">
            Linket virker uden login — vi har genereret en sikker token til denne ordre.
            Du modtog denne mail én gang som tak for dit køb.
          </p>
        </td></tr>
        <tr><td style="background:${brand.emailColors.sand};padding:16px 32px;font-size:11px;color:${brand.emailColors.muted};">
          &copy; ${new Date().getFullYear()} ${escapeHtml(brand.storeName)} · Ordre #${escapeHtml(data.orderId.slice(0, 8))}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greeting} — tak for dit køb!

Du købte for nogle dage siden. Hvis du har haft tid til at prøve dine produkter, vil vi meget gerne høre din mening.

Dine produkter:
${itemListText}

Skriv anmeldelse: ${data.tokenUrl}

Linket virker uden login. Du modtog denne mail én gang som tak for dit køb.

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
