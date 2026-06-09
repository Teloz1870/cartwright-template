import { getSeoOverview } from "./actions";
import { RunGeoButton } from "./RunGeoButton";
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
  const { geo, experiments, shareOfVoice } = await getSeoOverview();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="SEO/GEO Autopilot"
        subtitle="Måler AI-synlighed (GEO) + søge-performance (GSC — kræver OAuth), og kører selvforbedrende genome-eksperimenter (apply → mål → behold/revert). Pro-feature."
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
          <EmptyState title="Ingen GEO-målinger endnu. Klik &quot;Mål GEO nu&quot;." />
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {geo.slice(0, 10).map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-lg border-2 border-sol-ink/10 px-3 py-2">
                <span className="truncate text-sol-ink">{g.prompt}</span>
                <AdminBadge tone={g.cited ? "success" : "neutral"}>
                  {g.cited ? "citeret" : "ikke citeret"}
                </AdminBadge>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard title="Eksperimenter" padding="none">
        {experiments.length === 0 ? (
          <EmptyState title="Ingen eksperimenter endnu." />
        ) : (
          <AdminTable>
            <AdminThead>
              <AdminTr>
                <AdminTh>Felt</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Resultat</AdminTh>
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
