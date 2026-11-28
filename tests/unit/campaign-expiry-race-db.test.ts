import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";

/**
 * DISCOUNT-FU-NITS (2) — marketing.create_campaign on a real database: a code
 * that is live when step 0 checks it, and has expired by the time step 1
 * writes, is not revived by the campaign's own future validUntil.
 *
 * The race is driven, not slept for: step 0 runs for real, and when step 1's
 * audited function starts (after step 0's checks, before the write) the faked
 * clock jumps past the stored validUntil — "expired in between". The write is
 * the real Prisma 7 upsert over libSQL, so the test measures what the
 * conditional write does in SQL, not what a mock returns. A control without the
 * jump proves the same flow does update the row, so the refusal is the expiry
 * guard and not a write that never matches.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const state = vi.hoisted(() => ({
  client: null as unknown as object,
  // Runs once, when step 1's audited function starts: the moment of the race.
  betweenStep0AndWrite: null as null | (() => unknown),
  audited: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_target, key) => Reflect.get(state.client, key) }),
}));
vi.mock("@/lib/audit", () => ({
  withAudit: async (meta: { tool: string }, fn: () => Promise<unknown>) => {
    state.audited.push(meta.tool);
    const race = state.betweenStep0AndWrite;
    state.betweenStep0AndWrite = null;
    await race?.();
    return fn();
  },
}));
vi.mock("@/lib/brand", () => ({
  getFeatureGateState: async () => ({ available: true, features: { apiDiscountBounds: false } }),
}));

const { createCampaign } = await import("@/lib/tools/marketing");

const T0 = new Date("2026-11-27T12:00:00.000Z");
const STORED_UNTIL = new Date(T0.getTime() + 1_000); // live at step 0, gone a second later
const CAMPAIGN_UNTIL = "2027-01-31T23:59:59.000Z"; // the campaign's own, future expiry
const CTX = { actor: "admin:race", ip: "10.0.0.1", userAgent: "race/1" } as never;

let dir = "";
let prisma: PrismaClient;

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-campaign-race-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  state.client = prisma;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  if (!sqlite) return;
  state.audited = [];
  // Only Date is faked: libSQL's own timers and I/O keep running.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  await prisma.discountCode.deleteMany();
  await prisma.brandingSettings.deleteMany();
  await prisma.brandingSettings.create({
    data: { id: 1, storeName: "Race shop", heroImage: "", announcement: "Old banner" },
  });
  await prisma.discountCode.create({
    data: { code: "RACE10", type: "percent", value: 10, validUntil: STORED_UNTIL, active: true },
  });
});

afterEach(() => {
  state.betweenStep0AndWrite = null;
  vi.useRealTimers();
});

function campaign() {
  return createCampaign.input.parse({
    discountCode: "race10",
    discountType: "percent",
    discountValue: 25,
    validUntil: CAMPAIGN_UNTIL,
    announcement: "Race sale is on",
  });
}

async function stored() {
  return prisma.discountCode.findUniqueOrThrow({ where: { code: "RACE10" } });
}

describe.skipIf(!sqlite)("marketing.create_campaign — the code changes between step 0 and the write", () => {
  it("expired in between: refused as expired; expiry, price, banner untouched", async () => {
    state.betweenStep0AndWrite = () => vi.setSystemTime(new Date(STORED_UNTIL.getTime() + 1_000));

    await expect(createCampaign.handler(campaign(), CTX)).rejects.toEqual(
      expect.objectContaining({
        name: "ToolRefusal",
        code: "discount_code_expired",
        status: 409,
        message: expect.stringMatching(/^Discount code RACE10 exists and has expired/),
      }),
    );

    const row = await stored();
    expect(row.validUntil).toEqual(STORED_UNTIL);
    expect(row.value).toBe(10);
    expect(row.active).toBe(true);
    // The refusal is thrown inside step 1: step 2 (the banner) never starts.
    expect(state.audited).toEqual(["marketing.create_campaign:discount"]);
    const branding = await prisma.brandingSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(branding.announcement).toBe("Old banner");
  });

  it("control: no jump, the same campaign re-prices the code and takes its validUntil", async () => {
    const result = await createCampaign.handler(campaign(), CTX);
    expect(result.ok).toBe(true);

    const row = await stored();
    expect(row.validUntil).toEqual(new Date(CAMPAIGN_UNTIL));
    expect(row.value).toBe(25);
  });

  it("a code with no expiry still matches, whatever the clock says", async () => {
    await prisma.discountCode.update({ where: { code: "RACE10" }, data: { validUntil: null } });
    state.betweenStep0AndWrite = () => vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));

    const result = await createCampaign.handler(campaign(), CTX);
    expect(result.ok).toBe(true);
    expect((await stored()).validUntil).toEqual(new Date(CAMPAIGN_UNTIL));
  });

  it("switched off in between: still refused as switched off (#777), not a 500", async () => {
    state.betweenStep0AndWrite = () =>
      prisma.discountCode.update({ where: { code: "RACE10" }, data: { active: false } });

    await expect(createCampaign.handler(campaign(), CTX)).rejects.toEqual(
      expect.objectContaining({ name: "ToolRefusal", code: "discount_code_switched_off", status: 409 }),
    );
    const row = await stored();
    expect(row.active).toBe(false);
    expect(row.validUntil).toEqual(STORED_UNTIL);
  });
});
