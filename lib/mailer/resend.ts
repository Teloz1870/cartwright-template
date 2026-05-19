import "server-only";

import { Resend } from "resend";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";
import type { Mailer, OrderEmailData, MagicLinkEmailData } from "@/lib/mailer";

/**
 * Resend-baseret mailer til production. Læser API-key fra IntegrationSettings
 * (krypteret via AES-256-GCM, samme pattern som Stripe + Anthropic) med
 * .env-fallback. Cache med 30s TTL.
 *
 * Falls back til null hvis ingen key er sat — caller skal håndtere det
 * (typisk ved at bruge PreviewMailer i dev/fallback).
 */

const CACHE_TTL_MS = 30_000;
let cachedKey: { value: string | null; expiresAt: number } | null = null;

export async function getResendApiKey(): Promise<string | null> {
  const now = Date.now();
  if (cachedKey && cachedKey.expiresAt > now) return cachedKey.value;

  let dbKey: string | null = null;
  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { resendApiKey: true },
    });
    dbKey = row?.resendApiKey ? decryptSecret(row.resendApiKey) : null;
  } catch {
    // DB ikke tilgængelig — fall back til env
  }

  const key = dbKey ?? process.env.RESEND_API_KEY ?? null;
  cachedKey = { value: key, expiresAt: now + CACHE_TTL_MS };
  return key;
}

export function invalidateResendKeyCache(): void {
  cachedKey = null;
}

/**
 * Resend Mailer. Bruger samme HTML-templates som PreviewMailer (importerer
 * dem fra lib/mailer.ts) men sender via Resend API i stedet for at skrive
 * til .mail-previews/.
 */
export class ResendMailer implements Mailer {
  private from: string;

  // Default from-værdi læser brand-config så fork-shops automatisk får
  // korrekt sender-name + email uden at skulle pass'e den ind eksplicit.
  // Caller kan stadig override (fx for tests eller multi-shop-deploy).
  constructor(from = `${brand.emails.fromName} <${brand.emails.from}>`) {
    this.from = from;
  }

  private async getClient(): Promise<Resend | null> {
    const key = await getResendApiKey();
    return key ? new Resend(key) : null;
  }

  async sendOrderConfirmation(data: OrderEmailData): Promise<void> {
    const client = await this.getClient();
    if (!client) {
      throw new Error("Resend API-key not configured");
    }
    // Import-cycle break: importér template-renderer dynamisk
    const { renderOrderConfirmationHtml } = await import("@/lib/mailer");
    const html = renderOrderConfirmationHtml(data);
    const subject = `Ordre bekræftet — ${data.orderId.slice(0, 8)}`;

    const result = await client.emails.send({
      from: this.from,
      to: data.email,
      subject,
      html,
    });
    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
  }

  async sendMagicLink(data: MagicLinkEmailData): Promise<void> {
    const client = await this.getClient();
    if (!client) {
      throw new Error("Resend API-key not configured");
    }
    const { renderMagicLinkHtml } = await import("@/lib/auth/email-template");
    const rendered = renderMagicLinkHtml({
      email: data.email,
      url: data.url,
      expiresMinutes: 15,
    });

    const result = await client.emails.send({
      from: this.from,
      to: data.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
  }
}

/**
 * Picker mellem PreviewMailer (dev) og ResendMailer (prod). Hvis Resend-key
 * er sat OG vi er i production → ResendMailer. Ellers PreviewMailer.
 *
 * Caller (lib/mailer.ts) bruger denne ved load-time. Resend-key kan
 * tilføjes runtime via /admin/integrations uden restart — pickResolvedMailer
 * skal kaldes per-send for at få frisk valg.
 */
export async function shouldUseResend(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return false;
  const key = await getResendApiKey();
  return key !== null;
}
