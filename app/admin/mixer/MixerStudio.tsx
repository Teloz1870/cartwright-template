"use client";

import { useState } from "react";
import Link from "next/link";
import type { DesignOption } from "@/designs/options";
import type { VerticalOption } from "@/verticals/types";
import { AdminCard } from "@/components/admin/ui";

/**
 * Read-only Skin × Voice studio. Two native <select>s drive the `src` of the
 * gated mixer-preview iframe — no DB write, no server action. "No Voice" leaves
 * the design's own copy/palette; picking a Voice re-tones + recolours the
 * preview exactly as applying it would (but ephemerally, in-memory).
 */
export function MixerStudio({
  designs,
  verticals,
  locale,
}: {
  designs: DesignOption[];
  verticals: VerticalOption[];
  locale: string;
}) {
  const [design, setDesign] = useState(designs[0]?.slug ?? "aurora-site");
  const [vertical, setVertical] = useState("");

  const params = new URLSearchParams({ design });
  if (vertical) params.set("vertical", vertical);
  const src = `/${locale}/mixer-preview?${params.toString()}`;

  const selectCls =
    "w-full rounded-lg border border-sol-ink/15 bg-sol-sand px-3 py-2 text-sm font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25 dark:border-white/15 dark:text-white";

  return (
    <div className="flex flex-col gap-4">
      <AdminCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-widest text-sol-muted">
            Skin (design)
            <select
              className={selectCls}
              value={design}
              onChange={(e) => setDesign(e.target.value)}
            >
              {designs.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                  {d.premium ? " — Premium" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-black uppercase tracking-widest text-sol-muted">
            Voice (vertical)
            <select
              className={selectCls}
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
            >
              <option value="">No Voice — design&rsquo;s own copy</option>
              {verticals.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm text-sol-muted">
          Read-only preview. To apply a look for real, use{" "}
          <Link className="underline" href="/admin/designs">
            Designs
          </Link>{" "}
          or{" "}
          <Link className="underline" href="/admin/verticals">
            Verticals (Voice)
          </Link>
          .
        </p>
      </AdminCard>

      <AdminCard padding="none" className="overflow-hidden">
        <iframe
          key={src}
          src={src}
          title="Mixer preview"
          className="h-[70vh] w-full border-0 bg-white"
        />
      </AdminCard>
    </div>
  );
}
