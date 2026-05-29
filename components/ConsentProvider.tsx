"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_VERSION,
  DEFAULT_CONSENT,
  parseConsentCookie,
  type ConsentState,
} from "@/lib/consent";

/**
 * Phase 10 Slice 5 — klient-side consent state + setter.
 *
 * Wraps storefront-træet i app/layout.tsx. Læser cookie ved mount så state er
 * hydrereret synkront uden race conditions med <GoogleAnalytics> der gater på
 * `analytics`. Når kunden ændrer valg via ConsentBanner, opdateres både cookie
 * og in-memory state — re-render triggrer afsendelse/blokering af gtag-script.
 *
 * Cookien skrives med Max-Age = 1 år, SameSite=Lax, Path=/. Vi sætter den
 * klient-side (document.cookie) frem for via server-action så banneret kan
 * reagere instant uden full-page-reload.
 */

type ConsentContextValue = {
  consent: ConsentState;
  decided: boolean;
  update(next: { analytics: boolean; marketing: boolean }): void;
  acceptAll(): void;
  rejectAll(): void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function ConsentProvider({
  initial,
  children,
}: {
  initial: ConsentState;
  children: React.ReactNode;
}) {
  const [consent, setConsent] = useState<ConsentState>(initial);
  const [decided, setDecided] = useState(initial.ts !== DEFAULT_CONSENT.ts);

  // Re-read cookie on mount in case server-render hadn't seen it yet
  // (rare race when user just decided on previous page).
  useEffect(() => {
    const cookie = readCookie(CONSENT_COOKIE_NAME);
    if (cookie) {
      const parsed = parseConsentCookie(cookie);
      setConsent(parsed);
      setDecided(parsed.ts !== DEFAULT_CONSENT.ts);
    }
  }, []);

  const persist = useCallback((next: ConsentState) => {
    setConsent(next);
    setDecided(true);
    writeCookie(CONSENT_COOKIE_NAME, JSON.stringify(next), ONE_YEAR_SECONDS);
  }, []);

  const update = useCallback(
    (next: { analytics: boolean; marketing: boolean }) => {
      persist({
        v: CONSENT_VERSION,
        necessary: true,
        analytics: next.analytics,
        marketing: next.marketing,
        ts: new Date().toISOString(),
      });
    },
    [persist],
  );

  const acceptAll = useCallback(() => update({ analytics: true, marketing: true }), [update]);
  const rejectAll = useCallback(() => update({ analytics: false, marketing: false }), [update]);

  return (
    <ConsentContext.Provider value={{ consent, decided, update, acceptAll, rejectAll }}>
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent must be used inside <ConsentProvider>");
  }
  return ctx;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}
