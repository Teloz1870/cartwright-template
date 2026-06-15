"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AIStylistPanel from "@/components/AIStylistPanel";
import { brand } from "@/brand.config";

export default function AIStylistButton({ ecommerceEnabled = true }: { ecommerceEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
  
  const label = ecommerceEnabled ? brand.ai.assistantLabel : "AI Konsulent";
  const openText = ecommerceEnabled ? brand.ai.assistantOpenText : "Spørg AI Konsulenten";

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
        <span aria-hidden className="text-base">
          {ecommerceEnabled ? "🤖" : "👔"}
        </span>
        <span className="hidden sm:inline">{openText}</span>
        <span className="sm:hidden">{label}</span>
      </button>

      <AIStylistPanel open={open} onClose={() => setOpen(false)} ecommerceEnabled={ecommerceEnabled} />
    </>
  );
}
