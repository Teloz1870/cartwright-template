import { brand } from "@/brand.config";

type MagicLinkTemplateArgs = {
  email: string;
  url: string;
  expiresMinutes: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Magic-link email-template. Bruger brand-config til alle brand-strings
 * (storeName, copyright-år) så fork-shops automatisk får korrekt branding.
 *
 * NB: Farverne kommer fra brand.emailColors fordi HTML-email IKKE supporter
 * CSS-variabler — mail-klienter strippede dem. Centraliseret i brand.config
 * pr Gemini-review (Phase Shop-Starter). Ved klon: rediger brand.emailColors
 * — ingen find/replace nødvendigt på tværs af denne fil + mailer.ts +
 * marketing-helpers.ts.
 */
export function renderMagicLinkHtml(
  args: MagicLinkTemplateArgs,
): { subject: string; html: string; text: string } {
  const storeName = escapeHtml(brand.storeName);
  const subject = `Log ind på ${brand.storeName}`;
  const email = escapeHtml(args.email);
  const url = escapeHtml(args.url);

  const html = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${brand.emailColors.cream}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: ${brand.emailColors.ink};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${brand.emailColors.cream}; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid ${brand.emailColors.sand}; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: ${brand.emailColors.accent}; padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px;">${storeName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 900; color: ${brand.emailColors.ink};">Log ind på ${storeName}</h2>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: ${brand.emailColors.ink};">
                Vi har modtaget en login-anmodning for <strong>${email}</strong>. Klik nedenfor for at logge ind:
              </p>
              <p style="margin: 0 0 24px 0;">
                <a href="${url}" style="display: inline-block; background-color: ${brand.emailColors.accent}; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 15px; padding: 13px 22px; border-radius: 8px;">Log ind nu</a>
              </p>
              <p style="margin: 0; font-size: 13px; line-height: 1.6; color: ${brand.emailColors.muted};">
                Link udløber om ${args.expiresMinutes} minutter. Hvis du ikke har bedt om det, kan du ignorere denne email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${brand.emailColors.sand}; padding: 20px 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: ${brand.emailColors.muted};">&copy; ${brand.footer.copyrightYear} ${storeName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Log ind på ${brand.storeName}

Vi har modtaget en login-anmodning for ${args.email}. Klik nedenfor for at logge ind:

${args.url}

Link udløber om ${args.expiresMinutes} minutter. Hvis du ikke har bedt om det, kan du ignorere denne email.

© ${brand.footer.copyrightYear} ${brand.storeName}`;

  return { subject, html, text };
}
