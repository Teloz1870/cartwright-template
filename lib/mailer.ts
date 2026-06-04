import "server-only";

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { brand } from "@/brand.config";
import {
  renderMagicLinkHtml,
  renderPasswordResetHtml,
} from "@/lib/auth/email-template";
import { formatPrice, formatPriceDkk } from "@/lib/format";

export type OrderEmailData = {
  orderId: string;
  email: string;
  shippingName: string;
  items: { productName: string; quantity: number; unitPriceDkk: number }[];
  subtotalDkk: number;
  discountDkk: number;
  shippingDkk: number;
  totalDkk: number;
  /**
   * Presentment currency the customer was charged in (ISO-4217). Omit (or set
   * to base) → the receipt renders in base currency, identical to before.
   * Amounts above stay base-currency minor units; formatPrice converts them
   * via the same rate-table checkout used.
   */
  currency?: string;
};

export type MagicLinkEmailData = { email: string; url: string };

// Ordrestyring: transactional ordre-emails ud over kvitteringen.
export type ShippingEmailData = {
  orderId: string;
  email: string;
  shippingName: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  items: { productName: string; quantity: number }[];
};

export type RefundEmailData = {
  orderId: string;
  email: string;
  shippingName: string;
  refundDkk: number;
  partial: boolean;
};

export type ReturnEmailData = {
  orderId: string;
  email: string;
  shippingName: string;
  items: { productName: string; quantity: number }[];
};

export type MailMessage = {
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
  // Render every amount in the order's presentment currency (base when unset).
  // formatPrice shares the checkout rate-table, so the receipt matches the
  // charge. Sent immediately after the order, so live rate == snapshot rate.
  const fmt = (oere: number) =>
    formatPrice(oere, data.currency ? { currency: data.currency } : {});

  const itemRows = data.items
    .map((item) => {
      const lineTotalOere = item.quantity * item.unitPriceDkk;
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${brand.emailColors.sand};">${item.productName}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${brand.emailColors.sand}; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${brand.emailColors.sand}; text-align: right;">${fmt(item.unitPriceDkk)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid ${brand.emailColors.sand}; text-align: right;">${fmt(lineTotalOere)}</td>
        </tr>`;
    })
    .join("");

  const discountRow =
    data.discountDkk > 0
      ? `
        <tr>
          <td colspan="3" style="padding: 6px 12px; text-align: right; color: ${brand.emailColors.muted};">Discount:</td>
          <td style="padding: 6px 12px; text-align: right; color: #c0392b;">−${fmt(data.discountDkk)}</td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order confirmation - ${brand.storeName}</title>
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
              <h2 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 900; color: ${brand.emailColors.accent};">Thank you for your order.</h2>
              <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6;">
                Hi ${data.shippingName},
              </p>
              <p style="margin: 0; font-size: 15px; line-height: 1.6;">
                We received your order and will process it as soon as possible.
                A confirmation has been sent to <strong>${data.email}</strong>.
              </p>
            </td>
          </tr>

          <!-- Order number -->
          <tr>
            <td style="padding: 8px 32px 24px 32px;">
              <p style="margin: 0; font-size: 13px; color: ${brand.emailColors.muted};">
                Order number: <strong style="color: ${brand.emailColors.ink};">${data.orderId}</strong>
              </p>
            </td>
          </tr>

          <!-- Items table -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="background-color: ${brand.emailColors.sand};">
                    <th style="padding: 10px 12px; text-align: left; font-weight: 700; color: ${brand.emailColors.ink};">Product</th>
                    <th style="padding: 10px 12px; text-align: center; font-weight: 700; color: ${brand.emailColors.ink};">Qty</th>
                    <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${brand.emailColors.ink};">Unit price</th>
                    <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: ${brand.emailColors.ink};">Line total</th>
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
                  <td style="padding: 6px 12px; text-align: right; width: 110px;">${fmt(data.subtotalDkk)}</td>
                </tr>
                ${discountRow}
                <tr>
                  <td colspan="3" style="padding: 6px 12px; text-align: right; color: ${brand.emailColors.muted};">Shipping:</td>
                  <td style="padding: 6px 12px; text-align: right;">${data.shippingDkk === 0 ? "Free" : fmt(data.shippingDkk)}</td>
                </tr>
                <tr style="border-top: 2px solid ${brand.emailColors.accent};">
                  <td colspan="3" style="padding: 10px 12px; text-align: right; font-weight: 900; font-size: 15px; color: ${brand.emailColors.ink};">Total:</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: 900; font-size: 15px; color: ${brand.emailColors.accent};">${fmt(data.totalDkk)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${brand.emailColors.sand}; padding: 20px 32px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: ${brand.emailColors.muted}; line-height: 1.6;">
                Have questions about your order? Write to us at
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

/**
 * Ordrestyring: delt email-chrome (header + hvid kort + footer) for de NYE
 * transactional ordre-emails. Spejler renderOrderConfirmationHtml's look uden
 * at duplikere de ~100 linjer pr. template — kalderen leverer kun body-HTML.
 */
function renderEmailShell(opts: {
  title: string;
  heading: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title} - ${brand.storeName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${brand.emailColors.cream}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: ${brand.emailColors.ink};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${brand.emailColors.cream}; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid ${brand.emailColors.sand}; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: ${brand.emailColors.accent}; padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px;">${brand.storeName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 900; color: ${brand.emailColors.accent};">${opts.heading}</h2>
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color: ${brand.emailColors.sand}; padding: 20px 32px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: ${brand.emailColors.muted}; line-height: 1.6;">
                Have questions about your order? Write to us at
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

export function renderShippingNotificationHtml(data: ShippingEmailData): string {
  const itemsList = data.items
    .map(
      (i) =>
        `<li style="margin: 4px 0;">${i.productName} <strong>× ${i.quantity}</strong></li>`,
    )
    .join("");

  const trackingBlock = data.trackingNumber
    ? `<p style="margin: 16px 0 0 0; font-size: 15px; line-height: 1.6;">
         Carrier: <strong>${data.carrier ?? "—"}</strong><br />
         Tracking number: <strong>${data.trackingNumber}</strong>
         ${
           data.trackingUrl
             ? `<br /><a href="${data.trackingUrl}" style="color: ${brand.emailColors.accent}; font-weight: 700; text-decoration: none;">Track your shipment →</a>`
             : ""
         }
       </p>`
    : "";

  const body = `
    <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6;">Hi ${data.shippingName},</p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">
      Good news — your order <strong>${data.orderId.slice(0, 8)}</strong> is on its way.
    </p>
    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: ${brand.emailColors.ink};">${itemsList}</ul>
    ${trackingBlock}`;

  return renderEmailShell({
    title: "Your order has shipped",
    heading: "Your order is on its way 📦",
    bodyHtml: body,
  });
}

export function renderRefundConfirmationHtml(data: RefundEmailData): string {
  const body = `
    <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6;">Hi ${data.shippingName},</p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">
      We've issued a ${data.partial ? "partial " : ""}refund of
      <strong style="color: ${brand.emailColors.accent};">${formatPriceDkk(data.refundDkk)}</strong>
      for order <strong>${data.orderId.slice(0, 8)}</strong>.
    </p>
    <p style="margin: 0; font-size: 14px; color: ${brand.emailColors.muted}; line-height: 1.6;">
      Depending on your bank, it can take a few business days for the amount to appear on your statement.
    </p>`;

  return renderEmailShell({
    title: "Refund issued",
    heading: "Your refund is on its way",
    bodyHtml: body,
  });
}

export function renderReturnReceivedHtml(data: ReturnEmailData): string {
  const itemsList = data.items
    .map(
      (i) =>
        `<li style="margin: 4px 0;">${i.productName} <strong>× ${i.quantity}</strong></li>`,
    )
    .join("");

  const body = `
    <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6;">Hi ${data.shippingName},</p>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">
      We've received your return for order <strong>${data.orderId.slice(0, 8)}</strong>:
    </p>
    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: ${brand.emailColors.ink};">${itemsList}</ul>
    <p style="margin: 16px 0 0 0; font-size: 14px; color: ${brand.emailColors.muted}; line-height: 1.6;">
      We'll process it shortly and follow up about any refund.
    </p>`;

  return renderEmailShell({
    title: "Return received",
    heading: "We've received your return",
    bodyHtml: body,
  });
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
      `[mailer] Email "${message.subject}" to ${message.to} written to .mail-previews/${filename}`,
    );
  }

  async sendOrderConfirmation(data: OrderEmailData): Promise<void> {
    const html = renderOrderConfirmationHtml(data);
    const dir = join(process.cwd(), ".mail-previews");
    const filename = `order-${data.orderId}.html`;
    const filepath = join(dir, filename);

    await mkdir(dir, { recursive: true });
    await writeFile(filepath, html, "utf-8");

    console.log(
      `[mailer] Order confirmation written to .mail-previews/${filename}`,
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

/**
 * Ordrestyring: generisk dispatch for de NYE transactional ordre-emails.
 * Samme Resend→preview-fallback som mailer.sendOrderConfirmation, men for et
 * vilkårligt MailMessage. Bruges af send-funktionerne nedenfor (kaldt fra
 * ordre-workspace server-actions).
 */
async function dispatchMail(message: MailMessage): Promise<void> {
  const { shouldUseResend, ResendMailer } = await import("@/lib/mailer/resend");
  if (await shouldUseResend()) {
    try {
      const resend = new ResendMailer();
      await resend.sendRaw(message);
      return;
    } catch (err) {
      console.error("[mailer] Resend send failed, falling back to preview:", err);
    }
  }
  await previewMailer.sendMail(message);
}

export async function sendShippingNotificationEmail(
  data: ShippingEmailData,
): Promise<void> {
  await dispatchMail({
    to: data.email,
    subject: `Your order has shipped — ${data.orderId.slice(0, 8)}`,
    html: renderShippingNotificationHtml(data),
    text: `Hi ${data.shippingName}, your order ${data.orderId.slice(0, 8)} has shipped.${
      data.trackingNumber ? ` Tracking: ${data.trackingNumber}` : ""
    }`,
  });
}

export async function sendRefundConfirmationEmail(
  data: RefundEmailData,
): Promise<void> {
  await dispatchMail({
    to: data.email,
    subject: `Refund issued — ${data.orderId.slice(0, 8)}`,
    html: renderRefundConfirmationHtml(data),
    text: `Hi ${data.shippingName}, we've issued a ${
      data.partial ? "partial " : ""
    }refund of ${formatPriceDkk(data.refundDkk)} for order ${data.orderId.slice(0, 8)}.`,
  });
}

export async function sendReturnReceivedEmail(
  data: ReturnEmailData,
): Promise<void> {
  await dispatchMail({
    to: data.email,
    subject: `Return received — ${data.orderId.slice(0, 8)}`,
    html: renderReturnReceivedHtml(data),
    text: `Hi ${data.shippingName}, we've received your return for order ${data.orderId.slice(0, 8)}.`,
  });
}

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

/**
 * Password-reset-email. Samme Resend→preview-fallback som magic-link, men bruger
 * ResendMailer.sendRaw (generisk) + reset-template. URL'en peger på
 * /account/reset-password?token=… (rå token kun her — DB har kun hashen).
 */
export async function sendPasswordResetEmail(
  data: MagicLinkEmailData,
): Promise<void> {
  const rendered = renderPasswordResetHtml({
    email: data.email,
    url: data.url,
    expiresMinutes: 60,
  });

  const { shouldUseResend, ResendMailer } = await import("@/lib/mailer/resend");
  if (await shouldUseResend()) {
    try {
      await new ResendMailer().sendRaw({
        to: data.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      return;
    } catch (err) {
      console.error(
        "[mailer] Resend password-reset failed, falling back to preview:",
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
