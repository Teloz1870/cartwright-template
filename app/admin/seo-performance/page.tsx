import { getSeoOverview } from "./actions";
import { RunGeoButton } from "./RunGeoButton";
import { notFound } from "next/navigation";
import { getFeatures } from "@/lib/brand";
import {
  AdminPageHeader,
  AdminCard,
  AdminBadge,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function SeoPerformancePage() {
  // Gate mirrors the nav entry's flag exactly (registry-stats precedent).
  // BOTH flags: the manifest declares seoAutopilot dependsOn cartwrightPlus,
  // disabling a dependency never cascades to dependents, and the seo-snapshot
  // cron already requires both (codex review fold-in).
  const features = await getFeatures();
  if (!features.seoAutopilot || !features.cartwrightPlus) notFound();

  const { geo, experiments, shareOfVoice } = await getSeoOverview();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="SEO/GEO Autopilot"
        subtitle="Measures AI visibility (GEO) + search performance (GSC — requires OAuth), and runs self-improving genome experiments (apply → measure → keep/revert). Pro feature."
      />

      <AdminCard
        title={
          <>
            AI share-of-voice {shareOfVoice != null && <span className="text-sol-accent">{shareOfVoice}%</span>}
          </>
        }
        actions={<RunGeoButton />}
      >
        {geo.length === 0 ? (
          <EmptyState title="No GEO measurements yet. Click &quot;Measure GEO now&quot;." />
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {geo.slice(0, 10).map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-lg border-2 border-sol-ink/10 px-3 py-2">
                <span className="truncate text-sol-ink">{g.prompt}</span>
                <AdminBadge tone={g.cited ? "success" : "neutral"}>
                  {g.cited ? "cited" : "not cited"}
                </AdminBadge>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard title="Experiments" padding="none">
        {experiments.length === 0 ? (
          <EmptyState title="No experiments yet." />
        ) : (
          <AdminTable>
            <AdminThead>
              <AdminTr>
                <AdminTh>Field</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Result</AdminTh>
              </AdminTr>
            </AdminThead>
            <AdminTbody>
              {experiments.map((e) => (
                <AdminTr key={e.id}>
                  <AdminTd className="font-mono text-xs">{e.fieldKey}</AdminTd>
                  <AdminTd>
                    <AdminBadge
                      tone={
                        e.status === "kept"
                          ? "success"
                          : e.status === "reverted"
                            ? "attention"
                            : "neutral"
                      }
                    >
                      {e.status}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd className="text-sol-muted">{e.resultNote ?? "—"}</AdminTd>
                </AdminTr>
              ))}
            </AdminTbody>
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
}
