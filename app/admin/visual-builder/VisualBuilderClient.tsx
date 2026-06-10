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
  magicPlanAction,
  magicGenerateNodeAction,
} from "./actions";
import type { MagicSource } from "@/lib/magic/plan-schema";

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

type MagicNodeStatus = {
  key: string;
  source: MagicSource;
  state: "pending" | "done" | "skipped";
  reason?: string;
};

export default function VisualBuilderClient({
  pages,
  defaultLocale,
  magicBuilder = false,
}: {
  pages: { slug: string; title: string }[];
  defaultLocale: string;
  /** Compile-time gate (passed as a prop — never read brand.features client-side). */
  magicBuilder?: boolean;
}) {
  const [slug, setSlug] = useState(pages[0]?.slug ?? "");
  const [nodes, setNodes] = useState<BuilderNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // ─── Magic Builder: prompt → plan → per-node generate → stream into preview ──
  const [magicIntent, setMagicIntent] = useState("");
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicStatuses, setMagicStatuses] = useState<MagicNodeStatus[]>([]);

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
      setStatus("Add at least one section before publishing.");
      return;
    }
    setStatus("Publishing …");
    const layout = {
      sections: nodes.map((n) => ({
        id: n.id,
        key: n.key,
        enabled: n.enabled,
        props: n.props,
      })),
    };
    const res = await publishPageLayout(slug, layout);
    setStatus(res.ok ? "Published ✓" : `Error: ${res.error}`);
  }, [slug, nodes]);

  // Magic: plan the page, then generate node-by-node so each section streams
  // into the preview the moment its adapter resolves (the appended `nodes`
  // trigger the existing postMessage→iframe effect). Fail-soft: a node that
  // can't be generated is marked SKIPPED (never silent), the rest continue.
  const runMagic = useCallback(async () => {
    if (magicBusy) return;
    const intent = magicIntent.trim();
    if (intent.length < 8) {
      setStatus("Describe the page in a bit more detail (min. 8 characters).");
      return;
    }
    setMagicBusy(true);
    setMagicStatuses([]);
    setStatus("Planning the page …");

    const planRes = await magicPlanAction(intent);
    if (!planRes.ok) {
      setMagicBusy(false);
      setStatus(`Error: ${planRes.error}`);
      return;
    }

    const plan = planRes.plan;
    setMagicStatuses(
      plan.map((n) => ({ key: n.key, source: n.source, state: "pending" as const })),
    );
    setStatus(`Generating ${plan.length} sections …`);

    for (let i = 0; i < plan.length; i++) {
      const node = plan[i];
      const res = await magicGenerateNodeAction({
        key: node.key,
        source: node.source,
        prompt: node.prompt,
      });
      if (res.ok) {
        const built: BuilderNode = {
          id: newId(),
          key: res.section.key,
          enabled: true,
          props: res.section.props,
        };
        setNodes((prev) => [...prev, built]);
        setMagicStatuses((prev) =>
          prev.map((s, k) => (k === i ? { ...s, state: "done" } : s)),
        );
      } else {
        setMagicStatuses((prev) =>
          prev.map((s, k) =>
            k === i ? { ...s, state: "skipped", reason: res.error } : s,
          ),
        );
      }
    }

    setMagicBusy(false);
    setStatus("Magic page generated ✓ — review in preview and publish.");
  }, [magicBusy, magicIntent]);

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
            Publish
          </button>
        </div>
      </header>

      {magicBuilder ? (
        <section className="rounded-lg border border-cw-terracotta/30 bg-cw-terracotta/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">✨ Magic Builder</span>
            <span className="text-xs text-stone-500">
              Describe a whole page — AI lays out a plan of whitelisted sections and fills them on-brand.
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <textarea
              className="min-h-[60px] flex-1 rounded border px-2 py-1 text-sm"
              placeholder="e.g. A landing page for a coffee roastery: hero, 3 value cards, pricing, reviews, FAQ and a closing CTA."
              value={magicIntent}
              onChange={(e) => setMagicIntent(e.target.value)}
              disabled={magicBusy}
            />
            <button
              onClick={runMagic}
              disabled={magicBusy || magicIntent.trim().length < 8}
              className="h-10 shrink-0 self-start rounded bg-cw-terracotta px-4 py-1.5 text-sm font-semibold text-white hover:bg-cw-terracotta-strong disabled:opacity-50"
            >
              {magicBusy ? "Generating …" : "Generate page"}
            </button>
          </div>
          {magicStatuses.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {magicStatuses.map((s, i) => (
                <li
                  key={i}
                  title={s.reason ?? ""}
                  className={`rounded px-2 py-0.5 text-xs ${
                    s.state === "done"
                      ? "bg-green-100 text-green-800"
                      : s.state === "skipped"
                        ? "bg-red-100 text-red-700"
                        : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {s.state === "done" ? "✓" : s.state === "skipped" ? "✕" : "…"} {s.key}
                  {s.source === "v0" ? " (v0)" : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr_300px]">
        {/* Venstre: section-liste */}
        <aside className="rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-semibold">Sections</h2>
          {loading ? (
            <p className="text-sm text-stone-500">Loading …</p>
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
                    title={n.enabled ? "Hide" : "Show"}
                    onClick={() => toggleEnabled(n.id)}
                    className="px-1 text-xs"
                  >
                    {n.enabled ? "👁" : "🚫"}
                  </button>
                  <button title="Up" onClick={() => move(n.id, -1)} disabled={i === 0} className="px-1 text-xs disabled:opacity-30">↑</button>
                  <button title="Down" onClick={() => move(n.id, 1)} disabled={i === nodes.length - 1} className="px-1 text-xs disabled:opacity-30">↓</button>
                  <button title="Delete" onClick={() => removeSection(n.id)} className="px-1 text-xs text-red-600">✕</button>
                </li>
              ))}
              {nodes.length === 0 ? (
                <li className="text-sm text-stone-500">No sections yet.</li>
              ) : null}
            </ul>
          )}

          <div className="mt-3 border-t pt-3">
            <p className="mb-1 text-xs font-semibold text-stone-500">Add section</p>
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
            <p className="text-sm text-stone-500">Select a section to edit.</p>
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
        <label className="mb-1 block text-xs font-semibold">✨ AI fill</label>
        <textarea
          className="w-full rounded border px-2 py-1 text-sm"
          rows={2}
          placeholder="Describe what the section should contain …"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <button
          className="mt-1 rounded border px-2 py-1 text-xs hover:bg-stone-50 disabled:opacity-50"
          onClick={runAi}
          disabled={aiBusy || aiPrompt.trim().length < 3}
        >
          {aiBusy ? "Generating …" : "Generate with AI"}
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
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  className="rounded border px-2 py-1 text-xs hover:bg-stone-50"
                  onClick={() =>
                    onChange(f.name, [...features, { title: "", body: "" }])
                  }
                >
                  + Add feature
                </button>
              </div>
            </div>
          );
        }

        if (f.type === "boolean") {
          return (
            <label key={f.name} className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={node.props[f.name] === true}
                onChange={(e) => onChange(f.name, e.target.checked)}
              />
              {f.label}
            </label>
          );
        }

        if (f.type === "list") {
          return (
            <ListField
              key={`${node.id}:${f.name}`}
              label={f.label}
              optional={f.optional}
              value={node.props[f.name]}
              onChange={(v) => onChange(f.name, v)}
            />
          );
        }

        if (f.type === "json") {
          return (
            <JsonField
              key={`${node.id}:${f.name}`}
              label={f.label}
              optional={f.optional}
              value={node.props[f.name]}
              onChange={(v) => onChange(f.name, v)}
            />
          );
        }

        if (f.type === "number") {
          const num = node.props[f.name];
          return (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-semibold">
                {f.label}
                {f.optional ? <span className="text-stone-400"> (valgfri)</span> : null}
              </label>
              <input
                type="number"
                className="w-full rounded border px-2 py-1 text-sm"
                value={typeof num === "number" ? num : ""}
                onChange={(e) =>
                  onChange(f.name, e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
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

/**
 * List-felt (string[]) — én værdi pr. linje. Lokal tekst-state så tomme
 * mellem-linjer kan skrives mens den gemte prop holdes ren (trimmet, ingen
 * tomme). Keyed by node:field på call-site → resynk ved sektion-skift.
 */
function ListField({
  label,
  optional,
  value,
  onChange,
}: {
  label: string;
  optional?: boolean;
  value: unknown;
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState(() =>
    Array.isArray(value) ? (value as string[]).join("\n") : "",
  );
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold">
        {label}
        {optional ? <span className="text-stone-400"> (valgfri)</span> : null}
      </label>
      <textarea
        className="w-full rounded border px-2 py-1 text-sm"
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
      />
    </div>
  );
}

/**
 * JSON-felt for komplekse array/objekt-props (typisk AI-udfyldt). Lokal tekst-
 * state så ugyldig mellem-tilstand kan skrives; gyldig JSON propageres straks.
 * Keyed by node:field på call-site → resynk ved sektion-skift.
 */
function JsonField({
  label,
  optional,
  value,
  onChange,
}: {
  label: string;
  optional?: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(() => {
    try {
      return JSON.stringify(value ?? [], null, 2);
    } catch {
      return "[]";
    }
  });
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold">
        {label}
        {optional ? <span className="text-stone-400"> (valgfri)</span> : null}
      </label>
      <textarea
        className="w-full rounded border px-2 py-1 font-mono text-xs"
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed: unknown = JSON.parse(e.target.value);
            setErr(null);
            onChange(parsed);
          } catch {
            setErr("Ugyldig JSON");
          }
        }}
      />
      {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
      <p className="mt-1 text-xs text-stone-400">Rediger som JSON. Udfyldes typisk af AI.</p>
    </div>
  );
}
