"use client";

import { useState, useTransition } from "react";
import { updateBrandingSettings } from "./actions";

/**
 * Renders the STORED values, and — when the identity policy owns them — says so
 * next to the field instead of letting it look editable.
 *
 * The finding this closes: an admin field that accepts input, reports "Settings
 * saved!" and changes nothing on the site. The operator has no way to tell the
 * difference between "my change didn't apply yet" and "this field is not the
 * one that decides", so they go looking in the storefront.
 */
export default function BrandingForm({
  initialStoreName,
  initialEcommerceEnabled,
  initialWebsiteHeadline,
  initialHeroCta,
  initialDefaultLocale,
  identityLockNotice = null,
  effectiveStoreName,
  effectiveEcommerceEnabled,
}: {
  initialStoreName: string;
  initialEcommerceEnabled: boolean;
  initialWebsiteHeadline?: string | null;
  initialHeroCta?: string | null;
  initialDefaultLocale: string;
  /** Non-null when brand.config owns identity — the reason, in one sentence. */
  identityLockNotice?: string | null;
  /** What the site ACTUALLY renders — resolved through the same seam. */
  effectiveStoreName: string;
  effectiveEcommerceEnabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [storeName, setStoreName] = useState(initialStoreName);
  const [ecommerceEnabled, setEcommerceEnabled] = useState(initialEcommerceEnabled);
  const [websiteHeadline, setWebsiteHeadline] = useState(initialWebsiteHeadline ?? "");
  const [heroCta, setHeroCta] = useState(initialHeroCta ?? "");
  const [defaultLocale, setDefaultLocale] = useState(initialDefaultLocale);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const locked = identityLockNotice !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await updateBrandingSettings(storeName, ecommerceEnabled, websiteHeadline, heroCta, defaultLocale);
      if (res.ok) {
        // Never report a plain success for a partial save. If the server
        // dropped locked fields, the message names them — the whole point is
        // that "saved" must not cover a field that did not change.
        setMessage({
          type: "success",
          text: res.ignored?.length
            ? `Saved. Not changed (owned by brand.config.ts): ${res.ignored.join(", ")}.`
            : "Settings saved!",
        });
      } else {
        setMessage({ type: "error", text: res.error || "An error occurred." });
      }
    });
  };

  /** Shown under a locked field, and only when the stored value differs. */
  const drift = (stored: string, effective: string) =>
    locked && stored !== effective ? (
      <p className="text-xs text-amber-700 mt-1">
        Stored here: <code>{stored || "(empty)"}</code> — the site renders{" "}
        <code>{effective}</code>.
      </p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} className="bg-sol-sand p-6 rounded-xl border border-sol-ink/10 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-sol-ink mb-4">Site Settings</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="storeName" className="block text-sm font-bold text-sol-ink mb-1">
              Store name
            </label>
            <input
              id="storeName"
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              disabled={locked}
              aria-describedby={locked ? "storeName-lock" : undefined}
              className="w-full rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent bg-transparent disabled:opacity-60 disabled:cursor-not-allowed"
              required
            />
            {locked && (
              <p id="storeName-lock" className="text-xs text-sol-muted mt-1">
                🔒 {identityLockNotice}
              </p>
            )}
            {drift(storeName, effectiveStoreName)}
          </div>

          <div>
            <label htmlFor="defaultLocale" className="block text-sm font-bold text-sol-ink mb-1">
              Default language (Default Locale)
            </label>
            <select
              id="defaultLocale"
              value={defaultLocale}
              onChange={(e) => setDefaultLocale(e.target.value)}
              className="w-full rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent bg-transparent"
            >
              <option value="da" className="text-sol-ink bg-sol-cream">🇩🇰 Dansk (DA)</option>
              <option value="en" className="text-sol-ink bg-sol-cream">🇬🇧 English (EN)</option>
            </select>
            <p className="text-xs text-sol-muted mt-1">Sets the default language for logged-out and new visitors to the shop.</p>
          </div>

          <div className="flex items-start gap-3 p-4 bg-sol-cream/50 rounded-lg border border-sol-ink/5">
            <input
              id="ecommerceEnabled"
              type="checkbox"
              checked={ecommerceEnabled}
              onChange={(e) => setEcommerceEnabled(e.target.checked)}
              disabled={locked}
              aria-describedby={locked ? "ecommerceEnabled-lock" : undefined}
              className="mt-1 h-5 w-5 rounded border-sol-ink/20 text-sol-accent focus:ring-sol-accent disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <div>
              <label htmlFor="ecommerceEnabled" className="block text-sm font-bold text-sol-ink">
                Enable Webshop Functionality
              </label>
              <p className="text-sm text-sol-muted mt-1">
                Turn this off if you only want to use Cartwright as a presentation site (CMS) without a cart and checkout. The navigation will automatically hide shop-specific tabs.
              </p>
              {locked && (
                <p id="ecommerceEnabled-lock" className="text-xs text-sol-muted mt-1">
                  🔒 {identityLockNotice}
                </p>
              )}
              {drift(
                ecommerceEnabled ? "on" : "off",
                effectiveEcommerceEnabled ? "on" : "off",
              )}
            </div>
          </div>
          
          {!ecommerceEnabled && (
            <div className="p-4 bg-sol-sand/30 rounded-lg border border-sol-ink/10 space-y-4">
              <h3 className="text-sm font-black uppercase text-sol-muted">Website Mode Settings</h3>
              
              <div>
                <label htmlFor="websiteHeadline" className="block text-sm font-bold text-sol-ink mb-1">
                  Homepage Headline
                </label>
                <textarea
                  id="websiteHeadline"
                  value={websiteHeadline}
                  onChange={(e) => setWebsiteHeadline(e.target.value)}
                  rows={2}
                  placeholder="Build your business.&#10;Without the technical hassle."
                  className="w-full rounded-md border border-sol-ink/20 px-3 py-2 text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-1 focus:ring-sol-accent"
                />
                <p className="text-xs text-sol-muted mt-1">Line breaks work. Leave empty for default.</p>
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
                  placeholder="See Pricing"
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
          {isPending ? "Saving..." : "Save Settings"}
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
