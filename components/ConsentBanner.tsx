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
export default function ConsentBanner() {
  const { consent, decided, update, acceptAll, rejectAll } = useConsent();
  const [analytics, setAnalytics] = useState(consent.analytics);
  const [marketing, setMarketing] = useState(consent.marketing);
  const [expanded, setExpanded] = useState(false);

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
    <div
      role="dialog"
      aria-label="Cookie samtykke"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3"
    >
      <div className="sol-card-elevated w-full max-w-3xl rounded-2xl bg-sol-cream/95 px-5 py-4 text-sol-ink shadow-2xl ring-1 ring-sol-ink/10 backdrop-blur">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-black text-sol-ink">
              Vi bruger cookies
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-sol-muted">
              Nødvendige cookies er altid aktive (login, kurv, sikkerhed).
              Analyse-cookies hjælper os med at forstå hvordan siden bruges.
              Marketing-cookies bruges til at vise relevant indhold.{" "}
              <Link
                href="/info/privatlivspolitik"
                className="underline hover:text-sol-accent"
              >
                Privatlivspolitik
              </Link>
            </p>
          </div>

          {expanded && (
            <fieldset className="grid gap-2 rounded-lg border border-sol-ink/10 px-3 py-3 text-xs">
              <Toggle label="Nødvendige" checked disabled hint="Login, kurv, sikkerhed — altid aktive." />
              <Toggle
                label="Analyse"
                checked={analytics}
                onChange={setAnalytics}
                hint="Google Analytics 4 — anonymiseret trafikstatistik."
              />
              <Toggle
                label="Marketing"
                checked={marketing}
                onChange={setMarketing}
                hint="Personliserede annoncer (når aktiveret af shoppen)."
              />
            </fieldset>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={acceptAll}
              className="flex-1 rounded-lg bg-sol-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-95 sm:flex-none"
            >
              Acceptér alle
            </button>
            <button
              type="button"
              onClick={rejectAll}
              className="flex-1 rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent sm:flex-none"
            >
              Afvis alle
            </button>
            {expanded ? (
              <button
                type="button"
                onClick={() => update({ analytics, marketing })}
                className="flex-1 rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent sm:flex-none"
              >
                Gem valg
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-xs font-black text-sol-muted underline hover:text-sol-accent"
              >
                Tilpas
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
