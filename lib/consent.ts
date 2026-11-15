/**
 * Phase 10 Slice 5 — shared consent constants + parser.
 *
 * Cookie: cw_consent (JSON)
 *   { v: 1, necessary: true, analytics: bool, marketing: bool, ts: ISO }
 *
 * Splittet til shared (denne fil) + server-side (lib/consent-server.ts) så
 * Client Components kan importere parser + konstanter uden at trigge Next.js's
 * server-only-guard. getConsent() (der bruger next/headers cookies()) ligger i
 * lib/consent-server.ts.
 */

export const CONSENT_COOKIE_NAME = "cw_consent";
export const CONSENT_VERSION = 1;

export type ConsentState = {
  v: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  ts: string;
};

export const DEFAULT_CONSENT: ConsentState = {
  v: CONSENT_VERSION,
  necessary: true,
  analytics: false,
  marketing: false,
  ts: new Date(0).toISOString(),
};

export function parseConsentCookie(raw: string | undefined): ConsentState {
  if (!raw) return DEFAULT_CONSENT;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.v !== CONSENT_VERSION) return DEFAULT_CONSENT;
    return {
      v: CONSENT_VERSION,
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      ts: typeof parsed.ts === "string" ? parsed.ts : DEFAULT_CONSENT.ts,
    };
  } catch {
    return DEFAULT_CONSENT;
  }
}

/**
 * True hvis kunden har truffet et aktivt valg (cookien findes med en
 * ikke-epoch timestamp). Bruges til at vise/skjule banneret.
 */
export function hasDecided(state: ConsentState): boolean {
  return state.ts !== DEFAULT_CONSENT.ts;
}
