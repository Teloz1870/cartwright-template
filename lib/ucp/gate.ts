import "server-only";

import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";

/**
 * UCP identity-linking er gated bag brand.features.ucpIdentityLinking. Når off
 * 404'er alle OAuth-routes (de eksisterer ikke for shops der ikke linker).
 */
export async function ucpIdentityLinkingEnabled(): Promise<boolean> {
  const brand = await getBrand();
  return Boolean(brand.features.ucpIdentityLinking);
}

export function ucpDisabledResponse(): Response {
  return new Response("Not found", { status: 404 });
}

/**
 * Issuer = en KONFIGURERET kanonisk origin — IKKE request-headers. At udlede
 * issuer fra Host/X-Forwarded-Host muliggør issuer-spoofing + cache-poisoning
 * af discovery-metadata (host-header-injection). Vi følger samme hærdning som
 * Auth.js (AUTH_URL pin): AUTH_URL → brand.url → (kun som dev-fallback)
 * request-host. RFC 8414 kræver byte-for-byte-match med discovery-base, så
 * deploy SKAL serveres fra denne kanoniske origin. Ingen trailing slash.
 */
/** Den konfigurerede kanoniske origin (AUTH_URL → brand.url), eller null. */
export function canonicalIssuer(): string | null {
  const configured = process.env.AUTH_URL?.trim() || brand.url?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

export function issuerFromRequest(req: Request): string {
  const canonical = canonicalIssuer();
  if (canonical) return canonical;
  // Dev/ukonfigureret fallback (brand.url er normalt altid sat i prod).
  const fwdHost = req.headers.get("x-forwarded-host");
  const host = fwdHost ?? req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host && host.startsWith("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}
