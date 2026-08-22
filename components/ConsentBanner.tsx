"use client";

import { useState } from "react";
import Link from "next/link";
import { useConsent } from "./ConsentProvider";

/**
 * Phase 10 Slice 5 — EU-compliant cookie consent banner.
 *
 * Tre kategorier:
 *   - necessary: altid on, ikke afkrydselig
 *   - analytics: GA4 og lignende — kun on efter eksplicit accept
 *   - marketing: pixels (Meta, Google Ads, TikTok m.fl.) når de tilføjes
 *
 * Vises kun når kunden ikke har truffet et valg (consent.ts === epoch).
 * Banner rendere i bunden af viewport, z-50 så det overlejer alt.
 */
export default function ConsentBanner({ locale = "da" }: { locale?: string }) {
  const { consent, decided, update, acceptAll, rejectAll } = useConsent();
  const [analytics, setAnalytics] = useState(consent.analytics);
  const [marketing, setMarketing] = useState(consent.marketing);
  const [expanded, setExpanded] = useState(false);
  // NB: ConsentBanner renders i ROOT app/layout.tsx — UDENFOR
  // NextIntlClientProvider (som lever i app/[locale]/layout.tsx). useLocale()
  // ville derfor kaste "No intl context". Vi modtager locale som prop fra
  // root-layoutet (som har getLocale()) i stedet. Samme prop-mønster som
  // ReviewList/WriteReviewForm.
  const en = locale === "en";

  const t = en
    ? {
        aria: "Cookie consent",
        heading: "We use cookies",
        body: "Necessary cookies are always active (login, cart, security). Analytics cookies help us understand how the site is used. Marketing cookies are used to show relevant content.",
        privacy: "Privacy policy",
        necessary: "Necessary",
        necessaryHint: "Login, cart, security — always active.",
        analytics: "Analytics",
        analyticsHint: "Google Analytics 4 — anonymised traffic statistics.",
        marketing: "Marketing",
        marketingHint: "Personalised ads (when enabled by the shop).",
        acceptAll: "Accept all",
        rejectAll: "Reject all",
        save: "Save choices",
        customise: "Customise",
      }
    : {
        aria: "Cookie samtykke",
        heading: "Vi bruger cookies",
        body: "Nødvendige cookies er altid aktive (login, kurv, sikkerhed). Analyse-cookies hjælper os med at forstå hvordan siden bruges. Marketing-cookies bruges til at vise relevant indhold.",
        privacy: "Privatlivspolitik",
        necessary: "Nødvendige",
        necessaryHint: "Login, kurv, sikkerhed — altid aktive.",
        analytics: "Analyse",
        analyticsHint: "Google Analytics 4 — anonymiseret trafikstatistik.",
        marketing: "Marketing",
        marketingHint: "Personliserede annoncer (når aktiveret af shoppen).",
        acceptAll: "Acceptér alle",
        rejectAll: "Afvis alle",
        save: "Gem valg",
        customise: "Tilpas",
      };

  if (decided) return null;

  // Phase F-pattern fix (2026-05-28): use theme tokens instead of
  // hardcoded `bg-white/95` + Tailwind `dark:` variants. Tailwind's `dark:`
  // strategy isn't configured in this project, so `dark:bg-sol-ink` never
  // fires — even on shops that visually run in dark mode (solbrillen.dk
  // with --color-sol-cream toggled to #0A0A0A via prefers-color-scheme).
  // Theme CSS already flips --color-sol-cream + --color-sol-ink between
  // light/dark per the @media (prefers-color-scheme: dark) block in
  // themes/generic.css, so bg-sol-cream + text-sol-ink track that
  // automatically — same approach as HeaderClient (Phase F1).
  return (
    // data-cw-consent-banner: stable design hook (DESIGN.md §5).
    <div
      data-cw-consent-banner
      role="dialog"
      aria-label={t.aria}
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3"
    >
      <div className="sol-card-elevated w-full max-w-3xl rounded-2xl bg-sol-cream/95 px-5 py-4 text-sol-ink shadow-2xl ring-1 ring-sol-ink/10 backdrop-blur">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-black text-sol-ink">
              {t.heading}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-sol-muted">
              {t.body}{" "}
              <Link
                href="/info/privacy"
                className="underline hover:text-sol-accent"
              >
                {t.privacy}
              </Link>
            </p>
          </div>

          {expanded && (
            <fieldset className="grid gap-2 rounded-lg border border-sol-ink/10 px-3 py-3 text-xs">
              <Toggle label={t.necessary} checked disabled hint={t.necessaryHint} />
              <Toggle
                label={t.analytics}
                checked={analytics}
                onChange={setAnalytics}
                hint={t.analyticsHint}
              />
              <Toggle
                label={t.marketing}
                checked={marketing}
                onChange={setMarketing}
                hint={t.marketingHint}
              />
            </fieldset>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={acceptAll}
              className="flex-1 rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 sm:flex-none"
            >
              {t.acceptAll}
            </button>
            <button
              type="button"
              onClick={rejectAll}
              className="flex-1 rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent sm:flex-none"
            >
              {t.rejectAll}
            </button>
            {expanded ? (
              <button
                type="button"
                onClick={() => update({ analytics, marketing })}
                className="flex-1 rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent sm:flex-none"
              >
                {t.save}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-xs font-black text-sol-muted underline hover:text-sol-accent"
              >
                {t.customise}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-sol-ink/30 text-sol-accent focus:ring-sol-accent"
      />
      <span className="flex-1">
        <span className="block font-black uppercase tracking-wide text-sol-ink">
          {label}
        </span>
        <span className="block text-sol-muted">{hint}</span>
      </span>
    </label>
  );
}
