"use client";

import { useState, useTransition } from "react";
import { updateBrandingSettings } from "./actions";

export default function BrandingForm({
  initialStoreName,
  initialEcommerceEnabled,
  initialWebsiteHeadline,
  initialHeroCta,
  initialDefaultLocale,
}: {
  initialStoreName: string;
  initialEcommerceEnabled: boolean;
  initialWebsiteHeadline?: string | null;
  initialHeroCta?: string | null;
  initialDefaultLocale: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [storeName, setStoreName] = useState(initialStoreName);
  const [ecommerceEnabled, setEcommerceEnabled] = useState(initialEcommerceEnabled);
  const [websiteHeadline, setWebsiteHeadline] = useState(initialWebsiteHeadline ?? "");
  const [heroCta, setHeroCta] = useState(initialHeroCta ?? "");
  const [defaultLocale, setDefaultLocale] = useState(initialDefaultLocale);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await updateBrandingSettings(storeName, ecommerceEnabled, websiteHeadline, heroCta, defaultLocale);
      if (res.ok) {
        setMessage({ type: "success", text: "Indstillinger gemt!" });
      } else {
        setMessage({ type: "error", text: res.error || "Der opstod en fejl." });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-sol-sand p-6 rounded-xl border border-sol-ink/10 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-sol-ink mb-4">Site Indstillinger</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="storeName" className="block text-sm font-bold text-sol-ink mb-1">
              Butikkens navn
            </label>
            <input
              id="storeName"
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent bg-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="defaultLocale" className="block text-sm font-bold text-sol-ink mb-1">
              Standardsprog (Default Locale)
            </label>
            <select
              id="defaultLocale"
              value={defaultLocale}
              onChange={(e) => setDefaultLocale(e.target.value)}
              className="w-full rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent bg-transparent"
            >
              <option value="da" className="text-black bg-white">🇩🇰 Dansk (DA)</option>
              <option value="en" className="text-black bg-white">🇬🇧 English (EN)</option>
            </select>
            <p className="text-xs text-sol-muted mt-1">Styrer standardsproget for uindloggede og nye besøgende på shoppen.</p>
          </div>

          <div className="flex items-start gap-3 p-4 bg-sol-cream/50 rounded-lg border border-sol-ink/5">
            <input
              id="ecommerceEnabled"
              type="checkbox"
              checked={ecommerceEnabled}
              onChange={(e) => setEcommerceEnabled(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-sol-ink/20 text-sol-accent focus:ring-sol-accent"
            />
            <div>
              <label htmlFor="ecommerceEnabled" className="block text-sm font-bold text-sol-ink">
                Aktivér Webshop Funktionalitet
              </label>
              <p className="text-sm text-sol-muted mt-1">
                Slå denne fra, hvis du kun vil bruge Cartwright som en præsentationsside (CMS) uden indkøbskurv og checkout. Navigationen vil automatisk skjule shop-specifikke faner.
              </p>
            </div>
          </div>
          
          {!ecommerceEnabled && (
            <div className="p-4 bg-sol-sand/30 rounded-lg border border-sol-ink/10 space-y-4">
              <h3 className="text-sm font-black uppercase text-sol-muted">Website Mode Indstillinger</h3>
              
              <div>
                <label htmlFor="websiteHeadline" className="block text-sm font-bold text-sol-ink mb-1">
                  Forside Headline
                </label>
                <textarea
                  id="websiteHeadline"
                  value={websiteHeadline}
                  onChange={(e) => setWebsiteHeadline(e.target.value)}
                  rows={2}
                  placeholder="Byg din forretning.&#10;Uden teknisk bøvl."
                  className="w-full rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent"
                />
                <p className="text-xs text-sol-muted mt-1">Linjeskift virker. Lad stå tom for default.</p>
              </div>

              <div>
                <label htmlFor="heroCta" className="block text-sm font-bold text-sol-ink mb-1">
                  Primary Button Text (CTA)
                </label>
                <input
                  id="heroCta"
                  type="text"
                  value={heroCta}
                  onChange={(e) => setHeroCta(e.target.value)}
                  placeholder="Se Priser"
                  className="w-full rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-sol-ink/10 flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending || !storeName.trim()}
          className="rounded-full bg-sol-accent px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
        >
          {isPending ? "Gemmer..." : "Gem Indstillinger"}
        </button>
        {message && (
          <p className={`text-sm font-medium ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
