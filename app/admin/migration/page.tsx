import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getFeatures } from "@/lib/brand";
import { CHECK_CATALOG, CHECK_GROUPS } from "@/lib/migration/catalog";
import { readyForDns } from "@/lib/migration/ready";
import { loadMigrationBoard, type MigrationBoardData } from "@/lib/migration/store";
import { WOO_PLAN_ACTIONS, WOO_PLAN_LIST_CAP, type WooPlanSummary } from "@/lib/migration/woo-plan-summary";
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
const ACTION_TONE: Record<string, BadgeTone> = { conflict: "critical", blocked: "critical", orphan: "warning", skip: "info" };
const when = (d: Date | null) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "—");
const REDIRECTS_NOTE = "redirect.imported, redirect.active and redirect.legacy-shadow also run through the `migration.run_checks` tool. None of them changes a redirect.";

/**
 * /admin/migration — the board of checks a move from WordPress/WooCommerce
 * has to pass before the DNS switch (lib/migration/catalog.ts), with the
 * "Ready for DNS switch: n/m" counter (lib/migration/ready.ts) and the last
 * WooCommerce import plan (migration.woo_plan, a dry run). Behind the
 * default-off RUNTIME flag `migrationDashboard`: off ⇒ 404 before any
 * Migration* read, and the nav entry is gone (registry-stats precedent).
 */
export default async function MigrationPage() {
  await requireAdmin();
  const features = await getFeatures();
  if (!features.migrationDashboard) notFound();

  let board: MigrationBoardData = { project: null, urlCount: 0, latest: new Map(), current: {}, wooPlan: null };
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
          {latest.size === 0 ? <p>No check has run yet. url.parity, url.content, seo.head, seo.product-jsonld, data.counts (on a webshop), dns.web and dns.ttl run through the `migration.run_checks` tool; the other rows read “not run” until later releases add them.</p> : null}
        </div>
      </AdminCard>
      <WooPlanCard plan={board.wooPlan ?? null} />
      {CHECK_GROUPS.map((group) => (
        <AdminCard key={group.id} title={group.label} description={group.id === "redirect" ? REDIRECTS_NOTE : undefined} padding="none">
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

/** The last `migration.woo_plan` dry run: the counts per action, then the first rows that need a look, that are gone from the source, or that the mapping changed. */
function WooPlanCard({ plan }: { plan: WooPlanSummary | null }) {
  const warnings = Object.values(plan?.warnings.byCode ?? {}).reduce((a, b) => a + b, 0);
  const vat = plan?.sourcePricesIncludeVat == null ? "not stated" : plan.sourcePricesIncludeVat ? "include VAT" : "exclude VAT";
  return (
    <AdminCard
      title="WooCommerce import plan (dry run)"
      description="What importing the source shop's categories and products would do here. Planned by the `migration.woo_plan` tool, which writes nothing to the catalogue. Until the importer keeps a baseline (W21-live-2), update stays 0: a row already here from an earlier import is unchanged when it matches the source and a conflict when it differs, since nothing says which side changed. A product that is not simple, or one deleted here, is a skip."
    >
      {!plan ? (
        <p className="text-sm text-sol-muted">No import plan yet. Run the `migration.woo_plan` tool; it reads the source shop and writes nothing to the catalogue.</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm text-sol-muted">
          <p>
            Planned {when(new Date(plan.plannedAt))} from {plan.storeUrl} · mapping v{plan.mappingVersion} · the shop&apos;s prices {vat}
          </p>
          <p>
            {Object.entries(plan.collections)
              .map(([name, c]) => `${name} ${c.fetched}/${c.total ?? "?"}${c.complete ? "" : " (incomplete)"}`)
              .join(" · ")}
          </p>
          <AdminTable>
            <AdminThead>
              <tr>
                <AdminTh>Rows</AdminTh>
                {WOO_PLAN_ACTIONS.map((a) => <AdminTh key={a}>{a}</AdminTh>)}
              </tr>
            </AdminThead>
            <AdminTbody>
              {(["categories", "products"] as const).map((kind) => (
                <AdminTr key={kind}>
                  <AdminTd className="font-medium text-sol-ink">{kind === "categories" ? "Categories" : "Products"}</AdminTd>
                  {WOO_PLAN_ACTIONS.map((a) => <AdminTd key={a}>{plan.counts[kind][a]}</AdminTd>)}
                </AdminTr>
              ))}
            </AdminTbody>
          </AdminTable>
          <p>
            Variations: {plan.variations.attached} attached, {plan.variations.orphans} orphans · {plan.missingInSource.count} rows here are gone from the source
          </p>
          {plan.snapshotWarnings.length > 0 ? <ul className="list-disc pl-5">{plan.snapshotWarnings.map((w, n) => <li key={n}>{w}</li>)}</ul> : null}
          <FirstRows total={plan.issues.count} what="rows that need a look" items={plan.issues.first} row={(i) => (
            <>
              <AdminBadge tone={ACTION_TONE[i.action] ?? "neutral"}>{i.action}</AdminBadge>
              {i.kind} {i.externalId}
              {i.slug ? <code>{i.slug}</code> : null}
              {i.reason ? <span>— {i.reason}</span> : null}
            </>
          )} />
          <FirstRows total={plan.missingInSource.count} what="rows gone from the source" items={plan.missingInSource.first} row={(m) => (
            <>Gone from the source: {m.kind} {m.externalId}, here <code>{m.dbId}</code></>
          )} />
          <FirstRows total={warnings} what="mapping warnings" items={plan.warnings.first} row={(w) => (
            <><AdminBadge tone="info">{w.code}</AdminBadge> Woo {w.externalId}: {w.detail}</>
          )} />
        </div>
      )}
    </AdminCard>
  );
}

/** The first rows the summary keeps, at most WOO_PLAN_LIST_CAP, and how many there are in all. */
function FirstRows<T>({ total, what, items, row }: { total: number; what: string; items: T[]; row: (item: T) => ReactNode }) {
  const shown = items.slice(0, WOO_PLAN_LIST_CAP);
  if (total === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((item, n) => <li key={n} className="flex flex-wrap items-center gap-1">{row(item)}</li>)}
      {total > shown.length ? <li>… the first {shown.length} of {total} {what}.</li> : null}
    </ul>
  );
}
