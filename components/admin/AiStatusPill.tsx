"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Local-AI plan Fase 1.9: status-pill der altid viser hvor AI'en kører.
 *
 * Tilstande:
 *   - 🔒 grøn: Local AI · Gemma 4 (e4b) · 1.2s avg
 *   - ☁️ neutral: Cloud AI · Claude Haiku 4.5
 *   - ⚠️ orange: Auto · degraded til Claude (fejl for 3 min siden)
 *   - ❌ rød: AI offline · klik for at fixe
 *
 * Klik → dropdown med provider info + today's usage + extensions-slot
 * (Voice-planen injicerer voice-min/dag stats der i commit 7).
 *
 * Renderes som fixed bottom-right element. Synlig kun for admin-routes
 * (mounted i app/admin/layout.tsx).
 */

export type StatusKind = "local-online" | "cloud" | "degraded" | "offline" | "unknown";

export type AiStatus = {
  kind: StatusKind;
  provider: string;
  model: string;
  /** Latency in ms — null hvis endnu ikke målt */
  latencyMs?: number | null;
  /** Til "degraded" — hvornår skete sidste fejl */
  lastDegradedAt?: string | null;
  /** Til usage-view — count per provider for i dag */
  todayUsage?: Record<string, number>;
};

type Props = {
  /** Initial status fra server-side render. Polles refresh efter mount. */
  initial: AiStatus;
  /**
   * Voice-plan extensions-slot. Injicér voice-usage-section her uden at
   * skulle refaktorere komponenten. Hver entry rendres i dropdown'en under
   * "Today's usage".
   */
  extensions?: ReactNode[];
  /** Path til health-endpoint. Hvis tom, ingen polling. */
  healthEndpoint?: string;
};

const PILL_VARIANTS: Record<StatusKind, { bg: string; icon: string; text: string }> = {
  "local-online": {
    bg: "bg-green-100 text-green-900 border-green-300",
    icon: "🔒",
    text: "Local AI",
  },
  cloud: {
    bg: "bg-sol-cream text-sol-ink border-sol-ink/15",
    icon: "☁️",
    text: "Cloud AI",
  },
  degraded: {
    bg: "bg-amber-100 text-amber-900 border-amber-300",
    icon: "⚠️",
    text: "Auto · degraded",
  },
  offline: {
    bg: "bg-red-100 text-red-900 border-red-300",
    icon: "❌",
    text: "AI offline",
  },
  unknown: {
    bg: "bg-sol-cream text-sol-muted border-sol-ink/15",
    icon: "·",
    text: "AI status ukendt",
  },
};

export default function AiStatusPill({
  initial,
  extensions = [],
  healthEndpoint,
}: Props) {
  const [status, setStatus] = useState(initial);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!healthEndpoint) return;
    const interval = window.setInterval(async () => {
      try {
        const r = await fetch(healthEndpoint, { cache: "no-store" });
        if (!r.ok) return;
        const next = (await r.json()) as Partial<AiStatus>;
        setStatus((cur) => ({ ...cur, ...next }));
      } catch {
        // Silent — pill opdaterer ikke hvis health er nede
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [healthEndpoint]);

  const variant = PILL_VARIANTS[status.kind];

  return (
    <div className="fixed bottom-4 right-4 z-30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wider shadow-sol-soft transition hover:shadow-sol-lift ${variant.bg}`}
        aria-expanded={open}
        aria-label="AI provider status"
      >
        <span className="text-sm leading-none">{variant.icon}</span>
        <span>{variant.text}</span>
        <span className="font-mono text-[10px] opacity-75">{status.model}</span>
        {typeof status.latencyMs === "number" && (
          <span className="font-mono text-[10px] opacity-75">
            {status.latencyMs}ms
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 rounded-xl border border-sol-ink/10 bg-white p-4 shadow-sol-lift">
          <div className="mb-3 border-b border-sol-ink/10 pb-3">
            <div className="text-xs font-black uppercase tracking-widest text-sol-muted">
              Provider
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-sol-ink">
              {status.provider} · {status.model}
            </div>
            {status.kind === "degraded" && status.lastDegradedAt && (
              <div className="mt-1 text-[11px] text-amber-800">
                Faldt tilbage til cloud{" "}
                {new Date(status.lastDegradedAt).toLocaleTimeString("da-DK")}.
                Tjek Ollama-status i /admin/integrations.
              </div>
            )}
          </div>

          {status.todayUsage && (
            <div className="mb-3 border-b border-sol-ink/10 pb-3">
              <div className="text-xs font-black uppercase tracking-widest text-sol-muted">
                I dag
              </div>
              <ul className="mt-1 space-y-0.5 text-xs">
                {Object.entries(status.todayUsage).map(([provider, count]) => (
                  <li key={provider} className="flex justify-between">
                    <span className="text-sol-muted">{provider}</span>
                    <span className="font-mono font-bold text-sol-ink">
                      {count} kald
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extensions.length > 0 && (
            <div className="mb-3 space-y-2 border-b border-sol-ink/10 pb-3">
              {extensions.map((ext, i) => (
                <div key={i}>{ext}</div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Link
              href="/admin/integrations"
              className="flex-1 rounded-full border border-sol-ink/15 px-3 py-1.5 text-center text-xs font-black uppercase tracking-wider text-sol-ink transition hover:bg-sol-accent hover:text-white hover:border-sol-accent"
            >
              Settings
            </Link>
            <Link
              href="/admin/ai"
              className="flex-1 rounded-full border border-sol-ink/15 px-3 py-1.5 text-center text-xs font-black uppercase tracking-wider text-sol-ink transition hover:bg-sol-accent hover:text-white hover:border-sol-accent"
            >
              Test
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
