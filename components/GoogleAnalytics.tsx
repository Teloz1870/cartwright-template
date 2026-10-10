"use client";

import Script from "next/script";
import { useEffect } from "react";
import { useConsent } from "./ConsentProvider";

/**
 * Phase 10 Slice 5 — GA4 loader, consent-gated.
 *
 * Det er IKKE nok at lade scriptet være i HTML og blot springe over gtag-kald
 * — GA4-scriptet sender selv en pageview ved load. Vi løser det ved at:
 *
 *   1. Initialisere dataLayer + gtag stub før scriptet downloades, med
 *      'denied' for både analytics_storage og ad_storage (Google Consent Mode).
 *   2. Loade scriptet ASAP så Consent Mode v2's anonymous pings registreres.
 *   3. Når kunden accepterer analytics, kalder vi gtag('consent', 'update', ...)
 *      hvilket "frigør" cookies + measurement.
 *
 * Den eneste rendering der sker UDEN consent er Consent Mode's anonymous
 * cookieless ping (Google's officielle löisning, GDPR-compliant pr. 2024-03).
 */
type GtagFn = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

export default function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const { consent } = useConsent();

  // Når kunden ændrer analytics-consent, opdater gtag-state instant.
  useEffect(() => {
    if (typeof window === "undefined" || !window.gtag) return;
    window.gtag("consent", "update", {
      analytics_storage: consent.analytics ? "granted" : "denied",
      ad_storage: consent.marketing ? "granted" : "denied",
      ad_user_data: consent.marketing ? "granted" : "denied",
      ad_personalization: consent.marketing ? "granted" : "denied",
    });
  }, [consent.analytics, consent.marketing]);

  return (
    <>
      <Script id="ga4-consent-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            wait_for_update: 500
          });
          gtag('js', new Date());
          gtag('config', '${measurementId}', { anonymize_ip: true });
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
    </>
  );
}
