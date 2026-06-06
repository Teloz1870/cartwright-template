"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SECTION_REGISTRY,
  type SectionKey,
} from "@/lib/builder/section-registry";
import { SECTION_FIELDS } from "./fields";
import {
  publishPageLayout,
  loadPageLayout,
  generateSectionAction,
} from "./actions";

/**
 * Visual Builder — admin canvas. Venstre: side- + section-panel (tilføj/skjul/
 * reorder/slet). Midt: live-preview-iframe (storefront-render af det aktuelle
 * draft-tree via sessionStorage + postMessage). Højre: inspector (section-props).
 *
 * Publish går gennem `publishPageLayout` → pages.set_layout (tool + audit). Indtil
 * publish lever draftet kun i klienten + preview — storefront er uberørt.
 */

type BuilderNode = {
  id: string;
  key: SectionKey;
  enabled: boolean;
  props: Record<string, unknown>;
};

const PREVIEW_STORAGE_KEY = "cw:builder:preview";
const PREVIEW_MESSAGE_TYPE = "cw-builder-preview";

const SECTION_OPTIONS = Object.entries(SECTION_REGISTRY).map(([key, entry]) => ({
  key: key as SectionKey,
  label: entry.label,
}));

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s_${Math.random().toString(36).slice(2)}`;
}

export default function VisualBuilderClient({
  pages,
  defaultLocale,
}: {
  pages: { slug: string; title: string }[];
  defaultLocale: string;
}) {
  const [slug, setSlug] = useState(pages[0]?.slug ?? "");
  const [nodes, setNodes] = useState<BuilderNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Load existing layout when the selected page changes. Al state-mutation sker
  // inde i den async funktion (ikke synkront i effect-body), så vi ikke trigger
  // cascading renders (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setStatus(null);
      const res = await loadPageLayout(slug);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setStatus(`Kunne ikke hente layout: ${res.error}`);
        setNodes([]);
        return;
      }
      const loaded: BuilderNode[] = (res.layout?.sections ?? []).map((s) => ({
        id: s.id,
        key: s.key as SectionKey,
        enabled: s.enabled,
        props:
          (s.props as Record<string, unknown> | undefined) ??
          structuredClone(SECTION_REGISTRY[s.key as SectionKey].defaultProps),
      }));
      setNodes(loaded);
      setSelectedId(loaded[0]?.id ?? null);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Push the current draft to the preview iframe (sessionStorage for first load,
  // postMessage for live updates). Same-origin iframe shares sessionStorage.
  useEffect(() => {
    const tree = { sections: nodes };
    try {
      sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(tree));
    } catch {
      /* sessionStorage may be unavailable; postMessage still works */
    }
    iframeRef.current?.contentWindow?.postMessage(
      { type: PREVIEW_MESSAGE_TYPE, tree },
      window.location.origin,
    );
  }, [nodes]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const addSection = useCallback((key: SectionKey) => {
    const node: BuilderNode = {
      id: newId(),
      key,
      enabled: true,
      props: structuredClone(SECTION_REGISTRY[key].defaultProps),
    };
    setNodes((prev) => [...prev, node]);
    setSelectedId(node.id);
  }, []);

  const toggleEnabled = useCallback((id: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)),
    );
  }, []);

  const removeSection = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setNodes((prev) => {
      const i = prev.findIndex((n) => n.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const updateProp = useCallback(
    (id: string, name: string, value: unknown) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, props: { ...n.props, [name]: value } } : n,
        ),
      );
    },
    [],
  );

  const replaceProps = useCallback(
    (id: string, props: Record<string, unknown>) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, props } : n)),
      );
    },
    [],
  );

  const publish = useCallback(async () => {
    if (!slug) return;
    if (nodes.length === 0) {
      setStatus("Tilføj mindst én sektion før du publicerer.");
      return;
    }
    setStatus("Publicerer …");
    const layout = {
      sections: nodes.map((n) => ({
        id: n.id,
        key: n.key,
        enabled: n.enabled,
        props: n.props,
      })),
    };
    const res = await publishPageLayout(slug, layout);
    setStatus(res.ok ? "Publiceret ✓" : `Fejl: ${res.error}`);
  }, [slug, nodes]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Visual Builder</h1>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          >
            {pages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title} (/{p.slug})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          {status ? <span className="text-sm text-stone-600">{status}</span> : null}
          <button
            onClick={publish}
            className="rounded bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-700"
          >
            Publicér
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr_300px]">
        {/* Venstre: section-liste */}
        <aside className="rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-semibold">Sektioner</h2>
          {loading ? (
            <p className="text-sm text-stone-500">Henter …</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {nodes.map((n, i) => (
                <li
                  key={n.id}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${
                    n.id === selectedId ? "bg-stone-100" : ""
                  }`}
                >
                  <button
                    className="flex-1 truncate text-left"
                    onClick={() => setSelectedId(n.id)}
                  >
                    {SECTION_REGISTRY[n.key].label}
                  </button>
                  <button
                    title={n.enabled ? "Skjul" : "Vis"}
                    onClick={() => toggleEnabled(n.id)}
                    className="px-1 text-xs"
                  >
                    {n.enabled ? "👁" : "🚫"}
                  </button>
                  <button title="Op" onClick={() => move(n.id, -1)} disabled={i === 0} className="px-1 text-xs disabled:opacity-30">↑</button>
                  <button title="Ned" onClick={() => move(n.id, 1)} disabled={i === nodes.length - 1} className="px-1 text-xs disabled:opacity-30">↓</button>
                  <button title="Slet" onClick={() => removeSection(n.id)} className="px-1 text-xs text-red-600">✕</button>
                </li>
              ))}
              {nodes.length === 0 ? (
                <li className="text-sm text-stone-500">Ingen sektioner endnu.</li>
              ) : null}
            </ul>
          )}

          <div className="mt-3 border-t pt-3">
            <p className="mb-1 text-xs font-semibold text-stone-500">Tilføj sektion</p>
            <div className="flex flex-wrap gap-1">
              {SECTION_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => addSection(o.key)}
                  className="rounded border px-2 py-1 text-xs hover:bg-stone-50"
                >
                  + {o.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Midt: live preview */}
        <section className="overflow-hidden rounded-lg border">
          <div className="border-b bg-stone-50 px-3 py-1.5 text-xs text-stone-500">
            Live preview — /{defaultLocale}/info/{slug}
          </div>
          <iframe
            ref={iframeRef}
            title="Live preview"
            src={`/${defaultLocale}/builder-preview`}
            className="h-[70vh] w-full bg-white"
          />
        </section>

        {/* Højre: inspector */}
        <aside className="rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-semibold">Inspector</h2>
          {selected ? (
            <Inspector
              node={selected}
              onChange={(name, value) => updateProp(selected.id, name, value)}
              onReplaceProps={(props) => replaceProps(selected.id, props)}
            />
          ) : (
            <p className="text-sm text-stone-500">Vælg en sektion for at redigere.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Inspector({
  node,
  onChange,
  onReplaceProps,
}: {
  node: BuilderNode;
  onChange: (name: string, value: unknown) => void;
  onReplaceProps: (props: Record<string, unknown>) => void;
}) {
  const fields = SECTION_FIELDS[node.key];
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function runAi() {
    setAiBusy(true);
    setAiError(null);
    const res = await generateSectionAction(node.key, aiPrompt);
    setAiBusy(false);
    if (res.ok) {
      onReplaceProps(res.props);
      setAiPrompt("");
    } else {
      setAiError(res.error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-dashed p-2">
        <label className="mb-1 block text-xs font-semibold">✨ AI-udfyld</label>
        <textarea
          className="w-full rounded border px-2 py-1 text-sm"
          rows={2}
          placeholder="Beskriv hvad sektionen skal indeholde …"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <button
          className="mt-1 rounded border px-2 py-1 text-xs hover:bg-stone-50 disabled:opacity-50"
          onClick={runAi}
          disabled={aiBusy || aiPrompt.trim().length < 3}
        >
          {aiBusy ? "Genererer …" : "Generér med AI"}
        </button>
        {aiError ? (
          <p className="mt-1 text-xs text-red-600">{aiError}</p>
        ) : null}
      </div>
      {fields.map((f) => {
        if (f.type === "features") {
          const features = (node.props[f.name] as
            | { title: string; body: string }[]
            | undefined) ?? [];
          return (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-semibold">{f.label}</label>
              <div className="flex flex-col gap-2">
                {features.map((feat, i) => (
                  <div key={i} className="rounded border p-2">
                    <input
                      className="mb-1 w-full rounded border px-2 py-1 text-sm"
                      placeholder="Titel"
                      value={feat.title}
                      onChange={(e) => {
                        const next = features.map((x, k) =>
                          k === i ? { ...x, title: e.target.value } : x,
                        );
                        onChange(f.name, next);
                      }}
                    />
                    <textarea
                      className="w-full rounded border px-2 py-1 text-sm"
                      placeholder="Tekst"
                      value={feat.body}
                      onChange={(e) => {
                        const next = features.map((x, k) =>
                          k === i ? { ...x, body: e.target.value } : x,
                        );
                        onChange(f.name, next);
                      }}
                    />
                    <button
                      className="mt-1 text-xs text-red-600"
                      onClick={() =>
                        onChange(
                          f.name,
                          features.filter((_, k) => k !== i),
                        )
                      }
                    >
                      Fjern
                    </button>
                  </div>
                ))}
                <button
                  className="rounded border px-2 py-1 text-xs hover:bg-stone-50"
                  onClick={() =>
                    onChange(f.name, [...features, { title: "", body: "" }])
                  }
                >
                  + Tilføj feature
                </button>
              </div>
            </div>
          );
        }

        const value = (node.props[f.name] as string | undefined) ?? "";
        return (
          <div key={f.name}>
            <label className="mb-1 block text-xs font-semibold">
              {f.label}
              {f.optional ? <span className="text-stone-400"> (valgfri)</span> : null}
            </label>
            {f.type === "textarea" ? (
              <textarea
                className="w-full rounded border px-2 py-1 text-sm"
                rows={3}
                value={value}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            ) : (
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                value={value}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
