import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";
import type { MigrationResponse } from "@/lib/migration/fetch";
import { runPageCheck } from "@/lib/migration/runner";

/**
 * MIGD-4c — `seo.product-jsonld` runs in the shop's own currency, read from the
 * brand: it scales the price on a page naming no currency, and is what such a page
 * is judged as. This repo's brand is DKK and a scaffold's USD, both with two decimals:
 * the repo's own suite cannot tell the brand from a hardcoded DKK, and neither runs
 * the wiring in another scale. Here the brand is mocked to JPY, which has no minor
 * unit, and every test goes through `runPageCheck` itself. The network and the
 * database are small fakes.
 */

const mocks = vi.hoisted(() => {
  const state = { answers: new Map<string, unknown>() };
  const prisma = {
    migrationProject: {
      findFirst: vi.fn(async () => ({
        id: "proj-1", sourceUrl: "https://shop.example.test", targetUrl: "https://new.example.test", settings: null,
        frozenAt: new Date("2026-10-24T08:00:00Z"), switchedAt: null, snapshot: { id: "snap-1" },
      })),
    },
    migrationUrlMap: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [{
        id: "u1", oldUrl: "https://shop.example.test/fence/", oldPath: "/fence/", lastStatus: "pass",
        lastDetail: { class: "same", finalUrl: "https://new.example.test/fence/", hops: [] },
      }]),
    },
    migrationCheckRun: { create: vi.fn((args: unknown) => args) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return {
    state,
    prisma,
    withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/brand.config", async (orig) => {
  const actual = await orig<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, policies: { ...actual.brand.policies, currency: "JPY" } } };
});
vi.mock("@/lib/migration/fetch", () => ({
  migrationFetcher: () => async (url: string) => mocks.state.answers.get(url),
}));

const OLD_PAGE = "https://shop.example.test/fence/";
const NEW_PAGE = "https://new.example.test/fence/";

const product = (price: string, priceCurrency?: string) => ({
  "@type": "Product",
  sku: "EX-1",
  image: "https://cdn.example.test/a.jpg",
  offers: { "@type": "Offer", price, ...(priceCurrency ? { priceCurrency } : {}), availability: "https://schema.org/InStock" },
});
const answer = (url: string, node: unknown): MigrationResponse => ({
  outcome: "answer", url, status: 200, location: null, contentType: "text/html", truncated: false, xRobotsTag: null,
  body: `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head><body><h1>Fence</h1></body></html>`,
});

function compare(oldNode: unknown, newNode: unknown) {
  mocks.state.answers.set(OLD_PAGE, answer(OLD_PAGE, oldNode));
  mocks.state.answers.set(NEW_PAGE, answer(NEW_PAGE, newNode));
  return runPageCheck("seo.product-jsonld", "apikey:test", {});
}

describe("seo.product-jsonld on a shop whose own currency has no minor unit", () => {
  beforeEach(() => {
    mocks.state.answers.clear();
  });

  it("runs on what this file says it does: the brand is JPY", () => {
    expect(brand.policies.currency).toBe("JPY");
  });

  it("a page naming no currency is scaled in the shop's own: JPY has no fraction to differ in, and a yen is one minor unit", async () => {
    expect(await compare(product("1000"), product("1000.40"))).toMatchObject({ status: "pass", counts: { pass: 1 }, firstErrors: [] });
    expect(await compare(product("1000"), product("1200"))).toMatchObject({
      status: "fail",
      firstErrors: [{ oldUrl: OLD_PAGE, findings: [{ field: "price", status: "fail", old: 1000, new: 1200 }] }],
    });
  });

  it("a page naming no currency is judged as in the shop's own: no difference against JPY, the difference against any other", async () => {
    expect(await compare(product("1000"), product("1000", "JPY"))).toMatchObject({ status: "pass", firstErrors: [] });
    expect(await compare(product("1000", "JPY"), product("1000"))).toMatchObject({ status: "pass", firstErrors: [] });
    expect(await compare(product("1000"), product("1000", "DKK"))).toMatchObject({
      status: "fail",
      firstErrors: [{ findings: [{ field: "priceCurrency", status: "fail", old: "JPY", new: "DKK" }] }],
    });
    expect(await compare(product("1000", "USD"), product("1000"))).toMatchObject({
      status: "fail",
      firstErrors: [{ findings: [{ field: "priceCurrency", status: "fail", old: "USD", new: "JPY" }] }],
    });
  });
});
