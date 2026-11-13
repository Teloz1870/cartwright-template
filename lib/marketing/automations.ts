import "server-only";

import { Resend } from "resend";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { getResendApiKey } from "@/lib/mailer/resend";

/**
 * Marketing-automations — emit lifecycle-events til Resend Automations.
 *
 * Cartwright FYRER events; Resend kører selve drip-sekvensen (welcome,
 * abandoned-cart, post-purchase) som shop-ejeren wirer i Resend-dashboardet på
 * de event-navne der er defineret her. Vi ejer hverken sekvensering, schedule
 * eller drip-indhold — kun event-emissionen. Se docs/marketing-automations.md.
 *
 * Default-off via brand.features.marketingAutomations. Runtime-inert uden
 * Resend-key. Marketing-events er consent-gated — se hasMarketingConsent.
 */

export const MARKETING_EVENTS = {
  /** Ny kunde oprettet (welcome-serie). */
  userCreated: "cartwright.user.created",
  /** Logged-in kurv inaktiv i N timer (recovery-drip). */
  cartAbandoned: "cartwright.cart.abandoned",
  /** Ordre betalt (post-purchase-serie). */
  orderPlaced: "cartwright.order.placed",
} as const;

export type MarketingEventName =
  (typeof MARKETING_EVENTS)[keyof typeof MARKETING_EVENTS];

/** Læser flaget bag en cast (brand.features er bredt typet pr. fork-shop). */
export function marketingAutomationsEnabled(): boolean {
  const features = brand.features as
    | { marketingAutomations?: boolean }
    | undefined;
  return Boolean(features?.marketingAutomations);
}

/**
 * Email-bundet marketing-consent. Den ENESTE consent-politik for marketing-
 * events, så den er nem at finde og udvide (fx også en order.marketingConsent-
 * checkbox). Cookie-consent (lib/consent-server) er per-browser og kan ikke
 * adressere en email server-side — derfor er det bekræftet newsletter-opt-in
 * (Subscriber.status === "confirmed") der er det email-bundne signal.
 */
export async function hasMarketingConsent(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  try {
    const sub = await prisma.subscriber.findUnique({
      where: { email: normalized },
      select: { status: true },
    });
    return sub?.status === "confirmed";
  } catch {
    // DB utilgængelig → fail-closed (send ikke marketing uden bekræftet consent).
    return false;
  }
}

/**
 * Emit et marketing-event til Resend Automations. Returnerer true KUN hvis et
 * event faktisk blev sendt til Resend.
 *
 * Fail-soft: kaster ALDRIG — kalderen void-kalder, så en Resend-fejl eller en
 * manglende automation aldrig blokerer checkout/signup/cron. Gates i rækkefølge:
 *   1. marketingAutomations-flag off
 *   2. ingen Resend-key konfigureret
 *   3. ingen marketing-consent for emailen
 */
export async function emitMarketingEvent(
  eventName: MarketingEventName | string,
  email: string,
  payload?: Record<string, unknown>,
): Promise<boolean> {
  if (!marketingAutomationsEnabled()) return false;

  const key = await getResendApiKey();
  if (!key) return false;

  const normalized = email.trim().toLowerCase();
  if (!(await hasMarketingConsent(normalized))) return false;

  try {
    const resend = new Resend(key);
    await resend.events.send({
      event: eventName,
      email: normalized,
      payload,
    });
    return true;
  } catch (err) {
    console.error(`[marketing] emit '${eventName}' failed:`, err);
    return false;
  }
}
