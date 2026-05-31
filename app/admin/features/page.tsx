import { getFeatureView, groupByCategory } from "@/lib/feature-flags/status";
import { FeatureToggle } from "./FeatureToggle";

export const dynamic = "force-dynamic";

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        on ? "bg-emerald-100 text-emerald-900" : "bg-sol-ink/10 text-sol-muted"
      }`}
    >
      {on ? "Til" : "Fra"}
    </span>
  );
}

export default async function AdminFeaturesPage() {
  const { features, identity } = await getFeatureView();
  const groups = groupByCategory(features);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Funktioner</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Tænd og sluk shoppens funktioner. Runtime-funktioner kan ændres live —
          ændringer slår igennem på storefront inden for 30 sekunder. Build-tid-
          funktioner og identitet vises som status og ændres i{" "}
          <code className="rounded bg-sol-ink/5 px-1">brand.config.ts</code>.
        </p>
      </header>

      {groups.map((g) => (
        <section
          key={g.group}
          className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-black text-sol-ink">{g.group}</h2>
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
                      <span className="rounded-full bg-sol-ink/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-sol-muted">
                        Ikke implementeret
                      </span>
                    )}
                    {f.implemented && f.overridden && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900">
                        Tilsidesat
                      </span>
                    )}
                    {f.tier === "compile-time" && (
                      <span className="rounded-full bg-sol-ink/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sol-muted">
                        Build-tid
                      </span>
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
        </section>
      ))}

      <section className="rounded-2xl border border-sol-ink/10 bg-sol-cream/50 p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-black text-sol-ink">Identitet</h2>
        <p className="mb-4 text-xs text-sol-muted">
          Definerer hvad sitet ER. Låst — kan aldrig ændres via denne side
          (brand.config.ts er eneste kilde).
        </p>
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
      </section>
    </div>
  );
}
