"use client";

import { useState } from "react";

/**
 * Locked-look Skin×Voice notice — mixer-preview only.
 *
 * Shown when the previewed combination pairs a Voice (vertical preset) with a
 * Skin whose rendering does NOT track the injected palette
 * (`designTracksPalette` → false, see designs/options.ts): such packs own a
 * private token prefix (saas-*, halo-*, at-*, …), so the Voice's palette
 * (injected as sol-* / cw-* vars via paletteToFullThemeCss) never reaches
 * their accents — at most a stray shared token re-tones some text (e.g.
 * webshop-bold reads cw-ink). Without this hint the preview silently looks
 * like "the Voice did nothing". Deliberately makes NO claim about the Voice's
 * COPY — many locked
 * packs also ignore the `genome` prop (hardcoded copy), so palette is the only
 * claim that is true for all of them.
 *
 * Renders ONLY on the gated mixer-preview route (dev-only / `mixerPreviewEnabled`,
 * 404 in production by default → canaries never render it). Deliberately styled
 * with self-contained neutral colors, NOT theme tokens — a locked-look skin's
 * tokens are exactly what we can't rely on here.
 */
export function LockedLookNotice({ designName }: { designName: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-[9999] mx-auto flex w-fit max-w-[min(36rem,92vw)] items-start gap-3 rounded-2xl bg-neutral-900/90 px-4 py-2.5 text-sm text-white shadow-lg backdrop-blur"
    >
      <span>
        <strong>{designName}</strong>{" "}keeps its own locked look — this
        Voice&apos;s palette won&apos;t restyle it. Pick a palette-adaptive
        Skin (like Aurora) to see the Voice&apos;s full vibe.
      </span>
      <button
        type="button"
        aria-label="Dismiss notice"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-full px-2 py-0.5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        ×
      </button>
    </div>
  );
}
