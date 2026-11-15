import type { WooKind } from "@/lib/woo/groups";
import { ACTIONS, type WooAction, type WooPlanItem } from "@/lib/woo/plan";
import type { WooImportReport } from "@/lib/woo/run-import";

/**
 * W21-live-2 — a run's report as text (spec 2026-10-25, §3F): the counts per
 * verdict, then the first rows, those to act on first. Pure; `--json` prints
 * the report itself, with every row.
 */

export const REPORT_ROW_CAP = 50;
/** A skip after an update: every variable product is one until schema batch B, and a row to act on must not fall past the cap behind them. */
const ROW_ORDER: readonly WooAction[] = ["conflict", "orphan", "blocked", "update", "skip", "create", "unchanged"];

/** One line per row: a shop's sku or permalink can hold a line break or a terminal escape. */
const oneLine = (text: string) => text.replace(/\p{Cc}+/gu, " ");
const rowsOf = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

function rowLine(kind: WooKind, { action, externalId, slug, reason, groups }: WooPlanItem): string {
  const detail = reason ?? groups?.join(", ");
  return `  ${oneLine(`${action.padEnd(9)} ${kind} ${externalId}${slug ? ` ${slug}` : ""}${detail ? `: ${detail}` : ""}`)}`;
}

export function formatReport({ store, scope, only, read, stock, plan }: WooImportReport): string {
  const tally = (counts: Record<WooAction, number>) => ACTIONS.map((action) => `${action} ${counts[action]}`).join(", ");
  const list = (name: "categories" | "products" | "variations") => `${read[name].fetched} of ${read[name].total ?? "?"} ${name}${read[name].complete ? "" : " (incomplete, so nothing of them is called gone)"}`;
  const rows = [...plan.categories.map((item) => ({ kind: "category" as const, item })), ...plan.products.map((item) => ({ kind: "product" as const, item }))];
  const shown = [...rows].sort((a, b) => ROW_ORDER.indexOf(a.item.action) - ROW_ORDER.indexOf(b.item.action)).slice(0, REPORT_ROW_CAP);
  const refreshed = rows.filter(({ item }) => item.refresh).length;
  const codes = [...new Set(plan.warnings.map((w) => w.code))].map((code) => `${plan.warnings.filter((w) => w.code === code).length} ${code}`);
  return [
    `DRY RUN, nothing written · ${store} · scope ${scope}${only ? ` · only ${only.join(",")}` : ""}`,
    `read: ${list("categories")}, ${list("products")}, ${list("variations")}`,
    `categories: ${tally(plan.counts.categories)}`,
    `products: ${tally(plan.counts.products)}`,
    `variations: ${plan.variations.attached} attached (not imported until schema batch B), ${plan.variations.orphans.length} orphaned`,
    stock.read
      ? `stock: read for new products, ${stock.candidates}; without an exact count, ${stock.withoutExactStock}`
      : `stock: not read, there is no wc/v3 key (WOO_AUTH_USER, WOO_AUTH_PASS); new products not checked for an exact count, ${stock.candidates}`,
    ...(refreshed > 0 ? [`baseline: a run records what ${rowsOf(refreshed)} agree on with the source, with no catalogue write`] : []),
    ...shown.map(({ kind, item }) => rowLine(kind, item)),
    ...(rows.length > shown.length ? [`  ${rows.length - shown.length} more (--json lists them)`] : []),
    ...plan.snapshotWarnings.map((warning) => `! ${oneLine(warning)}`),
    ...(plan.missingInSource.length > 0 ? [`gone from the source, and left as they are: ${rowsOf(plan.missingInSource.length)} (--json lists them)`] : []),
    ...(codes.length > 0 ? [`warnings: ${codes.join(", ")} (--json lists them)`] : []),
  ].join("\n");
}
