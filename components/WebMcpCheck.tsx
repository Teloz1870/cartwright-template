"use client";

import { useEffect, useState } from "react";
import { resolveModelContext, type ModelContextLike } from "@/lib/model-context";

/**
 * Klient-side WebMCP-verifikation: rapporterer om browseren eksponerer
 * document/navigator.modelContext og lister de registrerede tool-navne LIVE.
 * Tools registreres af WebMcpRegistrar (layoutet) og — fra næste skive —
 * af per-side-mounts, så listen ÆNDRER sig med navigation — derfor
 * lytter vi på draft-eventet `toolchange` i stedet for kun at læse én gang
 * on-mount. Begge draft-API'er (`getTools`, event-parret) er typeof-guarded
 * og degraderer til one-shot-listen når de mangler.
 *
 * Detektion deles med registraren via lib/model-context.ts (én kilde, ingen
 * drift). Import af den er profil-sikker: modulet er zero-import core.
 */

function readToolNames(mc: ModelContextLike, onNames: (names: string[]) => void): void {
  try {
    const raw = typeof mc.getTools === "function" ? mc.getTools() : [];
    Promise.resolve(raw)
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        onNames(
          arr.map((t) =>
            t && typeof t === "object" && "name" in t ? String((t as { name: unknown }).name) : String(t),
          ),
        );
      })
      .catch(() => {});
  } catch {
    /* getTools optional */
  }
}

export default function WebMcpCheck() {
  const [state, setState] = useState<{ status: string; available: boolean }>({
    status: "Checking…",
    available: false,
  });
  const [tools, setTools] = useState<string[]>([]);
  const { status, available } = state;

  useEffect(() => {
    const resolved = resolveModelContext();
    if (!resolved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebMCP (modelContext) is browser-only; detected after mount, starts "Checking…" for SSR parity.
      setState({
        available: false,
        status:
          "WebMCP is not available in this browser. In Chrome 146+ enable chrome://flags/#enable-webmcp-testing, or deploy with a Chrome 149 origin-trial token.",
      });
      return;
    }
    const mc = resolved.context;
    // The GoogleChromeLabs polyfill (loaded by /webmcp-check as a fallback)
    // sets window.__webmcp_registered_tools; NATIVE support makes its first
    // statement return before that assignment — so the marker's presence
    // means the polyfill, not the browser, provides document.modelContext.
    const viaPolyfill =
      (window as unknown as { __webmcp_registered_tools?: unknown })
        .__webmcp_registered_tools !== undefined;
    setState({
      available: true,
      status: viaPolyfill
        ? "WebMCP available via document.modelContext — provided by the GoogleChromeLabs polyfill (no native support in this browser)."
        : `WebMCP available via ${
            resolved.source === "document"
              ? "document.modelContext"
              : "navigator.modelContext (deprecated)"
          }.`,
    });

    readToolNames(mc, setTools);

    // Live opdatering når tools registreres/afregistreres (per-side-mounts).
    if (
      typeof mc.addEventListener === "function" &&
      typeof mc.removeEventListener === "function"
    ) {
      const onToolChange = () => readToolNames(mc, setTools);
      mc.addEventListener("toolchange", onToolChange);
      return () => mc.removeEventListener?.("toolchange", onToolChange);
    }
  }, []);

  return (
    <section className="mt-4 rounded-md border border-current/10 p-4 text-sm">
      <p className={available ? "font-medium" : "opacity-80"}>{status}</p>
      {available && (
        <div className="mt-3">
          <p className="opacity-70">Registered tools:</p>
          {tools.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {tools.map((t) => (
                <li key={t}>
                  <code>{t}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 opacity-60">
              None reported (the page may not register tools, or getTools() is unsupported).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
