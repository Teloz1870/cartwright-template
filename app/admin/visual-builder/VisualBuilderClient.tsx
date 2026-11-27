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
import type { MagicSource } from "@/lib/magic/plan-schema";
import type { SectionEffectValue } from "@/lib/builder/effects";
import type { GeneratedSection } from "@/lib/magic/types";
import type { PageLayout } from "@/lib/builder/section-schema";

/**
 * Visual Builder — admin canvas. Left: page + section panel (add/hide/
 * reorder/delete). Middle: live preview iframe (storefront render of the current
 * draft tree via sessionStorage + postMessage). Right: inspector (section props).
 *
 * Publishing goes through `publishPageLayout` → pages.set_layout (tool + audit).
 * Until publish the draft lives only in the client + preview — the storefront is untouched.
 */

type BuilderNode = {
  id: string;
  key: SectionKey;
  enabled: boolean;
  props: Record<string, unknown>;
  /** Optional PART 4 motion effect — round-trips load → publish unchanged. */
  effect?: SectionEffectValue;
  /** True while the Magic stream still owes this node its real props. */
  pending?: boolean;
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

/** Info about an instant preset hit — drives the "re-tone with AI" follow-up. */
type MagicPresetInfo = {
  name: string;
  lookName: string | null;
  designSlug: string | null;
};

/** One SSE event from /api/admin/magic/stream. */
type MagicStreamEvent =
  | {
      type: "preset";
      layout: PageLayout;
      vertical: { slug: string; name: string; suggestedDesignSlug: string | null };
      look: { slug: string; name: string; designSlug: string } | null;
    }
  | { type: "plan"; sections: { key: string; source: MagicSource; effect?: SectionEffectValue }[] }
  | { type: "section"; index: number; key: string; section: GeneratedSection }
  | { type: "skipped"; index: number; key: string; reason: string }
  | { type: "done"; planned: number; generated: number; ms: number }
  | { type: "error"; error: string };

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

  // ─── Magic Builder: prompt → SSE stream (preset | plan → parallel sections) ──
  const [magicIntent, setMagicIntent] = useState("");
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicStatuses, setMagicStatuses] = useState<MagicNodeStatus[]>([]);
  const [magicPreset, setMagicPreset] = useState<MagicPresetInfo | null>(null);
  // Node-ids added by the LAST magic run — the "re-tone with AI" pass replaces
  // them instead of appending a second copy of the page.
  const lastMagicIdsRef = useRef<string[]>([]);

  // Load existing layout when the selected page changes. All state mutation happens
  // inside the async function (not synchronously in the effect body), so we do not
  // trigger cascading renders (react-hooks/set-state-in-effect).
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
        setStatus(`Could not load layout: ${res.error}`);
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
        // Round-trip the PART 4 motion effect so load → publish never erases it.
        ...(s.effect ? { effect: s.effect } : {}),
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
        ...(n.effect && n.effect !== "none" ? { effect: n.effect } : {}),
      })),
    };
    const res = await publishPageLayout(slug, layout);
    setStatus(res.ok ? "Published ✓" : `Error: ${res.error}`);
  }, [slug, nodes]);

  // Magic (Mixer 2.0 Phase 3): ONE streaming request. The server first tries
  // the instant preset path (no LLM, ~ms); otherwise it streams the plan
  // (skeleton sections appear immediately with default props) and then every
  // section CONCURRENTLY — each one replaces its skeleton the moment it
  // resolves, so the page visibly builds itself. Fail-soft: a skipped node is
  // reported (never silent) and its skeleton is removed.
  const runMagic = useCallback(
    async (opts?: { skipPreset?: boolean }) => {
      if (magicBusy) return;
      const intent = magicIntent.trim();
      if (intent.length < 8) {
        setStatus("Describe the page in a bit more detail (min. 8 characters).");
        return;
      }
      setMagicBusy(true);
      setMagicStatuses([]);
      setMagicPreset(null);
      setStatus("Planning the page …");

      // The re-tone pass replaces what the previous magic run added.
      if (opts?.skipPreset && lastMagicIdsRef.current.length > 0) {
        const stale = new Set(lastMagicIdsRef.current);
        setNodes((prev) => prev.filter((n) => !stale.has(n.id)));
      }

      const started = performance.now();
      const addedIds: string[] = [];
      const idByIndex: string[] = [];

      const handleEvent = (evt: MagicStreamEvent) => {
        if (evt.type === "preset") {
          const built: BuilderNode[] = evt.layout.sections.map((s) => ({
            id: newId(),
            key: s.key as SectionKey,
            enabled: true,
            props:
              (s.props as Record<string, unknown> | undefined) ??
              structuredClone(SECTION_REGISTRY[s.key as SectionKey].defaultProps),
            ...(s.effect ? { effect: s.effect } : {}),
          }));
          addedIds.push(...built.map((n) => n.id));
          setNodes((prev) => [...prev, ...built]);
          setMagicStatuses(
            evt.layout.sections.map((s) => ({
              key: s.key,
              source: "catalog" as const,
              state: "done" as const,
            })),
          );
          setMagicPreset({
            name: evt.vertical.name,
            lookName: evt.look?.name ?? null,
            designSlug: evt.look?.designSlug ?? evt.vertical.suggestedDesignSlug,
          });
          return;
        }
        if (evt.type === "plan") {
          // Skeletons: the whole page structure appears instantly with each
          // section's default props (pending), then real content streams in.
          const placeholders: BuilderNode[] = evt.sections.map((n) => ({
            id: newId(),
            key: n.key as SectionKey,
            enabled: true,
            props: structuredClone(SECTION_REGISTRY[n.key as SectionKey].defaultProps),
            ...(n.effect && n.effect !== "none" ? { effect: n.effect } : {}),
            pending: true,
          }));
          placeholders.forEach((n) => idByIndex.push(n.id));
          addedIds.push(...placeholders.map((n) => n.id));
          setNodes((prev) => [...prev, ...placeholders]);
          setMagicStatuses(
            evt.sections.map((n) => ({ key: n.key, source: n.source, state: "pending" as const })),
          );
          setStatus(`Generating ${evt.sections.length} sections in parallel …`);
          return;
        }
        if (evt.type === "section") {
          const id = idByIndex[evt.index];
          if (id) {
            setNodes((prev) =>
              prev.map((n) =>
                n.id === id
                  ? {
                      ...n,
                      props: evt.section.props,
                      ...(evt.section.effect ? { effect: evt.section.effect } : {}),
                      pending: false,
                    }
                  : n,
              ),
            );
          }
          setMagicStatuses((prev) =>
            prev.map((s, k) => (k === evt.index ? { ...s, state: "done" as const } : s)),
          );
          return;
        }
        if (evt.type === "skipped") {
          const id = idByIndex[evt.index];
          if (id) setNodes((prev) => prev.filter((n) => n.id !== id));
          setMagicStatuses((prev) =>
            prev.map((s, k) =>
              k === evt.index ? { ...s, state: "skipped" as const, reason: evt.reason } : s,
            ),
          );
          return;
        }
        if (evt.type === "done") {
          const secs = ((performance.now() - started) / 1000).toFixed(1);
          setStatus(`Magic page generated ✓ in ${secs}s — review in preview and publish.`);
          return;
        }
        setStatus(`Error: ${evt.error}`);
      };

      try {
        const res = await fetch("/api/admin/magic/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent, skipPreset: opts?.skipPreset === true }),
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          setStatus(`Error: ${err?.error ?? `request failed (${res.status})`}`);
          setMagicBusy(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const data = frame
              .split("\n")
              .find((l) => l.startsWith("data: "))
              ?.slice(6);
            if (!data) continue;
            try {
              handleEvent(JSON.parse(data) as MagicStreamEvent);
            } catch {
              /* malformed frame — skip */
            }
          }
        }
        lastMagicIdsRef.current = addedIds;
      } catch (err) {
        setStatus(
          `Error: ${err instanceof Error ? err.message : "Generation failed"}`,
        );
      }
      setMagicBusy(false);
    },
    [magicBusy, magicIntent],
  );

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
              onClick={() => void runMagic()}
              disabled={magicBusy || magicIntent.trim().length < 8}
              className="h-10 shrink-0 self-start rounded bg-cw-terracotta px-4 py-1.5 text-sm font-semibold text-white hover:bg-cw-terracotta-strong disabled:opacity-50"
            >
              {magicBusy ? "Generating …" : "Generate page"}
            </button>
          </div>
          {magicPreset ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-green-200 bg-green-50 px-2 py-1.5 text-xs text-green-900">
              <span>
                ⚡ Instant match: <strong>{magicPreset.name}</strong>
                {magicPreset.lookName ? ` (the "${magicPreset.lookName}" Look)` : ""} — applied
                from the preset library, no AI call.
                {magicPreset.designSlug
                  ? ` Pairs with the "${magicPreset.designSlug}" design.`
                  : ""}
              </span>
              <button
                onClick={() => void runMagic({ skipPreset: true })}
                disabled={magicBusy}
                className="rounded border border-green-300 bg-white px-2 py-0.5 font-semibold hover:bg-green-100 disabled:opacity-50"
              >
                ✨ Re-tone with AI instead
              </button>
            </div>
          ) : null}
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
                  }${n.pending ? " animate-pulse text-stone-400" : ""}`}
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

        {/* Right: inspector */}
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
 * List field (string[]) — one value per line. Local text state so empty
 * intermediate lines can be typed while the saved prop stays clean (trimmed, no
 * empties). Keyed by node:field at the call site → resyncs when the section changes.
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
 * JSON field for complex array/object props (typically AI-filled). Local text
 * state so an invalid intermediate state can be typed; valid JSON propagates at once.
 * Keyed by node:field at the call site → resyncs when the section changes.
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
            setErr("Invalid JSON");
          }
        }}
      />
      {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
      <p className="mt-1 text-xs text-stone-400">Edit as JSON. Usually filled in by AI.</p>
    </div>
  );
}
