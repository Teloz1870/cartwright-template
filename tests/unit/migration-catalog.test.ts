import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECK_CATALOG, CHECK_GROUPS } from "@/lib/migration/catalog";
import { READY_WINDOW_MS, readyForDns, type LatestRun } from "@/lib/migration/ready";

/**
 * MIGD-1a: the /admin/migration catalogue and its "Ready for DNS switch: n/m"
 * counter (the MIGD spec's contract).
 *
 * The counter is the go/no-go number the owner reads before moving DNS, so the
 * pins are about it never over-claiming: m is every required row, and skip,
 * inconclusive, warn, unfinished, older-than-24-hours and stale-snapshot runs
 * all stay in the denominator without counting toward n.
 */

/** The ★ rows of the spec's catalogue table. */
const REQUIRED = [
  "url.parity", "url.content", "media.map", "seo.product-jsonld", "data.counts", "data.stock",
  "redirect.imported", "eq.calculator", "pay.test-order", "cart.matrix", "dns.mail",
  "adapter.operator", "automation.parity", "cutover.reconciled",
].sort();

const NOW = new Date("2026-10-24T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const run = (checkId: string, over: Partial<LatestRun> = {}): [string, LatestRun] => [
  checkId,
  { checkId, status: "pass", finishedAt: ago(60_000), bindings: { snapshotId: "snap-1" }, ...over },
];
const allRequired = (over: Partial<LatestRun> = {}) => new Map(REQUIRED.map((id) => run(id, over)));

describe("the check catalogue", () => {
  it("has unique ids, a known group for every row, a row for every group, and dependencies that exist", () => {
    const ids = CHECK_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(CHECK_GROUPS.map((g) => g.id));
    for (const row of CHECK_CATALOG) {
      expect(groups.has(row.group), row.id).toBe(true);
      for (const dep of row.dependsOn ?? []) expect(ids, `${row.id} → ${dep}`).toContain(dep);
    }
    for (const g of CHECK_GROUPS) expect(CHECK_CATALOG.some((r) => r.group === g.id), g.id).toBe(true);
  });

  it("marks exactly the spec's ★ rows as required — url.parity among them, in the URL group", () => {
    expect(CHECK_CATALOG.filter((r) => r.required).map((r) => r.id).sort()).toEqual(REQUIRED);
    expect(CHECK_CATALOG.find((r) => r.id === "url.parity")).toMatchObject({ group: "url", required: true, dependsOn: ["url.frozen"] });
  });

  it("is pure data: the module imports nothing", () => {
    const src = readFileSync(join(process.cwd(), "lib/migration/catalog.ts"), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});

describe("readyForDns — n/m", () => {
  const current = { snapshotId: "snap-1" };

  it("nothing run ⇒ 0 of every required row", () => {
    const r = readyForDns(new Map(), { now: NOW, current });
    expect({ ready: r.ready, required: r.required }).toEqual({ ready: 0, required: 14 });
    expect([...r.missing].sort()).toEqual(REQUIRED);
  });

  it("every required row freshly passed ⇒ m/m", () => {
    expect(readyForDns(allRequired(), { now: NOW, current })).toMatchObject({ ready: 14, required: 14, missing: [] });
  });

  it("skip, inconclusive, warn and fail stay in the denominator and never count", () => {
    for (const status of ["skip", "inconclusive", "warn", "fail"]) {
      expect(readyForDns(allRequired({ status }), { now: NOW, current }), status).toMatchObject({ ready: 0, required: 14 });
    }
  });

  it("a pass counts for less than 24 hours, never from the future, and never unfinished", () => {
    const one = (over: Partial<LatestRun>) =>
      readyForDns(new Map([...allRequired(), run("url.parity", over)]), { now: NOW, current }).ready;
    expect(one({ finishedAt: ago(READY_WINDOW_MS - 1) })).toBe(14);
    expect(one({ finishedAt: ago(READY_WINDOW_MS) })).toBe(13);
    expect(one({ finishedAt: new Date(NOW.getTime() + 60_000) })).toBe(13);
    expect(one({ finishedAt: null })).toBe(13);
  });

  it("a pass bound to an older snapshot is stale; an unbound one is stale once a snapshot exists", () => {
    const one = (bindings: LatestRun["bindings"]) =>
      readyForDns(new Map([...allRequired(), run("url.parity", { bindings })]), { now: NOW, current }).missing;
    expect(one({ snapshotId: "snap-0" })).toEqual(["url.parity"]);
    expect(one(null)).toEqual(["url.parity"]);
    expect(one({ snapshotId: "snap-1", buildSha: "abc" })).toEqual([]);
  });

  it("passes on optional rows do not move the counter", () => {
    const optional = CHECK_CATALOG.filter((r) => !r.required).map((r) => run(r.id));
    expect(readyForDns(new Map(optional), { now: NOW, current }).ready).toBe(0);
  });
});
