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
      className="flex items-stretch overflow-hidden rounded-xl text-left shadow-sm"
      style={{ backgroundColor: "#141417", border: "1px solid #2a2a30" }}
    >
      {/* Fixed light-on-dark colors (not cw-stone tokens): the code chip sits
          on the dark code surface in BOTH color schemes — deterministic. */}
      <code className="min-w-0 flex-1 select-all self-center px-3.5 py-2.5 font-mono text-[11px] leading-snug" style={{ color: "#e7e5e4" }}>
        {text}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 border-l border-white/10 px-4 font-mono text-[11px] font-semibold uppercase tracking-wider text-white/80 transition hover:bg-white/10 hover:text-white"
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
