import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A tool the agent surface shows must not answer "this feature is off". So every
 * tool whose handler stops on a flag is hidden exactly when it stops, under the
 * same view of the flags the surface will read.
 *
 * Each flag runs both ways against brand.config (filled below): a runtime-tier
 * flag has config holding the OPPOSITE of what the merged view says, so a handler
 * reading it statically takes the wrong side and goes red here. A compile-time
 * flag cannot differ between the two (lib/feature-flags/resolve.ts), so config
 * follows the view. The database refuses everything and nothing below the gates
 * is real, so the only thing asserted is which side of its gate each handler took.
 */

const flags = vi.hoisted(() => ({
  config: {} as Record<string, boolean>,
  runtime: {} as Record<string, boolean>,
}));

vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  Object.assign(flags.config, actual.brand.features);
  return { ...actual, brand: { ...actual.brand, ecommerceEnabled: true, features: flags.config } };
});
vi.mock("@/lib/brand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brand")>();
  const { brand } = await import("@/brand.config");
  return {
    ...actual,
    getBrand: async () => ({ ...brand, features: flags.runtime, source: "db" }),
    getFeatures: async () => flags.runtime,
    getFeatureGateState: async () => ({ available: true, features: flags.runtime }),
  };
});
vi.mock("@/lib/db", () => {
  const refuse = () => Promise.reject(new Error("no database in this test"));
  const model = new Proxy(refuse, { get: () => refuse });
  return {
    prisma: new Proxy({}, { get: (_target, key) => (key === "then" ? undefined : model) }),
    isPostgresDriver: () => false,
  };
});
vi.mock("@/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit")>()),
  withAudit: async (_meta: unknown, run: () => Promise<unknown>) => run(),
}));
vi.mock("@/lib/import/scrape-site", () => ({
  scrapeSite: async () => ({ ok: false, error: "went past the gate" }),
}));
vi.mock("@/lib/magic/plan", () => ({
  planPage: async () => {
    throw new Error("went past the gate");
  },
  planAndGenerate: async () => {
    throw new Error("went past the gate");
  },
}));

import { FEATURE_MANIFEST, RUNTIME_TOGGLEABLE_KEYS, type FeatureKey } from "@/lib/feature-flags/manifest";
import { SCOPES } from "@/lib/scopes";
import { isVisible } from "@/lib/surface/visible";
import { getTool, invokeTool } from "@/lib/tools/registry";

/** Every tool whose handler stops on a flag, with arguments that reach the handler. */
const STOPS_ON_A_FLAG: { tool: string; args: unknown; needs: FeatureKey[]; pastTheGate?: RegExp }[] = [
  { tool: "content.import_site", args: { url: "https://shop.example.test", confirm: true }, needs: ["siteImport"], pastTheGate: /went past the gate/ },
  { tool: "magic.plan_page", args: { intent: "a landing page for a roastery" }, needs: ["magicBuilder"], pastTheGate: /went past the gate/ },
  { tool: "magic.generate_page", args: { intent: "a landing page for a roastery" }, needs: ["magicBuilder"], pastTheGate: /went past the gate/ },
  { tool: "sitepack.export", args: { confirm: true }, needs: ["sitePack"] },
  { tool: "sitepack.import", args: { cartpackBase64: "AAAA", dryRun: true }, needs: ["sitePack"] },
  { tool: "migration.project_set", args: { sourceUrl: "https://old-shop.example.test", confirm: true }, needs: ["migrationDashboard"] },
  { tool: "migration.freeze_sitemap", args: { dryRun: true }, needs: ["migrationDashboard"] },
  { tool: "migration.run_checks", args: {}, needs: ["migrationDashboard"] },
  { tool: "migration.status", args: {}, needs: ["migrationDashboard"] },
  { tool: "migration.attest", args: { checkId: "pay.test-order", status: "pass", note: "signed off", confirm: true }, needs: ["migrationDashboard"] },
  { tool: "migration.woo_plan", args: {}, needs: ["migrationDashboard"] },
  { tool: "subscriptions.list", args: {}, needs: ["subscriptions"] },
  { tool: "subscriptions.cancel", args: { id: "sub_1" }, needs: ["subscriptions"] },
  { tool: "sheets.sync_now", args: {}, needs: ["sheetsSync"] },
  { tool: "sheets.pull", args: {}, needs: ["sheetsSync"] },
  { tool: "sheets.push", args: {}, needs: ["sheetsSync"] },
  { tool: "drive.import_folder", args: { confirm: true }, needs: ["googleDrive", "mediaLibrary"] },
  { tool: "drive.backup_now", args: { confirm: true }, needs: ["googleDrive"] },
];

/** The two ways a handler says it: a thrown refusal, or a no-op result naming the flag. */
const STOPPED = /is disabled|ikke aktiveret|-feature-disabled/;

function setFlags(on: readonly FeatureKey[]): void {
  flags.runtime = {};
  for (const { key } of FEATURE_MANIFEST) {
    const value = on.includes(key);
    flags.runtime[key] = value;
    flags.config[key] = RUNTIME_TOGGLEABLE_KEYS.has(key) ? !value : value;
  }
}

async function answer(tool: string, args: unknown): Promise<string> {
  const outcome = await invokeTool(tool, args, { actor: "user:test" } as never, SCOPES);
  // A 422 never reached the handler, and would otherwise pass as "not stopped".
  expect(outcome, JSON.stringify(outcome)).not.toMatchObject({ status: 422 });
  return JSON.stringify(outcome);
}

describe("a tool is hidden exactly when its handler would stop", () => {
  beforeEach(() => setFlags([]));

  it.each(STOPS_ON_A_FLAG)("$tool", async ({ tool, args, needs, pastTheGate }) => {
    const definition = getTool(tool);
    expect(definition, tool).toBeDefined();
    const seen = () => isVisible(definition!, { ecommerceEnabled: true, features: flags.runtime });

    setFlags(needs);
    expect(seen()).toBe(true);
    const reached = await answer(tool, args);
    expect(reached).not.toMatch(STOPPED);
    if (pastTheGate) expect(reached).toMatch(pastTheGate);

    for (const flag of needs) {
      setFlags(needs.filter((other) => other !== flag));
      expect(seen(), `${tool} without ${flag}`).toBe(false);
      expect(await answer(tool, args), `${tool} without ${flag}`).toMatch(STOPPED);
    }
  });
});
