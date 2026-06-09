import { getFeatureView, groupByCategory } from "@/lib/feature-flags/status";
import { FeatureToggle } from "./FeatureToggle";
import { AdminPageHeader, AdminCard, AdminBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

function StatusPill({ on }: { on: boolean }) {
  return (
    <AdminBadge tone={on ? "success" : "neutral"}>{on ? "Til" : "Fra"}</AdminBadge>
  );
}

export default async function AdminFeaturesPage() {
  const { features, identity } = await getFeatureView();
  const groups = groupByCategory(features);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Funktioner"
        subtitle="Tænd og sluk shoppens funktioner. Runtime-funktioner kan ændres live — ændringer slår igennem på storefront inden for 30 sekunder. Build-tid-funktioner og identitet vises som status og ændres i brand.config.ts."
      />

      {groups.map((g) => (
        <AdminCard key={g.group} title={g.group}>
          <ul className="flex flex-col divide-y divide-sol-ink/5">
            {g.items.map((f) => (
              <li
                key={f.key}
                className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-sol-ink">{f.label}</span>
                    {!f.implemented && (
                      <AdminBadge tone="neutral">Ikke implementeret</AdminBadge>
                    )}
                    {f.implemented && f.overridden && (
                      <AdminBadge tone="attention">Tilsidesat</AdminBadge>
                    )}
                    {f.tier === "compile-time" && (
                      <AdminBadge tone="neutral">Build-tid</AdminBadge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-sol-muted">{f.description}</p>
                  {f.tier === "compile-time" && f.requiresRedeployNote && (
                    <p className="mt-1 text-[11px] italic text-sol-muted/80">
                      {f.requiresRedeployNote}
                    </p>
                  )}
                </div>

                <div className="shrink-0 pt-0.5">
                  {f.tier === "runtime" && f.implemented ? (
                    <FeatureToggle
                      featureKey={f.key}
                      label={f.label}
                      initialEnabled={f.enabled}
                      blockedReason={f.blockedReason}
                    />
                  ) : (
                    <StatusPill on={f.enabled} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </AdminCard>
      ))}

      <AdminCard
        title="Identitet"
        description="Definerer hvad sitet ER. Låst — kan aldrig ændres via denne side (brand.config.ts er eneste kilde)."
      >
        <ul className="flex flex-col divide-y divide-sol-ink/5">
          {identity.map((i) => (
            <li
              key={i.key}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <span className="text-sm font-bold text-sol-ink">{i.label}</span>
                <p className="mt-0.5 text-xs text-sol-muted">{i.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-sol-ink/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-sol-ink">
                {String(i.value)}
              </span>
            </li>
          ))}
        </ul>
      </AdminCard>
    </div>
  );
}
