"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AIStylistPanel from "@/components/AIStylistPanel";
import { brand } from "@/brand.config";

/**
 * Float-knap nederst-højre der åbner AI-stylist-panelet. Vises på alle
 * STOREFRONT-sider via root layout — men skjules på /admin/* fordi der
 * lever en separat AdminChatLauncher i admin-layoutet (samme position).
 */
export default function AIStylistButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Skjul storefront-stylisten i admin-området så den ikke overlapper
  // operatør-copiloten. Også skjult på /konto/login så login-skærmen er ren.
  if (pathname?.startsWith("/admin") || pathname === "/konto/login") {
    return null;
  }

  // Phase 7: PDP har mobile sticky-add-to-cart bar (≤md). FAB skal løftes
  // ~5rem så den ikke overlapper bar'en (~76-90px med safe-area-inset).
  // På desktop (md+) er sticky-bar skjult, så FAB sidder ved 1.5rem som før.
  const onPdp = pathname?.startsWith("/produkt/") ?? false;
  const bottomClass = onPdp ? "bottom-24 md:bottom-6" : "bottom-6";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Åbn ${brand.ai.assistantLabel}`}
        className={`fixed right-6 ${bottomClass} z-40 flex items-center gap-2 rounded-full bg-sol-accent px-5 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-sol-accent/20 transition hover:scale-105 hover:bg-sol-accent/90 active:scale-95`}
      >
        <span aria-hidden className="text-base">
          🤖
        </span>
        <span className="hidden sm:inline">{brand.ai.assistantOpenText}</span>
        <span className="sm:hidden">{brand.ai.assistantLabel}</span>
      </button>

      <AIStylistPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
