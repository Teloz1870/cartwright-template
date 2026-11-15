import { z } from "zod";

/**
 * MIGD `data.counts` — does the imported catalogue hold as many categories and
 * products as the WooCommerce shop? Pure over what the caller read: the shop's
 * rows per kind (the Store API list, `complete` only when every page came and
 * the rows equal its `X-WP-Total`), each with the reason the import leaves it
 * out when it does, and the externalIds of this site's imported rows
 * (`source = "woocommerce"`). Reading the shop is the webshop module's
 * (lib/woo, through lib/tools/packs/commerce.ts): nothing here imports it.
 *
 * Per kind, every source row is one of
 *
 *   matched   imported here under its Woo id
 *   skipped   not here, and the skip list says why (the importer's own reason) → warn
 *   missing   not here, and nothing says why                                  → fail
 *
 * and every imported row the shop no longer lists is `extra` (fail). A kind
 * passes only when every row is matched and none is extra: a skipped row is a
 * row the new site does not sell, so an explained difference is a warn, never
 * a pass — the ready counter can only under-claim (ready.ts). A list that is
 * incomplete or unreadable is `inconclusive`, never a pass or a fail.
 */

export const DATA_KINDS = ["categories", "products"] as const;
export type DataKind = (typeof DATA_KINDS)[number];
export type DataCountsStatus = "pass" | "warn" | "fail" | "inconclusive";
/** How many differing rows a run keeps, missing and extra first. */
export const DATA_DIFF_CAP = 50;

/** `code` groups the skip list; `reason` is the importer's own words for this row. */
export type DataSkip = { code: string; reason: string };
export type DataSourceRow = { externalId: string; skip?: DataSkip };
export type DataSourceList = { complete: boolean; total: number | null; rows: DataSourceRow[] };
export type DataCountsInput = {
  source: Record<DataKind, DataSourceList>;
  imported: Record<DataKind, readonly string[]>;
};

const statusEnum = z.enum(["pass", "warn", "fail", "inconclusive"]);
const count = z.number().int().nonnegative();
const kindCount = z.object({
  status: statusEnum,
  /** The shop's `X-WP-Total`; null when it sent none. */
  sourceTotal: count.nullable(),
  source: count,
  imported: count,
  matched: count,
  skipped: count,
  missing: count,
  extra: count,
  detail: z.string().optional(),
}).strict();
const diff = z.object({
  kind: z.enum(DATA_KINDS),
  externalId: z.string(),
  diff: z.enum(["missing", "extra", "skipped"]),
  code: z.string().optional(),
  reason: z.string(),
}).strict();

/** What a data.counts run keeps in `MigrationCheckRun.summary` and the tool returns. */
export const dataCountsSummarySchema = z.object({
  status: z.enum(["pass", "warn", "fail", "inconclusive", "skip"]),
  kinds: z.object({ categories: kindCount, products: kindCount }).strict(),
  /** The skip list: how many rows each reason code left out. */
  skipped: z.record(z.string(), count),
  /** The id diff (data.ids): every differing row's count, the first DATA_DIFF_CAP of them. */
  diffs: z.object({ count, first: z.array(diff) }).strict(),
  detail: z.string().optional(),
}).strict();

export type DataCountsSummary = z.infer<typeof dataCountsSummarySchema>;
type KindCount = z.infer<typeof kindCount>;
type DataDiff = z.infer<typeof diff>;

const ORDER = ["fail", "inconclusive", "warn"] as const;
const worst = (statuses: DataCountsStatus[]): DataCountsStatus => ORDER.find((s) => statuses.includes(s)) ?? "pass";

const EXTRA = "imported from WooCommerce, but the shop no longer lists it (deleted, drafted or made private there since the import)";
const MISSING = "the shop lists it and nothing explains why it is not imported";

export function judgeDataCounts(input: DataCountsInput): DataCountsSummary {
  const diffs: DataDiff[] = [];
  const skipped: Record<string, number> = {};
  const kinds = {} as Record<DataKind, KindCount>;
  for (const kind of DATA_KINDS) {
    const { complete, total, rows } = input.source[kind];
    const imported = new Set(input.imported[kind]);
    const base = { sourceTotal: total, source: rows.length, imported: imported.size, matched: 0, skipped: 0, missing: 0, extra: 0 };
    if (!complete) {
      // Without the whole list no row can be called missing or extra.
      kinds[kind] = { ...base, status: "inconclusive", detail: `the shop's ${kind} list is incomplete: ${rows.length} of ${total ?? "an unknown number"} read` };
      continue;
    }
    const k = { ...base };
    const listed = new Set<string>();
    for (const row of rows) {
      listed.add(row.externalId);
      if (imported.has(row.externalId)) k.matched++;
      else if (row.skip) {
        k.skipped++;
        skipped[row.skip.code] = (skipped[row.skip.code] ?? 0) + 1;
        diffs.push({ kind, externalId: row.externalId, diff: "skipped", code: row.skip.code, reason: row.skip.reason });
      } else {
        k.missing++;
        diffs.push({ kind, externalId: row.externalId, diff: "missing", reason: MISSING });
      }
    }
    for (const id of imported) {
      if (listed.has(id)) continue;
      k.extra++;
      diffs.push({ kind, externalId: id, diff: "extra", reason: EXTRA });
    }
    kinds[kind] = { ...k, status: k.missing || k.extra ? "fail" : k.skipped ? "warn" : "pass" };
  }
  const empty = DATA_KINDS.every((kind) => input.source[kind].complete && kinds[kind].source === 0 && kinds[kind].imported === 0);
  const rank = { missing: 0, extra: 1, skipped: 2 } as const;
  const first = [...diffs].sort((a, b) => rank[a.diff] - rank[b.diff]).slice(0, DATA_DIFF_CAP);
  return {
    // A shop with nothing to move proves nothing: skip, which never counts toward the switch.
    status: empty ? "skip" : worst(DATA_KINDS.map((kind) => kinds[kind].status)),
    kinds,
    skipped,
    diffs: { count: diffs.length, first },
    ...(empty ? { detail: "the shop lists no categories and no products" } : {}),
  };
}

/** The shop could not be read: nothing is compared, and the run counts as not ready. */
export function unreadableSource(detail: string, imported: Record<DataKind, readonly string[]>): DataCountsSummary {
  const kind = (k: DataKind): KindCount => ({
    status: "inconclusive", sourceTotal: null, source: 0, imported: new Set(imported[k]).size, matched: 0, skipped: 0, missing: 0, extra: 0,
  });
  return { status: "inconclusive", kinds: { categories: kind("categories"), products: kind("products") }, skipped: {}, diffs: { count: 0, first: [] }, detail };
}
