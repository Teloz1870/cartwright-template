"use client";

import { useEffect, useRef, useState } from "react";

/**
 * First-run welcome canvas — tiny client island: a one-line command/prompt
 * with a copy-to-clipboard button. Labels come in as props so the server
 * parent owns all i18n (next-intl messages); this island ships no messages.
 */
export function CopyCommand({
  text,
  copyLabel,
  copiedLabel,
}: {
  text: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — fail quietly;
      // the text is selectable right next to the button.
    }
  }

  return (
    // Fixed near-black surface (inline, not a cw token): the code chip must be
    // a deterministic dark terminal in EVERY palette and color scheme.
    <div
      className="flex flex-wrap items-stretch overflow-hidden rounded-xl text-left shadow-sm"
      style={{ backgroundColor: "#141417", border: "1px solid #2a2a30" }}
    >
      {/* Fixed light-on-dark colors (not cw-stone tokens): the code chip sits
          on the dark code surface in BOTH color schemes — deterministic.
          The text sizes are rem, so they grow with the visitor's font size
          (TREND34-b5). `min-w-[min(100%,7rem)]` + `flex-wrap` let the button drop
          below the command once grown text no longer fits beside it, instead
          of the chip forcing the card wider than a phone; at the default
          size the two always share one row, exactly as before. The 7rem floor
          is sized so that holds at the narrowest phone (a 228px chip at 320px)
          for the WIDEST label too: the label changes to Copied!/Kopieret! on a
          click, and with a 9rem floor that longer label pushed the button onto
          its own row for two seconds and shifted the cards (TREND34-b5 R3).
          The button's `min-h` is one line of the command (its `py-2.5` plus
          one `leading-snug` line), so on a row of its own it keeps that
          height instead of shrinking to its text, and on a shared row it is
          never taller than the command beside it. Its `border-t` + `-mt-px` is the
          divider from the command above once wrapped; on a shared row that
          top border sits in the chip's own 1px border and is clipped by
          `overflow-hidden`, so the shared row renders as before.
          Wrapped, the button fills its row (TREND34-b5 R2), so the divider and
          the click target run the chip's full width: it has `grow`, and the
          command's grow of 999999 leaves it under 1/64px of a shared row's
          free space, below the layout unit, so a shared row is unchanged. Its
          `-ml-px` puts its left border under the chip's own border once it
          starts a row (clipped like the top one); the command's `mr-px` pays
          that pixel back, so on a shared row both keep their old place. */}
      <code className="mr-px min-w-[min(100%,7rem)] flex-[999999_1_0%] select-all self-center px-3.5 py-2.5 font-mono text-[0.6875rem] leading-snug" style={{ color: "#e7e5e4" }}>
        {text}
      </code>
      <button
        type="button"
        onClick={copy}
        className="-mt-px -ml-px grow shrink-0 min-h-[calc(1.25rem_+_0.6875rem_*_1.375)] border-l border-t border-white/10 px-4 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        {copied ? copiedLabel : copyLabel}
      </button>
      {/* Passive status region announces the copy result. aria-live belongs on
          a separate off-focus node, never on the interactive <button> itself
          (AT announces button live-regions inconsistently). */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </div>
  );
}
