"use client";

import { useEffect, useState } from "react";

/**
 * Klient-side WebMCP-verifikation: rapporterer om browseren eksponerer
 * document/navigator.modelContext og lister de registrerede tool-navne. Tools
 * registreres af WebMcpRegistrar (mountet i layoutet på webshops m. flaget on).
 */
type McLike = {
  registerTool?: unknown;
  getTools?: () => unknown;
};

export default function WebMcpCheck() {
  const [state, setState] = useState<{ status: string; available: boolean }>({
    status: "Checking…",
    available: false,
  });
  const [tools, setTools] = useState<string[]>([]);
  const { status, available } = state;

  useEffect(() => {
    const fromDoc = (document as unknown as { modelContext?: McLike }).modelContext;
    const fromNav = (navigator as unknown as { modelContext?: McLike }).modelContext;
    const mc = fromDoc ?? fromNav;
    if (!mc || typeof mc.registerTool !== "function") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebMCP (modelContext) is browser-only; detected after mount, starts "Checking…" for SSR parity.
      setState({
        available: false,
        status:
          "WebMCP is not available in this browser. In Chrome 146+ enable chrome://flags/#enable-webmcp-testing, or deploy with a Chrome 149 origin-trial token.",
      });
      return;
    }
    setState({
      available: true,
      status: `WebMCP available via ${fromDoc ? "document.modelContext" : "navigator.modelContext (deprecated)"}.`,
    });
    try {
      const raw = typeof mc.getTools === "function" ? mc.getTools() : [];
      Promise.resolve(raw)
        .then((list) => {
          const arr = Array.isArray(list) ? list : [];
          setTools(
            arr.map((t) =>
              t && typeof t === "object" && "name" in t ? String((t as { name: unknown }).name) : String(t),
            ),
          );
        })
        .catch(() => {});
    } catch {
      /* getTools optional */
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
