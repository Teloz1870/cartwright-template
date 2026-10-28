import { z } from "zod";

/**
 * W21-live-7-a — the last WooCommerce import plan, as the migration project
 * keeps it in `settings.wooPlan` and /admin/migration shows it: every count,
 * the first rows that need a look, and no fingerprint (the baseline is the
 * run's, not the plan's). It lives here and not in lib/woo because the board
 * is the admin module's and lib/woo the webshop's: the board reads this JSON
 * and never imports the importer.
 */

/** lib/woo/plan.ts's `WooAction`, in its order; lib/woo/summary.ts fails to compile if the two drift. */
export const WOO_PLAN_ACTIONS = ["create", "update", "unchanged", "skip", "conflict", "orphan", "blocked"] as const;
export type WooPlanAction = (typeof WOO_PLAN_ACTIONS)[number];
/** The actions a person has to look at; the other three an import just does. */
export const WOO_PLAN_ISSUES: readonly WooPlanAction[] = ["conflict", "orphan", "blocked", "skip"];
export const WOO_PLAN_LIST_CAP = 20;
export const WOO_PLAN_ISSUE_CAP = 50;

const count = z.number().int().nonnegative();
const tally = z.record(z.enum(WOO_PLAN_ACTIONS), count);
const collection = z.object({ complete: z.boolean(), total: count.nullable(), fetched: count }).strict();
const issue = z.object({
  kind: z.enum(["category", "product", "variation"]),
  externalId: z.string(),
  slug: z.string().optional(),
  action: z.enum(WOO_PLAN_ACTIONS),
  reason: z.string().optional(),
  dbId: z.string().optional(),
}).strict();

export const wooPlanSummarySchema = z.object({
  version: z.literal(1),
  plannedAt: z.iso.datetime(),
  durationMs: count,
  /** An http(s) address the board can compare (shopBase): a stored non-URL is not a plan this code wrote. */
  // Any http(s) URL migration.project_set accepts (an IDN or IP host, a trailing dot); z.httpUrl() would refuse some.
  storeUrl: z.url({ protocol: /^https?$/ }),
  fetchedAt: z.iso.datetime(),
  mappingVersion: count,
  currency: z.string(),
  pricesIncludeVat: z.boolean(),
  /** null: nobody said, and every product reads as blocked. */
  sourcePricesIncludeVat: z.boolean().nullable(),
  collections: z.record(z.enum(["categories", "products", "variations", "wpProducts"]), collection),
  counts: z.object({ categories: tally, products: tally }).strict(),
  variations: z.object({ attached: count, orphans: count }).strict(),
  missingInSource: z.object({
    count,
    first: z.array(z.object({ kind: z.enum(["category", "product"]), externalId: z.string(), dbId: z.string() }).strict()),
  }).strict(),
  warnings: z.object({
    byCode: z.record(z.string(), count),
    first: z.array(z.object({ code: z.string(), externalId: z.string(), detail: z.string() }).strict()),
  }).strict(),
  snapshotWarnings: z.array(z.string()),
  issues: z.object({ count, first: z.array(issue) }).strict(),
}).strict();

export type WooPlanSummary = z.infer<typeof wooPlanSummarySchema>;

/** The summary in a project's `settings`, or null when there is none or it is not one this code wrote. */
export function parseWooPlanSummary(settings: unknown): WooPlanSummary | null {
  const raw = settings && typeof settings === "object" ? (settings as { wooPlan?: unknown }).wooPlan : undefined;
  const parsed = wooPlanSummarySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
