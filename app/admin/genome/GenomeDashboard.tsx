"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setGenomeOverride,
  triggerGenomeResolve,
  setIdentityAnchor,
  reharmonizeGenome,
  describeBusinessAction,
} from "./actions";
import type { GenomeSnapshot, GenomeFieldSnapshot } from "@/lib/genome/inspect";
import type { GenomeFieldKey } from "@/lib/genome/fields";
import type { GenomeAnchorKey } from "@/lib/genome/types";

type IdentityOptions = {
  tone: readonly string[];
  audience: readonly string[];
  formality: readonly string[];
};

const STATUS_STYLE: Record<GenomeFieldSnapshot["status"], string> = {
  anchor: "bg-sol-ink/10 text-sol-ink",
  override: "bg-indigo-100 text-indigo-700",
  resolved: "bg-emerald-100 text-emerald-700",
  stale: "bg-amber-100 text-amber-700",
};

const STATUS_LABEL: Record<GenomeFieldSnapshot["status"], string> = {
  anchor: "anchor",
  override: "override",
  resolved: "resolved",
  stale: "stale",
};

/** Group fields into readable sections by key prefix, in a stable order. */
const SECTION_ORDER = [
  "Homepage (website)",
  "Homepage (webshop)",
  "Footer",
  "Newsletter",
  "Products",
  "Categories",
  "Other",
] as const;

function sectionFor(key: string): (typeof SECTION_ORDER)[number] {
  if (key.startsWith("home.")) return "Homepage (website)";
  if (key.startsWith("shop.")) return "Homepage (webshop)";
  if (key.startsWith("footer.")) return "Footer";
  if (key.startsWith("uiLabels.")) return "Newsletter";
  if (key.startsWith("product.")) return "Products";
  if (key.startsWith("category.")) return "Categories";
  return "Other";
}

/**
 * /admin/genome dashboard. Identity-ankre + re-harmonisér + pr.-felt override/
 * resolve. Deler apply/resolve-core med AI-tool'et via server-actions. Efter
 * hver handling refreshes serveren så snapshot'et reflekterer den nye tilstand.
 */
export function GenomeDashboard({
  snapshot,
  identityOptions,
}: {
  snapshot: GenomeSnapshot;
  identityOptions: IdentityOptions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sentence, setSentence] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ ok: true, text: okText });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error ?? "Something went wrong." });
      }
    });
  }

  return (
    <div className="flex flex-col gap-10">
      {/* ── Spawn from a sentence ────────────────────────────────────────── */}
      <section className="rounded-xl border-2 border-dashed border-sol-accent/40 bg-sol-accent/5 p-4">
        <h2 className="text-lg font-black text-sol-ink">Spawn from one sentence</h2>
        <p className="mb-3 text-xs text-sol-muted">
          Describe the business in one sentence → AI infers the identity anchors
          and rewrites every resolvable field. The self-building demo.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={sentence}
            placeholder="e.g. We roast small-batch coffee for slow mornings."
            disabled={pending}
            onChange={(e) => setSentence(e.target.value)}
            className="flex-1 rounded-lg border-2 border-sol-ink/10 bg-sol-cream px-3 py-2 text-sm text-sol-ink"
          />
          <button
            type="button"
            disabled={pending || sentence.trim().length < 8}
            onClick={() =>
              run(
                () => describeBusinessAction(sentence.trim()),
                "Spawned — anchors inferred and fields re-resolved.",
              )
            }
            className="shrink-0 rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep disabled:opacity-60"
          >
            {pending ? "Working…" : "Spawn"}
          </button>
        </div>
      </section>

      {/* ── Identity anchors ─────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-sol-ink">Identity anchors</h2>
            <p className="text-xs text-sol-muted">
              The voice every resolvable field harmonizes toward.
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                async () => {
                  await reharmonizeGenome();
                  return { ok: true };
                },
                "Re-harmonized — every resolvable field rewritten in the new voice.",
              )
            }
            className="shrink-0 rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep disabled:opacity-60"
          >
            {pending ? "Working…" : "Re-harmonize all"}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(["tone", "audience", "formality"] as const).map((key) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-sol-muted">
                {key}
              </span>
              <select
                disabled={pending}
                value={snapshot.deps[key]}
                onChange={(e) =>
                  run(
                    () => setIdentityAnchor(key as GenomeAnchorKey, e.target.value),
                    `${key} set to "${e.target.value}". Click Re-harmonize to apply it.`,
                  )
                }
                className="rounded-lg border-2 border-sol-ink/10 bg-sol-sand px-3 py-2 text-sm text-sol-ink"
              >
                {identityOptions[key].map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-sol-muted">
              vibe
            </span>
            <input
              type="text"
              disabled={pending}
              defaultValue={snapshot.deps.vibe}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value.trim() !== snapshot.deps.vibe) {
                  run(
                    () => setIdentityAnchor("vibe", e.target.value.trim()),
                    `vibe set to "${e.target.value.trim()}". Click Re-harmonize.`,
                  );
                }
              }}
              className="rounded-lg border-2 border-sol-ink/10 bg-sol-sand px-3 py-2 text-sm text-sol-ink"
            />
          </label>
        </div>
      </section>

      {/* ── Fields (grouped by section) ──────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-lg font-black text-sol-ink">Fields</h2>
        <div className="flex flex-col gap-8">
          {SECTION_ORDER.map((section) => {
            const fields = snapshot.fields.filter((f) => sectionFor(f.key) === section);
            if (fields.length === 0) return null;
            return (
              <div key={section} className="flex flex-col gap-4">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-sol-muted">
                    {section}
                  </h3>
                  <span className="text-[10px] text-sol-muted/70">
                    {fields.length} {fields.length === 1 ? "field" : "fields"}
                  </span>
                </div>
                {fields.map((field) => (
                  <FieldRow key={field.key} field={field} pending={pending} run={run} />
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function FieldRow({
  field,
  pending,
  run,
}: {
  field: GenomeFieldSnapshot;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
}) {
  const [override, setOverride] = useState(field.override ?? "");
  const isAnchored = field.lock === "anchored";

  return (
    <div className="rounded-xl border-2 border-sol-ink/10 bg-sol-sand p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-sol-ink">{field.label}</span>
        <code className="rounded bg-sol-ink/5 px-1 text-[11px] text-sol-muted">
          {field.key}
        </code>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLE[field.status]}`}
        >
          {STATUS_LABEL[field.status]}
        </span>
        {isAnchored && (
          <span className="rounded-full bg-sol-ink/10 px-2 py-0.5 text-[10px] font-bold text-sol-muted">
            anchored · never resolves
          </span>
        )}
      </div>

      <p className="mb-3 text-sm text-sol-ink">
        <span className="text-xs text-sol-muted">renders now: </span>
        {field.current}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={override}
          placeholder="override (empty = none)…"
          disabled={pending}
          onChange={(e) => setOverride(e.target.value)}
          className="flex-1 rounded-lg border-2 border-sol-ink/10 bg-sol-cream px-3 py-2 text-sm text-sol-ink"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || override.trim() === (field.override ?? "")}
            onClick={() =>
              run(
                () =>
                  setGenomeOverride(
                    field.key as GenomeFieldKey,
                    override.trim() ? override.trim() : null,
                  ),
                override.trim() ? "Override saved." : "Override cleared.",
              )
            }
            className="rounded-lg bg-sol-ink px-3 py-2 text-sm font-bold text-white transition hover:bg-sol-ink/85 disabled:opacity-40"
          >
            Save
          </button>
          {!isAnchored && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  async () => {
                    const r = await triggerGenomeResolve(field.key as GenomeFieldKey);
                    return r.ok ? { ok: true } : { ok: false, error: r.error };
                  },
                  "Resolved in the current voice.",
                )
              }
              className="rounded-lg border-2 border-sol-accent px-3 py-2 text-sm font-bold text-sol-accent transition hover:bg-sol-accent/5 disabled:opacity-40"
            >
              Resolve
            </button>
          )}
        </div>
      </div>

      {field.override === null && field.resolved && (
        <p className="mt-2 text-xs text-sol-muted">
          last resolved: <span className="italic">{field.resolved}</span>
        </p>
      )}
    </div>
  );
}
