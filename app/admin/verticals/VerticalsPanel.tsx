"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { VerticalOption } from "@/verticals/types";
import { AdminCard, AdminButton, AdminBadge } from "@/components/admin/ui";
import { applyVerticalAction } from "./actions";

/**
 * Vertical / Voice preset picker. Each card applies a packaged brand voice
 * (identity + pre-written genome copy) — optionally with its suggested Skin —
 * via the governed applyVertical server action.
 */
export function VerticalsPanel({
  verticals,
  genomeResolveOn,
}: {
  verticals: VerticalOption[];
  genomeResolveOn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ slug: string; text: string; ok: boolean } | null>(null);

  function apply(slug: string, applySkin: boolean) {
    setMsg(null);
    startTransition(async () => {
      const r = await applyVerticalAction(slug, applySkin);
      if (r.ok) {
        const extras: string[] = [];
        if (r.appliedSkin) extras.push(`skin “${r.appliedSkin}”`);
        else if (r.skinSkipped) extras.push(`skin “${r.skinSkipped}” ikke installeret`);
        if (r.appliedPalette) extras.push("palette");
        if (r.appliedScene) extras.push(`3D “${r.appliedScene}”`);
        const tail = extras.length ? ` + ${extras.join(" + ")}` : "";
        setMsg({
          slug,
          ok: true,
          text: `Anvendt: ${r.fields} copy-felter + ${r.identityKeys.length} identitets-ankre${tail}.`,
        });
      } else {
        setMsg({ slug, ok: false, text: r.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {!genomeResolveOn ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Bemærk:</strong> “Resolvable Genome” er slukket, så forsiden viser stadig de
          oprindelige ankre. Tænd den under{" "}
          <Link className="underline" href="/admin/features">
            Funktioner
          </Link>{" "}
          for at se en anvendt Voice live på forsiden (kræver et website-mode design som Aurora
          eller Studio).
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {verticals.map((v) => (
          <AdminCard
            key={v.slug}
            title={v.name}
            description={v.description}
            actions={v.suggestedDesignSlug ? <AdminBadge>{v.suggestedDesignSlug}</AdminBadge> : undefined}
          >
            <div className="flex flex-wrap gap-1.5">
              {v.keywords.slice(0, 5).map((k) => (
                <AdminBadge key={k}>{k}</AdminBadge>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <AdminButton variant="primary" disabled={pending} onClick={() => apply(v.slug, false)}>
                Anvend Voice
              </AdminButton>
              {v.suggestedDesignSlug ? (
                <AdminButton variant="secondary" disabled={pending} onClick={() => apply(v.slug, true)}>
                  Voice + Skin
                </AdminButton>
              ) : null}
            </div>
            {msg && msg.slug === v.slug ? (
              <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
                {msg.text}
              </p>
            ) : null}
          </AdminCard>
        ))}
      </div>
    </div>
  );
}
