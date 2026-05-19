"use client";

import { useState } from "react";

type Props = {
  argsJson: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  errorMsg: string | null;
};

/**
 * Klient-side expandable JSON-viewer for audit-entry-payloads. Holdt skjult
 * default fordi de fylder meget; bruger klikker "vis payload" for at åbne.
 */
export default function PayloadViewer({
  argsJson,
  beforeJson,
  afterJson,
  errorMsg,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-sol-accent underline-offset-2 hover:underline"
      >
        Vis payload
      </button>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-bold text-sol-muted hover:text-sol-ink"
      >
        Skjul ↑
      </button>
      {errorMsg && (
        <Block label="Fejl" content={errorMsg} tone="error" />
      )}
      {argsJson && <Block label="Input (args)" content={pretty(argsJson)} />}
      {beforeJson && <Block label="Før-tilstand" content={pretty(beforeJson)} />}
      {afterJson && <Block label="Resultat" content={pretty(afterJson)} />}
    </div>
  );
}

function Block({
  label,
  content,
  tone = "default",
}: {
  label: string;
  content: string;
  tone?: "default" | "error";
}) {
  return (
    <div>
      <p
        className={`mb-1 text-[10px] font-black uppercase tracking-wider ${
          tone === "error" ? "text-red-700" : "text-sol-muted"
        }`}
      >
        {label}
      </p>
      <pre
        className={`max-h-40 overflow-auto whitespace-pre-wrap rounded-md px-2 py-1.5 font-mono text-[11px] leading-tight ${
          tone === "error"
            ? "bg-red-50 text-red-800"
            : "bg-sol-cream text-sol-ink"
        }`}
      >
        {content}
      </pre>
    </div>
  );
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
