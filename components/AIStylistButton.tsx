"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import AIStylistPanel from "@/components/AIStylistPanel";
import { brand } from "@/brand.config";
import { localizedBrandCopy } from "@/lib/brand-copy";

export default function AIStylistButton({ ecommerceEnabled = true }: { ecommerceEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const tSf = useTranslations("Storefront");
  const locale = useLocale();

  // Hide on admin + the login page. The login route is locale-prefixed
  // (/en/account/login, /da/account/login, …), so match the suffix rather than
  // an exact "/account/login" that would only catch the unprefixed path.
  if (pathname?.startsWith("/admin") || pathname?.endsWith("/account/login")) {
    return null;
  }

  const onPdp = pathname?.startsWith("/product/") ?? false;
  // PDP keeps bottom-24 on mobile (clears the sticky add-to-cart bar) — the
  // ≤420px corner-hug only applies off-PDP.
  const bottomClass = onPdp ? "bottom-24 md:bottom-6" : "bottom-6 max-[420px]:bottom-3";
  
  // The website-mode fallback used to be two Danish literals, so every
  // English website-mode scaffold — and Teloz's own /en — announced its
  // assistant in Danish. The webshop branch reads shop-owned config and is
  // left alone; only the ENGINE's own default is translated here.
  //
  // Why the hook is safe, precisely: this component has exactly ONE mount,
  // app/[locale]/layout.tsx:136, which is inside the NextIntlClientProvider.
  // The /admin early-return above is NOT the reason — the hook is called
  // before it (as the rules of hooks require), and /admin does not live under
  // [locale] at all, so this component never renders there.
  // Webshop mode renders the SHOP's own words, so engine i18n cannot help —
  // this is where "Spørg Stylisten" reached /en on the eyewear canary. The
  // shop supplies per-locale variants in brand.config.copyTranslations; absent
  // ⇒ the base value, exactly as before.
  const label = ecommerceEnabled
    ? localizedBrandCopy("ai.assistantLabel", brand.ai.assistantLabel, locale)
    : tSf("consultantLabel");
  const openText = ecommerceEnabled
    ? localizedBrandCopy("ai.assistantOpenText", brand.ai.assistantOpenText, locale)
    : tSf("consultantOpenText");

  return (
    <>
      {/* Ingen custom aria-label: den synlige tekst (openText/label) ER det
          accessible name → opfylder WCAG 2.5.3 "Label in Name" (tidligere gav
          aria-label="Open {label}" mismatch mod den synlige openText). */}
      {/* data-cw-ai-assistant: stable design hook for custom designs —
          target [data-cw-ai-assistant="fab"] instead of Tailwind selectors.
          See DESIGN.md §5. */}
      {/* Mobile-safe default (pure CSS): at ≤420px the FAB renders compact —
          smaller padding/text, tighter corner offset — so it covers less
          content on phones, especially under custom designs. Never hidden
          (it's a conversion surface); desktop unchanged. Designs override
          freely via the [data-cw-ai-assistant="fab"] hook — unlayered design
          CSS always beats these utility classes. */}
      <button
        type="button"
        data-cw-ai-assistant="fab"
        onClick={() => setOpen(true)}
        className={`fixed right-6 max-[420px]:right-3 ${bottomClass} z-40 flex items-center gap-2 max-[420px]:gap-1.5 rounded-full px-5 py-3 max-[420px]:px-3.5 max-[420px]:py-2 text-sm max-[420px]:text-xs font-black uppercase tracking-wider text-white shadow-lg transition hover:scale-105 active:scale-95 ${ecommerceEnabled ? "bg-sol-accent shadow-sol-accent/20 hover:bg-sol-accent/90" : "bg-[#1E1B4B] shadow-[#1E1B4B]/30 hover:bg-[#1E1B4B]/90 border border-[#d4af37]/30"}`}
      >
        {/* A refined sparkle mark instead of the old 🤖/👔 emoji — the FAB is
            a storefront conversion surface, not a toy. */}
        <span aria-hidden className="inline-flex">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5c.3 2.9 1.7 4.3 4.6 4.6.4 0 .4.7 0 .8-2.9.3-4.3 1.7-4.6 4.6 0 .4-.7.4-.8 0-.3-2.9-1.7-4.3-4.6-4.6-.4 0-.4-.7 0-.8 2.9-.3 4.3-1.7 4.6-4.6 0-.4.7-.4.8 0Z" />
            <path d="M13 10.2c.2 1.5.9 2.2 2.3 2.3.2 0 .2.4 0 .4-1.5.2-2.2.9-2.3 2.3 0 .2-.4.2-.4 0-.2-1.5-.9-2.2-2.3-2.3-.2 0-.2-.4 0-.4 1.5-.2 2.2-.9 2.3-2.3 0-.2.4-.2.4 0Z" />
          </svg>
        </span>
        <span className="hidden sm:inline">{openText}</span>
        <span className="sm:hidden">{label}</span>
      </button>

      <AIStylistPanel open={open} onClose={() => setOpen(false)} ecommerceEnabled={ecommerceEnabled} />
    </>
  );
}
