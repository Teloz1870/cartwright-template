import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { brand } from "@/brand.config";

/**
 * Dependency-free contact mail for profiles WITHOUT the db module (B3
 * site-profile slice).
 *
 * The full engine's mailer stack (lib/mailer + lib/mailer/resend) is
 * db-coupled: it reads the Resend key from IntegrationSettings, logs sends,
 * and carries the webshop/auth mail templates. A `site` scaffold has none of
 * that — its contact surfaces (the contact form's inquiries endpoint and the
 * /start lead wizard) just need "deliver this message to the owner":
 *
 *  - RESEND_API_KEY set → one fetch to the Resend REST API (no SDK dep).
 *  - No key (local dev) → the message is written to .mail-previews/ exactly
 *    like the engine's PreviewMailer, so the dev feedback loop is identical.
 *
 * Owner decision 2026-07-15: the site-profile contact form is Resend-only,
 * no database. NOTHING imports this in db profiles — they keep the full
 * mailer stack untouched.
 */

export type ContactMailMessage = {
  subject: string;
  /** Plain-text body (the contact surfaces render simple key/value lines). */
  text: string;
  /** Reply-To so the owner can answer the visitor directly. */
  replyTo?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Send to the owner (brand.emails.admin). Returns false when delivery failed. */
export async function sendContactMail(message: ContactMailMessage): Promise<boolean> {
  const to = brand.emails.admin;
  const html = `<pre style="font: 14px/1.6 ui-monospace, monospace; white-space: pre-wrap;">${escapeHtml(message.text)}</pre>`;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev parity with PreviewMailer: write the mail where the engine writes
    // every other preview mail.
    try {
      const dir = join(process.cwd(), ".mail-previews");
      const filename = `contact-${Date.now()}.html`;
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, filename), html, "utf-8");
      console.log(
        `[contact-mail] No RESEND_API_KEY — "${message.subject}" written to .mail-previews/${filename}`,
      );
      return true;
    } catch (err) {
      console.error("[contact-mail] preview write failed:", err);
      return false;
    }
  }

  // Resend's shared onboarding@resend.dev sender only delivers to the
  // account owner's own address — fine for trying things out, but real
  // deployments must verify a domain and set RESEND_FROM (codex #385).
  const fromAddress = process.env.RESEND_FROM ?? "onboarding@resend.dev";
  if (!process.env.RESEND_FROM) {
    console.warn(
      "[contact-mail] RESEND_FROM is not set — falling back to onboarding@resend.dev, which Resend only delivers to the account owner's address. Verify a domain and set RESEND_FROM for production.",
    );
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.storeName} <${fromAddress}>`,
        to: [to],
        subject: message.subject,
        html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error(
        `[contact-mail] Resend responded ${res.status}: ${await res.text().catch(() => "")}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[contact-mail] Resend send failed:", err);
    return false;
  }
}
