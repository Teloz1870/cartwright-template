import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { CHECK_CATALOG, CHECK_GROUPS } from "@/lib/migration/catalog";
import { readyForDns } from "@/lib/migration/ready";
import { loadMigrationBoard, type MigrationBoardData } from "@/lib/migration/store";
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
  type BadgeTone,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const TONE: Record<string, BadgeTone> = { pass: "success", warn: "attention", fail: "critical", inconclusive: "warning" };
const when = (d: Date | null) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "—");

/**
 * /admin/migration — the board of checks a move from WordPress/WooCommerce
 * has to pass before the DNS switch (lib/migration/catalog.ts), with the
 * "Ready for DNS switch: n/m" counter (lib/migration/ready.ts). Behind the
 * default-off RUNTIME flag `migrationDashboard`: off ⇒ 404 before any
 * Migration* read, and the nav entry is gone (registry-stats precedent).
 */
export default async function MigrationPage() {
  await requireAdmin();
  const features = await getFeatures();
  if (!features.migrationDashboard) notFound();

  let board: MigrationBoardData = { project: null, urlCount: 0, latest: new Map(), current: {} };
  let readError: string | null = null;
  try {
    board = await loadMigrationBoard();
  } catch (err) {
    // Tables not pushed yet, or the DB is down: the counter then reads 0/m — it never over-claims.
    readError = err instanceof Error ? err.message : String(err);
  }
  const { project, latest } = board;
  // Bound to the snapshot AND the new site: a pass measured on another target never counts here.
  const counter = readyForDns(latest, { now: new Date(), current: board.current });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Migration"
        subtitle="Every check a move from WordPress/WooCommerce has to pass before the DNS switch. Required checks count toward the switch."
      />
      <AdminCard
        title={`Ready for DNS switch: ${counter.ready}/${counter.required}`}
        description="Required checks whose latest run passed within the last 24 hours, on the current snapshot and new site. Skipped, inconclusive and never-run checks count against it."
      >
        <div className="flex flex-col gap-1 text-sm text-sol-muted">
          {readError ? (
            <p>Could not read the migration tables ({readError}). Run `pnpm db:push` if they do not exist yet.</p>
          ) : project ? (
            <p>
              Source {project.sourceUrl} · frozen {when(project.frozenAt)} · {board.urlCount} URLs
            </p>
          ) : (
            <p>No migration project is set up on this site yet.</p>
          )}
          {latest.size === 0 ? <p>No check has run yet. url.parity runs through the `migration.run_checks` tool; the other rows read “not run” until later releases add them.</p> : null}
        </div>
      </AdminCard>
      {CHECK_GROUPS.map((group) => (
        <AdminCard key={group.id} title={group.label} padding="none">
          <AdminTable>
            <AdminThead>
              <tr>
                <AdminTh>Status</AdminTh>
                <AdminTh>Check</AdminTh>
                <AdminTh>Compares</AdminTh>
                <AdminTh>Phase</AdminTh>
                <AdminTh>Last run</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {CHECK_CATALOG.filter((row) => row.group === group.id).map((row) => {
                const run = latest.get(row.id);
                return (
                  <AdminTr key={row.id}>
                    <AdminTd>
                      <AdminBadge tone={run ? (TONE[run.status] ?? "neutral") : "neutral"}>{run?.status ?? "not run"}</AdminBadge>
                    </AdminTd>
                    <AdminTd>
                      <div className="font-medium text-sol-ink">{row.label}</div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-sol-muted">
                        <code>{row.id}</code>
                        {row.required ? <AdminBadge tone="info">Required</AdminBadge> : null}
                        {row.oftenForgotten ? <AdminBadge tone="attention">Often forgotten</AdminBadge> : null}
                      </div>
                    </AdminTd>
                    <AdminTd className="text-sol-muted">
                      {row.compares.a} ↔ {row.compares.b}
                    </AdminTd>
                    <AdminTd>
                      {row.phase}
                      {row.verify === "machine" ? "" : ` · ${row.verify === "attest" ? "sign-off" : "check + sign-off"}`}
                    </AdminTd>
                    <AdminTd>{when(run?.finishedAt ?? null)}</AdminTd>
                  </AdminTr>
                );
              })}
            </AdminTbody>
          </AdminTable>
        </AdminCard>
      ))}
    </div>
  );
}
