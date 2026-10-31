/**
 * ORD1-a1 — the money path does not read the order-status table.
 *
 * The webhook, the cron, order creation and checkout keep their literals, so no
 * row a shop writes can change a payment, a stock move or a refund. Two guards,
 * because each sees what the other cannot:
 *   - `no-restricted-imports` in eslint.config.mjs, run here through the real
 *     config against each of these paths, red at the moment someone types the import;
 *   - a walk of the disk that also sees a dynamic import, a query on the table
 *     itself, and an import further down what these files import.
 * What a row can and cannot do at runtime is in ../order-status-name-no-money-db.test.ts.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { REPO_ROOT, isEngineCheckout, stripComments, walkCode } from "../../helpers/claims";

const MONEY_PATH = [
  "app/api/webhook",
  "app/api/cron/reconcile-stripe",
  "app/api/checkout",
  "app/[locale]/checkout",
  "app/admin/ordrer/actions.ts",
  "lib/acp/complete.ts",
  "lib/money.ts",
  "lib/stripe.ts",
  "lib/orders/cancel-payment.ts",
  "lib/orders/cancel-unpaid.ts",
  "lib/orders/create.ts",
  "lib/orders/create-acp.ts",
  "lib/orders/lifecycle.ts",
  "lib/orders/notify-owner.ts",
  "lib/orders/on-paid.ts",
  "lib/orders/operator-status.ts",
  "lib/orders/restock.ts",
  "lib/orders/status.ts",
];

const READER = "lib/orders/status-reader.ts";
const TABLE = "lib/orders/status-table.ts";
const SEED = "lib/orders/status-seed.ts";
const FORBIDDEN = [READER, TABLE, SEED];

const moneyFiles = MONEY_PATH.flatMap((path) => walkCode(path));
const source = (file: string) => stripComments(readFileSync(join(REPO_ROOT, file), "utf8"));

// As in scripts/site-profile-audit.ts: import/export-from, bare, dynamic, require.
const IMPORT_RE =
  /(?:import|export)\s+[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|[^.\w])require\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;

function importsOf(file: string): string[] {
  return [...source(file).matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
}

/** Repo-relative file an import names, or null for a package. */
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? spec.slice(2)
    : spec.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(from), spec))
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const abs = join(REPO_ROOT, candidate);
    if (existsSync(abs) && statSync(abs).isFile()) return candidate;
  }
  return null;
}

/** Everything the given files reach through their imports, themselves included. */
function reachableFrom(files: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...files];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file) || file.startsWith("app/generated/") || !/\.(ts|tsx|mts)$/.test(file)) continue;
    seen.add(file);
    for (const spec of importsOf(file)) {
      const target = resolveImport(file, spec);
      if (target) queue.push(target);
    }
  }
  return seen;
}

/** Product code: what a shop runs and what sets up its database. */
const productFiles = () => ["app", "components", "lib", "plugins", "prisma", "scripts"].flatMap((d) => walkCode(d));

describe("the disk: the money path reads no status table", () => {
  it("the paths this guards are all there", () => {
    expect(moneyFiles.length).toBeGreaterThanOrEqual(MONEY_PATH.length);
    if (!isEngineCheckout) return; // a fork may have left a part of the engine out
    for (const path of MONEY_PATH) expect(walkCode(path).length, path).toBeGreaterThan(0);
  });

  it("no file on it imports the table, its reader or its seed, dynamically or not", () => {
    const hits = moneyFiles.flatMap((file) =>
      importsOf(file)
        .filter((spec) => FORBIDDEN.includes(resolveImport(file, spec) ?? ""))
        .map((spec) => `${file} → ${spec}`),
    );
    expect(hits).toEqual([]);
  });

  it("nor does anything it reaches: what it imports, and what that imports", () => {
    const reached = reachableFrom(moneyFiles);
    // The walk really walks: the mailer and the door are a few steps out from the webhook.
    expect(reached.has("lib/orders/on-paid.ts")).toBe(true);
    expect(reached.has("lib/mailer.ts")).toBe(true);
    expect(reached.size).toBeGreaterThan(moneyFiles.length);
    expect(FORBIDDEN.filter((file) => reached.has(file))).toEqual([]);
  });

  it("nor does it go round them and query the table itself", () => {
    const QUERY = /\.orderStatus\b|\b(?:from|into|update|join)\s+["'`]?OrderStatus\b/i;
    const hits = [...reachableFrom(moneyFiles)].filter((file) => QUERY.test(source(file)));
    expect(hits).toEqual([]);
    // The pattern finds what it is for: the two files that do touch the table.
    expect(productFiles().filter((file) => QUERY.test(source(file))).sort()).toEqual([READER, SEED]);
  });

  it("only the admin's two order pages read through the reader", () => {
    const importers = productFiles().filter((file) =>
      importsOf(file).some((spec) => resolveImport(file, spec) === READER),
    );
    expect(importers.sort()).toEqual(["app/admin/ordrer/[id]/page.tsx", "app/admin/ordrer/page.tsx"]);
  });

  it("status.ts stays pure and keeps its transition table", () => {
    const status = source("lib/orders/status.ts");
    expect(importsOf("lib/orders/status.ts")).toEqual([]);
    expect(status).toMatch(/const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus\[\]>> = \{/);
    expect(status).toMatch(/export function canTransition\(/);
  });

  it("the table stays pure too: a client component can import it", () => {
    expect(importsOf(TABLE)).toEqual(["@/lib/orders/status"]);
    expect(importsOf(READER)).toContain("server-only");
  });

  it("the money path still spells out what it writes", () => {
    // Since ORD0-b every status write on an existing order goes through lib/orders/lifecycle.ts.
    expect(source("lib/orders/lifecycle.ts")).toMatch(/"pending_payment", \{ status: "cancelled" \}/);
    expect(source("lib/orders/create.ts")).toMatch(/paymentMode === "stripe" \? "pending_payment" : "paid"/);
    expect(source("lib/orders/create-acp.ts")).toMatch(/status: "paid"/);
    const webhook = source("app/api/webhook/stripe/route.ts");
    for (const write of ['to: "paid"', 'to: "flagged_review"', 'to: "disputed"']) expect(webhook).toContain(write);
    expect(source("app/api/cron/reconcile-stripe/route.ts")).toMatch(/status: "pending_payment"[\s\S]*to: "paid"/);
  });
});

describe("the lint rule goes red on the money path", () => {
  let eslint: ESLint;
  beforeAll(() => {
    eslint = new ESLint({ cwd: REPO_ROOT });
  });

  const restricted = async (code: string, filePath: string) => {
    const [result] = await eslint.lintText(code, { filePath: join(REPO_ROOT, filePath) });
    return result.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
  };

  const FORMS = [
    'import { getOrderStatuses } from "@/lib/orders/status-reader";',
    'import { STATIC_ORDER_STATUS_ROWS } from "@/lib/orders/status-table";',
    'import { seedOrderStatuses } from "@/lib/orders/status-seed";',
    'import { getOrderStatuses } from "./status-reader";',
    'import { orderStatusDisplay } from "../orders/status-table";',
    'export { getOrderStatuses } from "@/lib/orders/status-reader";',
  ];

  it("for every form of the import, on every file of it", { timeout: 120_000 }, async () => {
    for (const file of moneyFiles) {
      for (const form of FORMS) {
        const messages = await restricted(`${form}\n`, file);
        expect(messages, `${file}: ${form}`).toHaveLength(1);
        expect(messages[0]).toContain("money path");
      }
    }
  });

  it("for a file of it that does not exist yet", { timeout: 120_000 }, async () => {
    for (const file of [
      "app/api/webhook/frisbii/route.ts",
      "app/api/checkout/quote/route.ts",
      "app/[locale]/checkout/done/page.tsx",
      "lib/orders/create-quote.ts",
    ]) {
      expect(await restricted(`${FORMS[0]}\n`, file), file).toHaveLength(1);
    }
  });

  it("and stays quiet where the table is meant to be read", { timeout: 120_000 }, async () => {
    for (const file of [
      "app/admin/ordrer/page.tsx",
      "app/admin/ordrer/[id]/page.tsx",
      "components/admin/OrdersWorkspace.tsx",
      "prisma/seed.ts",
    ]) {
      expect(await eslint.isPathIgnored(join(REPO_ROOT, file)), file).toBe(false);
      expect(await restricted(`${FORMS[0]}\n`, file), file).toEqual([]);
    }
  });
});
