import "server-only";

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { brand } from "@/brand.config";
import { renderMagicLinkHtml } from "@/lib/auth/email-template";
import { formatPriceDkk } from "@/lib/format";

export type OrderEmailData = {
  orderId: string;
  email: string;
  shippingName: string;
  items: { productName: string; quantity: number; unitPriceDkk: number }[];
  subtotalDkk: number;
  discountDkk: number;
  shippingDkk: number;
  totalDkk: number;
};

export type MagicLinkEmailData = { email: string; url: string };

type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface Mailer {
  sendOrderConfirmation(data: OrderEmailData): Promise<void>;
}

// Palette via brand.emailColors (single source of truth — sync manuelt med
// themes/<slug>.css ved palette-ændring). Email-klienter understøtter ikke
// CSS-variabler så vi interpolerer hex i template-literals.
//   accent → header bg + accent-text + dashed border
//   cream  → page bg
//   sand   → footer bg + table border
//   ink    → body text
//   muted  → secondary text
export function renderOrderConfirmationHtml(data: OrderEmailData): string {
  const itemRows = data.items
    .map((item) => {
      const lineTotalOere = item.quantity * item.unitPriceDkk;
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${brand.emailColors.sand};">${item.productName}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${brand.emailColors.sand}; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${brand.emailColors.sand}; text-align: right;">${formatPriceDkk(item.unitPriceDkk)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${brand.emailColors.sand}; text-align: right;">${formatPriceDkk(lineTotalOere)}</td>
        </tr>`;
    })
    .join("");

  const discountRow =
    data.discountDkk > 0
      ? `
        <tr>
          <td colspan="3" style="padding: 6px 12px; text-align: right; color: ${brand.emailColors.muted};">Rabat:</td>
          <td style="padding: 6px 12px; text-align: right; color: #c0392b;">−${formatPriceDkk(data.discountDkk)}</td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ordrebekræftelse – ${brand.storeName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${brand.emailColors.cream}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: ${brand.emailColors.ink};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${brand.emailColors.cream}; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid ${brand.emailColors.sand}; border-radius: 8px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color: ${brand.emailColors.accent}; padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px;">${brand.storeName}</h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 32px 32px 16px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 900; color: ${brand.emailColors.accent};">Tak for din ordre!</h2>
              <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6;">
                Hej ${data.shippingName},
              </p>
              <p style="margin: 0; font-size: 15px; line-height: 1.6;">
                Vi har modtaget din ordre og behandler den hurtigst muligt.
                En bekræftelse er sendt til <strong>${data.email}</strong>.
              </p>
            </td>
          </tr>

          <!-- Order number -->
          <tr>
            <td style="padding: 8px 32px 24px 32px;">
              <p style="margin: 0; font-size: 13px; color: ${brand.emailColors.muted};">
                Ordrenummer: <strong style="color: ${brand.emailColors.ink};">${data.orderId}</strong>
              </p>
            </td>
          </tr>

          <!-- Items table -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background-color: ${brand.emailColors.sand};">
                    <th style="padding: 10px 12px; text-align: left; font-weight: 700; color: ${brand.emailColors.ink};">Produkt</th>
                    <th style="padding: 10px 12px; text-align: center; font-weight: 700; color: ${brand.emailColors.ink};">Antal</th>
                    <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${brand.emailColors.ink};">Stykpris</th>
                    <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${brand.emailColors.ink};">Linje total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                <tr>
                  <td colspan="3" style="padding: 6px 12px; text-align: right; color: ${brand.emailColors.muted};">Subtotal:</td>
                  <td style="padding: 6px 12px; text-align: right; width: 110px;">${formatPriceDkk(data.subtotalDkk)}</td>
                </tr>
                ${discountRow}
                <tr>
                  <td colspan="3" style="padding: 6px 12px; text-align: right; color: ${brand.emailColors.muted};">Fragt:</td>
                  <td style="padding: 6px 12px; text-align: right;">${data.shippingDkk === 0 ? "Gratis" : formatPriceDkk(data.shippingDkk)}</td>
                </tr>
                <tr style="border-top: 2px solid ${brand.emailColors.accent};">
                  <td colspan="3" style="padding: 10px 12px; text-align: right; font-weight: 900; font-size: 15px; color: ${brand.emailColors.ink};">Total:</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: 900; font-size: 15px; color: ${brand.emailColors.accent};">${formatPriceDkk(data.totalDkk)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${brand.emailColors.sand}; padding: 20px 32px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: ${brand.emailColors.muted}; line-height: 1.6;">
                Har du spørgsmål til din ordre? Skriv til os på
                <a href="mailto:${brand.emails.support}" style="color: ${brand.emailColors.accent}; text-decoration: none; font-weight: 700;">${brand.emails.support}</a>
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: ${brand.emailColors.muted};">
                &copy; ${new Date().getFullYear()} ${brand.storeName}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export class PreviewMailer implements Mailer {
  async sendMail(message: MailMessage): Promise<void> {
    const dir = join(process.cwd(), ".mail-previews");
    const safeTo = message.to.replace(/[^a-z0-9._-]/gi, "_");
    const filename = `mail-${Date.now()}-${safeTo}.html`;
    const filepath = join(dir, filename);

    await mkdir(dir, { recursive: true });
    await writeFile(filepath, message.html, "utf-8");

    console.log(
      `[mailer] Email "${message.subject}" til ${message.to} skrevet til .mail-previews/${filename}`,
    );
  }

  async sendOrderConfirmation(data: OrderEmailData): Promise<void> {
    const html = renderOrderConfirmationHtml(data);
    const dir = join(process.cwd(), ".mail-previews");
    const filename = `ordre-${data.orderId}.html`;
    const filepath = join(dir, filename);

    await mkdir(dir, { recursive: true });
    await writeFile(filepath, html, "utf-8");

    console.log(
      `[mailer] Ordrebekræftelse skrevet til .mail-previews/${filename}`,
    );
  }
}

export const previewMailer = new PreviewMailer();

/**
 * Phase 4: dynamic mailer-picker. Bruger ResendMailer i production hvis
 * RESEND_API_KEY er sat (DB eller env), ellers PreviewMailer. Ved Resend-
 * fejl falder vi tilbage til PreviewMailer + log (så vi i hvert fald har
 * record af forsøgt mail). Caller bruger getMailer() per-send.
 */
export async function getMailer(): Promise<Mailer> {
  const { shouldUseResend, ResendMailer } = await import("@/lib/mailer/resend");
  if (await shouldUseResend()) {
    return new ResendMailer();
  }
  return previewMailer;
}

/**
 * Backward-compat: behold `mailer` export men gør det proxy der dynamic-
 * picker hver gang. Sub-faser bruger denne via mailer.sendOrderConfirmation().
 */
export const mailer: Mailer = {
  async sendOrderConfirmation(data: OrderEmailData) {
    const picked = await getMailer();
    try {
      await picked.sendOrderConfirmation(data);
    } catch (err) {
      if (picked !== previewMailer) {
        // Resend fejlede — log + fallback til PreviewMailer så vi mindst har
        // record af forsøget i .mail-previews/. Mail kan re-trigges manuelt.
        console.error("[mailer] Resend failed, falling back to preview:", err);
        await previewMailer.sendOrderConfirmation(data);
      } else {
        throw err;
      }
    }
  },
};

export async function sendMagicLinkEmail(
  data: MagicLinkEmailData,
): Promise<void> {
  const rendered = renderMagicLinkHtml({
    email: data.email,
    url: data.url,
    expiresMinutes: 15,
  });

  // Phase 4: try Resend i production, fallback til PreviewMailer
  const { shouldUseResend, ResendMailer } = await import("@/lib/mailer/resend");
  if (await shouldUseResend()) {
    try {
      const resend = new ResendMailer();
      await resend.sendMagicLink(data);
      return;
    } catch (err) {
      console.error(
        "[mailer] Resend magic-link failed, falling back to preview:",
        err,
      );
    }
  }

  await previewMailer.sendMail({
    to: data.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
