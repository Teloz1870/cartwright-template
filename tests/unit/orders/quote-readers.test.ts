/**
 * TIL1-a — who reads an order, and what each reader does with a quote. A quote
 * counts as revenue nowhere and no customer sees it, which is only true of the
 * readers that exist, so every one of them is listed here with its reason. A new
 * query on `Order` or `OrderItem` turns this red until it says what it does with a
 * quote. Behaviour is in ../order-quote-status-db.test.tsx; this is the census.
 * Engine only: a fork's own report on its own orders is none of this list's business.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { QUOTE_STATUS } from "@/lib/orders/status";
import { REPO_ROOT, isEngineCheckout, stripComments, walkCode } from "../../helpers/claims";

const source = (file: string) => stripComments(readFileSync(join(REPO_ROOT, file), "utf8"));

const READ_RE =
  /\.(?:order|orderItem)\s*\.\s*(?:findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|aggregate|groupBy)\(|_count:\s*\{\s*select:\s*\{\s*orders\b/g;
const GUARD_RE = /placedOrderWhere\(\)|revenueOrderWhere\(\)|=== QUOTE_STATUS/g;

const countOf = (text: string, re: RegExp) => [...text.matchAll(re)].length;
const readsIn = (file: string) => countOf(source(file), READ_RE);

const PRODUCT_DIRS = ["app", "components", "lib", "plugins", "prisma", "scripts"];
const productFiles = () => PRODUCT_DIRS.flatMap((dir) => walkCode(dir));

/** Each read leaves the quote out, so its guards number its reads. */
const LEAVES_IT_OUT = [
  "app/[locale]/account/orders/page.tsx",
  "app/[locale]/order/[id]/page.tsx",
  "app/admin/kunder/page.tsx",
  "app/admin/page.tsx",
  "app/api/ucp/orders/route.ts",
  "lib/tools/analytics.ts",
  "lib/tools/customer.ts",
  "plugins/reviews/pages/OrderReviewPage.tsx",
];

const OTHERWISE: Record<string, string> = {
  // The review token's own read needs no guard: only the cron below mints one.
  "plugins/reviews/api/submit.ts": "the session's read is guarded; a token comes from the cron below",
  "plugins/reviews/pages/ReviewTokenPage.tsx": "a token comes from the cron below",
  // Pinned to their own statuses.
  "plugins/reviews/api/review-prompt-cron.ts": "pinned to paid and shipped",
  "app/api/cron/reconcile-stripe/route.ts": "pinned to pending_payment",
  "lib/orders/lifecycle.ts": "reads after a write conditional on pending_payment",
  // The machine decides.
  "app/api/webhook/stripe/route.ts": "canTransition(status, 'paid') has no row for it; a refund is a fact",
  // The operator sees a quote: that is its whole audience.
  "lib/tools/orders.ts": "the operator's tool",
  "app/admin/ordrer/actions.ts": "the operator's list and moves; what presumes a purchase refuses it",
  "app/admin/ordrer/page.tsx": "the operator's list",
  "app/admin/ordrer/[id]/page.tsx": "the operator's order page",
  "app/admin/ordrer/[id]/pakkeseddel/route.ts": "a print the operator asks for, and nothing moves",
  "lib/fulfillment.ts": "its one caller, createFulfillment, refuses a quote",
  // Data, not a count.
  "lib/gdpr/export.ts": "a data export holds a customer's quotes: they are personal data",
  "prisma/seed.ts": "the seed guard counts every row, to know a database holds data",
};

describe.runIf(isEngineCheckout)("every reader of an order is accounted for", () => {
  it("the list is exact: nothing reads an order that is not on it, and nothing on it has stopped", () => {
    const found = productFiles().filter((file) => readsIn(file) > 0).sort();
    expect(found).toEqual([...LEAVES_IT_OUT, ...Object.keys(OTHERWISE)].sort());
  });

  it.each(LEAVES_IT_OUT)("%s guards every read it makes", (file) => {
    expect(readsIn(file)).toBeGreaterThan(0);
    expect(countOf(source(file), GUARD_RE)).toBe(readsIn(file));
  });

  it("the review route guards the one read a session can reach", () => {
    expect(source("plugins/reviews/api/submit.ts")).toMatch(/where:\s*\{\s*id:\s*input\.orderId,\s*userId,\s*\.\.\.placedOrderWhere\(\)\s*\}/);
  });

  it("the cron that mints a review token does not look at a quote", () => {
    expect(source("plugins/reviews/api/review-prompt-cron.ts")).toMatch(/status:\s*\{\s*in:\s*\["paid",\s*"shipped"\]\s*\}/);
  });

  it("no feed, sitemap, catalogue export or site pack reads an order", () => {
    const paths = [
      "lib/feeds",
      "app/feed",
      "app/api/acp/feed",
      "app/sitemap.ts",
      "lib/products-csv.ts",
      "lib/sitepack",
      "lib/tools/sitepack.ts",
    ];
    const files = paths.flatMap((path) => walkCode(path));
    expect(files.length).toBeGreaterThan(paths.length);
    expect(files.filter((file) => readsIn(file) > 0)).toEqual([]);
  });
});

describe.runIf(isEngineCheckout)("nothing creates a quote yet (TIL1-b and OPS-11 will)", () => {
  // When this goes red, a path has come that creates one: flip `implemented` on the
  // `quotes` flag with it, so /built-with-cartwright and llms.txt can claim it.
  it("the one place that names the status in a query's `status:` only filters on it", () => {
    const NAMED = new RegExp(`\\bstatus:\\s*(?:QUOTE_STATUS|"${QUOTE_STATUS}")`);
    const hits = productFiles().filter((file) => NAMED.test(source(file)));
    expect(hits).toEqual(["app/admin/ordrer/page.tsx"]);
    expect(source(hits[0])).toMatch(/where:\s*\{\s*status:\s*QUOTE_STATUS\s*\}/);
  });
});
