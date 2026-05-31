"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AIStylistPanel from "@/components/AIStylistPanel";
import { brand } from "@/brand.config";

export default function AIStylistButton({ ecommerceEnabled = true }: { ecommerceEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith("/admin") || pathname === "/account/login") {
    return null;
  }

  const onPdp = pathname?.startsWith("/product/") ?? false;
  const bottomClass = onPdp ? "bottom-24 md:bottom-6" : "bottom-6";
  
  const label = ecommerceEnabled ? brand.ai.assistantLabel : "AI Konsulent";
  const openText = ecommerceEnabled ? brand.ai.assistantOpenText : "Spørg AI Konsulenten";

  return (
    <>
      {/* Ingen custom aria-label: den synlige tekst (openText/label) ER det
          accessible name → opfylder WCAG 2.5.3 "Label in Name" (tidligere gav
          aria-label="Open {label}" mismatch mod den synlige openText). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed right-6 ${bottomClass} z-40 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg transition hover:scale-105 active:scale-95 ${ecommerceEnabled ? "bg-sol-accent shadow-sol-accent/20 hover:bg-sol-accent/90" : "bg-[#1E1B4B] shadow-[#1E1B4B]/30 hover:bg-[#1E1B4B]/90 border border-[#d4af37]/30"}`}
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
