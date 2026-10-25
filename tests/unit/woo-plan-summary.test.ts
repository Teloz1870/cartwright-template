import { describe, expect, it } from "vitest";

import {
  WOO_PLAN_ACTIONS,
  WOO_PLAN_ISSUE_CAP,
  parseWooPlanSummary,
  wooPlanSummarySchema,
} from "@/lib/migration/woo-plan-summary";
import { planWooCatalog, type WooDbState, type WooPlan } from "@/lib/woo/plan";
import { summarizeWooPlan } from "@/lib/woo/summary";
import { wooSnapshot } from "./woo-fixture-shop";

/**
 * W21-live-7-a — the plan cut down to what /admin/migration keeps: every
 * count, the first rows that need a look, no fingerprint; and the board's
 * reader, which takes only a summary this code wrote.
 */

const EMPTY_DB: WooDbState = { categories: [], products: [] };
const DKK = { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true };
const CTX = { ...DKK, durationMs: 1234.4, now: new Date("2026-10-24T09:00:00Z") };

async function planned(db = EMPTY_DB, opts: { currency: string; pricesIncludeVat: boolean; sourcePricesIncludeVat?: boolean } = DKK) {
  const snapshot = wooSnapshot();
  return { snapshot, plan: await planWooCatalog(snapshot, db, opts) };
}

describe("summarizeWooPlan", () => {
  it("keeps every count, the variations and what the snapshot holds, on the wire shape the board reads", async () => {
    const { snapshot, plan } = await planned();
    const summary = summarizeWooPlan(plan, snapshot, CTX);
    expect(wooPlanSummarySchema.safeParse(JSON.parse(JSON.stringify(summary))).success).toBe(true);
    expect(summary.counts).toEqual(plan.counts);
    // The plan's actions are the board's, in the same order.
    expect(Object.keys(summary.counts.products)).toEqual([...WOO_PLAN_ACTIONS]);
    expect(summary.variations).toEqual({ attached: 2, orphans: 1 });
    expect(summary.collections).toEqual(snapshot.meta);
    expect(summary).toMatchObject({
      version: 1, plannedAt: "2026-10-24T09:00:00.000Z", durationMs: 1234, storeUrl: snapshot.storeUrl,
      fetchedAt: snapshot.fetchedAt, currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true,
    });
    // Against an empty catalogue nothing conflicts: the one row to look at is the variation without its parent.
    expect(summary.issues).toEqual({ count: 1, first: [expect.objectContaining({ kind: "variation", externalId: "299", action: "orphan" })] });
  });

  it("lists only conflict, orphan, blocked and skip rows, the first 50, and never a fingerprint", async () => {
    const { snapshot, plan } = await planned({
      categories: [],
      products: [{ id: "p-hand", source: null, externalId: null, slug: "bordlampe-ida", permalink: null, sku: null }],
    });
    const blocked = Array.from({ length: 120 }, (_, n) => ({ externalId: `9${n}`, slug: `x-${n}`, action: "blocked" as const, reason: "currencyMismatch", fingerprint: "f" }));
    const others = (["skip", "update", "unchanged", "create"] as const).map((action, n) => ({ externalId: `8${n}`, slug: `o-${n}`, action }));
    const many: WooPlan = { ...plan, products: [...plan.products, ...others, ...blocked] };
    const summary = summarizeWooPlan(many, snapshot, CTX);
    expect(summary.issues.count).toBe(1 + 1 + 120 + 1); // the slug conflict, the skip, the blocked rows, the orphan variation
    expect(summary.issues.first).toHaveLength(WOO_PLAN_ISSUE_CAP);
    expect(summary.issues.first[0]).toMatchObject({ kind: "product", externalId: "101", action: "conflict", reason: expect.stringContaining("p-hand") });
    expect([...new Set(summary.issues.first.map((i) => i.action))]).toEqual(["conflict", "skip", "blocked"]);
    expect(plan.products.some((p) => p.fingerprint)).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("fingerprint");
  });

  it("keeps the first 20 rows gone from the source and the first 20 mapping warnings, and how many there are", async () => {
    const { snapshot, plan } = await planned();
    const gone = Array.from({ length: 30 }, (_, n) => ({ kind: "product" as const, externalId: `7${n}`, dbId: `gone-${n}` }));
    const warned = Array.from({ length: 30 }, (_, n) => ({ code: "noPrice" as const, externalId: `8${n}`, detail: "no price" }));
    const summary = summarizeWooPlan({ ...plan, missingInSource: gone, warnings: warned }, snapshot, CTX);
    expect(summary.missingInSource).toEqual({ count: 30, first: gone.slice(0, 20) });
    expect(summary.warnings).toEqual({ byCode: { noPrice: 30 }, first: warned.slice(0, 20) });
  });

  it("with the tax basis unstated, every product is blocked and the snapshot warning says why", async () => {
    const { snapshot, plan } = await planned(EMPTY_DB, { currency: "DKK", pricesIncludeVat: true });
    const summary = summarizeWooPlan(plan, snapshot, { ...CTX, sourcePricesIncludeVat: undefined });
    expect(summary.sourcePricesIncludeVat).toBeNull();
    expect(summary.counts.products.blocked).toBe(snapshot.products.length);
    expect(summary.issues.first.filter((i) => i.kind === "product").map((i) => i.reason)).toEqual(
      snapshot.products.map(() => expect.stringMatching(/^taxBasisUnknown/)),
    );
    expect(summary.snapshotWarnings.join(" ")).toContain("sourcePricesIncludeVat");
  });
});

describe("parseWooPlanSummary", () => {
  it("reads back a summary this code wrote, and nothing else", async () => {
    const { snapshot, plan } = await planned();
    const summary = JSON.parse(JSON.stringify(summarizeWooPlan(plan, snapshot, CTX)));
    expect(parseWooPlanSummary({ other: 1, wooPlan: summary })).toEqual(summary);
    for (const settings of [undefined, null, {}, [], "x", { wooPlan: "x" }, { wooPlan: { ...summary, version: 2 } }, { wooPlan: { ...summary, extra: 1 } }, { wooPlan: { ...summary, storeUrl: "shop.example.test" } },
      // A date the board could not print (new Date(…).toISOString() throws) is not one this code wrote.
      { wooPlan: { ...summary, plannedAt: "not-a-date" } }, { wooPlan: { ...summary, fetchedAt: "" } }]) {
      expect(parseWooPlanSummary(settings), JSON.stringify(settings)?.slice(0, 40)).toBeNull();
    }
    expect(parseWooPlanSummary({ wooPlan: { ...summary, storeUrl: "ftp://shop.example.test/" } })).toBeNull();
    // Every source migration.project_set accepts reads back: an IDN TLD, a public IP, a trailing dot.
    for (const storeUrl of ["https://xn--e1afmkfd.xn--p1ai/", "http://203.0.113.5/", "https://shop.example.test./"]) {
      expect(parseWooPlanSummary({ wooPlan: { ...summary, storeUrl } }), storeUrl).not.toBeNull();
    }
  });
});
