import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { brand } from "@/brand.config";

type PreviewArgs = {
  to: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  announcement: string;
};

/**
 * Skriver en HTML-preview-fil til .mail-previews/. Genbruges af
 * marketing.create_campaign så preview er synlig uden SMTP.
 *
 * Returnerer den fulde path så audit-loggen viser hvor filen lever.
 */
export async function writePreviewFile(args: PreviewArgs): Promise<string> {
  const dir = join(process.cwd(), ".mail-previews");
  await mkdir(dir, { recursive: true });

  const filename = `campaign-${args.code.toLowerCase()}-${Date.now()}.html`;
  const filepath = join(dir, filename);

  const html = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8" />
  <title>Kampagne preview — ${args.code}</title>
</head>
<body style="margin:0;padding:0;background-color:${brand.emailColors.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${brand.emailColors.ink};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${brand.emailColors.cream};padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid ${brand.emailColors.sand};border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:${brand.emailColors.accent};padding:28px 32px;text-align:center;">
          <h1 style="margin:0;font-size:26px;font-weight:900;color:#ffffff;letter-spacing:0.5px;">${brand.storeName}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px 0;font-size:22px;font-weight:900;color:${brand.emailColors.accent};">Ny kampagne er i luften! ☀️</h2>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${args.announcement}</p>
          <div style="margin:24px 0;padding:20px;border:2px dashed ${brand.emailColors.accent};border-radius:8px;text-align:center;">
            <p style="margin:0;font-size:13px;color:${brand.emailColors.muted};text-transform:uppercase;letter-spacing:2px;font-weight:700;">Rabatkode</p>
            <p style="margin:8px 0 0;font-size:32px;font-weight:900;color:${brand.emailColors.accent};letter-spacing:1px;">${args.code}</p>
            <p style="margin:8px 0 0;font-size:14px;color:${brand.emailColors.muted};">${args.type === "percent" ? `${args.value}% rabat` : `${(args.value / 100).toFixed(2)} kr rabat`}</p>
          </div>
          <p style="margin:0;font-size:13px;color:${brand.emailColors.muted};">Sendt til preview: <strong style="color:${brand.emailColors.ink};">${args.to}</strong></p>
        </td></tr>
        <tr><td style="background-color:${brand.emailColors.sand};padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:${brand.emailColors.muted};">Genereret af marketing.create_campaign tool · ${new Date().toISOString()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await writeFile(filepath, html, "utf-8");
  return filepath;
}
