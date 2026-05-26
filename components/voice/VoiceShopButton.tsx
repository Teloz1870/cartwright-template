"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { brand } from "@/brand.config";
import VoiceShopOverlay from "@/components/voice/VoiceShopOverlay";

/**
 * Voice-plan Fase 1.7: floating mic-knap.
 *
 * Position: lige over AIStylistButton (samme højre-kant, men 5rem højere) så
 * begge FABs er synlige uden at overlappe. På PDP-sider stables de yderligere
 * for at undgå sticky-add-to-cart-bar'en på mobil.
 *
 * Render-gate:
 *   1. brand.features.voiceShop (compile-time per shop)
 *   2. settings.voiceShopEnabled + apiKey (runtime via parent server component)
 *
 * Brug VoiceShopMount fra components/voice/VoiceShopMount for korrekt gating;
 * denne komponent forudsætter at det ydre gate har sagt ja.
 */
export default function VoiceShopButton({
  capabilities,
}: {
  capabilities: {
    vision: boolean;
    maxMinutes: number;
    visionEnabled: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith("/admin") || pathname === "/konto/login") {
    return null;
  }

  const onPdp = pathname?.startsWith("/produkt/") ?? false;
  // Stack over AIStylistButton (~3.5rem høj + 6 padding = bottom-22) +
  // PDP-offset.
  const bottomClass = onPdp ? "bottom-44 md:bottom-24" : "bottom-24";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Start voice-shopping"
        className={`fixed right-6 ${bottomClass} z-40 flex h-12 w-12 items-center justify-center rounded-full bg-sol-ink text-white shadow-lg shadow-sol-ink/20 transition hover:scale-105 hover:bg-sol-accent active:scale-95`}
      >
        <MicIcon className="h-5 w-5" />
        <span className="sr-only">Snak med {brand.ai?.assistantLabel ?? "shoppen"}</span>
      </button>

      {open && (
        <VoiceShopOverlay
          capabilities={capabilities}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
