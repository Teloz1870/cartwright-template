import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { listRegistryHits } from "@/lib/registry-stats";
import { SVG_REGISTRY_PREFIX } from "@/lib/magic/registry-export";
import {
  AdminBadge,
  AdminCard,
  AdminPageHeader,
  AdminTable,
  AdminTbody,
  AdminTd,
  AdminTh,
  AdminThead,
  AdminTr,
  EmptyState,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * /admin/registry-stats — readout for the anonymous component-registry
 * install counters (brand.features.registryStats).
 *
 * Counting happens fire-and-forget in /api/registry (lib/registry-stats.ts)
 * and stores ONLY the item slug + a count — never IP/UA/visitor data. This
 * page is the curation surface: which sections/svg-items do external agents
 * and IDEs actually pull?
 *
 * Gated behind `registryStats` (default off) — flag-off 404s and the nav
 * entry (lib/admin/nav.ts) carries the same flag, so flag-off = byte-identical
 * admin (mixer-studio precedent).
 */
export default async function AdminRegistryStatsPage() {
  await requireAdmin();
  const features = await getFeatures();
  if (!features.registryStats) notFound();

  const hits = await listRegistryHits();
  const total = hits.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Registry stats"
        subtitle="Anonymous install counts from the public component registry (/api/registry). Only the item slug is recorded — never IP, user-agent or visitor data. Use this to make catalog curation data-driven."
      />
      <AdminCard
        title="Served registry items"
        description={
          hits.length > 0
            ? `${total} install${total === 1 ? "" : "s"} across ${hits.length} item${hits.length === 1 ? "" : "s"}, most installed first.`
            : undefined
        }
        padding="none"
      >
        {hits.length === 0 ? (
          <EmptyState
            title="No registry installs recorded yet"
            description="Counters appear here as soon as an external agent or IDE pulls an item from /api/registry/r/<key>.json (requires componentRegistryPublic)."
          />
        ) : (
          <AdminTable minWidth="28rem">
            <AdminThead>
              <AdminTr>
                <AdminTh>Item</AdminTh>
                <AdminTh>Type</AdminTh>
                <AdminTh align="right">Installs</AdminTh>
                <AdminTh align="right">Last installed</AdminTh>
              </AdminTr>
            </AdminThead>
            <AdminTbody>
              {hits.map((row) => (
                <AdminTr key={row.item}>
                  <AdminTd className="font-mono text-xs">{row.item}</AdminTd>
                  <AdminTd>
                    <AdminBadge tone={row.item.startsWith(SVG_REGISTRY_PREFIX) ? "info" : "neutral"}>
                      {row.item.startsWith(SVG_REGISTRY_PREFIX) ? "SVG item" : "Section"}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd align="right" className="tabular-nums">
                    {row.count}
                  </AdminTd>
                  <AdminTd align="right" className="text-sol-muted">
                    {row.updatedAt.toISOString().slice(0, 10)}
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTbody>
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
}
