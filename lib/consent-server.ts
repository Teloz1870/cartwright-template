import "server-only";

import { cookies } from "next/headers";
import {
  CONSENT_COOKIE_NAME,
  parseConsentCookie,
  type ConsentState,
} from "@/lib/consent";

/**
 * Phase 10 Slice 5 — server-side consent reader.
 *
 * Læses i RSC (app/layout.tsx + andre steder der skal beslutte
 * "skal jeg overhovedet emitte denne <Script>") — så GA4 og marketing-pixels
 * ikke engang ender i HTML uden samtykke.
 *
 * Klient-side: <ConsentProvider> hydrerer state fra samme cookie via
 * parseConsentCookie() fra lib/consent (shared).
 */
export async function getConsent(): Promise<ConsentState> {
  const store = await cookies();
  const raw = store.get(CONSENT_COOKIE_NAME)?.value;
  return parseConsentCookie(raw);
}
