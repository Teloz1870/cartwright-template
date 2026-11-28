import { describe, expect, it, vi, beforeEach } from "vitest";
import { brand } from "@/brand.config";

/**
 * DRØM133-b — the holes the #788 R3 falsifier left in `apiDiscountBounds`:
 *   (a) usageLimit / validUntil had no ceiling: 2147483647 uses and an expiry
 *       in 9999 satisfied "must set both". policies.apiDiscountCaps now carries
 *       maxUsageLimit (1000) and maxValidDays (90); beyond either is the same
 *       draft / 409 as above the value cap.
 *   (c) discounts.toggle only checked the value: a key could switch on an
 *       admin's code with no limit and no expiry.
 *   (e) no test said a key's campaign WITHIN the caps stores the usageLimit and
 *       validUntil it was given.
 * Mocks: prisma, withAudit, getFeatureGateState, preview mail — as in
 * discount-api-key-bounds.test.ts.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    discountCode: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    brandingSettings: { findUnique: vi.fn(), update: vi.fn() },
  },
  flagOn: true,
  writePreviewFile: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({
  withAudit: async (_meta: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/brand", () => ({
  getFeatureGateState: async () => ({ available: true, features: { apiDiscountBounds: mocks.flagOn } }),
}));
vi.mock("@/lib/tools/marketing-helpers", () => ({ writePreviewFile: mocks.writePreviewFile }));

const KEY = { actor: "apikey:k1" } as never;
const CHAT = { actor: "operator-chat:u1" } as never;
const CAPS = brand.policies.apiDiscountCaps;
const DAY = 24 * 60 * 60 * 1000;
const daysAhead = (d: number) => new Date(Date.now() + d * DAY).toISOString();
const SOON = daysAhead(CAPS.maxValidDays - 1);

const refusal = (code: string, message: RegExp) =>
  expect.objectContaining({ name: "ToolRefusal", code, status: 409, message: expect.stringMatching(message) });

beforeEach(() => {
  vi.resetModules();
  mocks.flagOn = true;
  for (const fn of Object.values(mocks.prisma.discountCode)) fn.mockReset();
  for (const fn of Object.values(mocks.prisma.brandingSettings)) fn.mockReset();
  mocks.writePreviewFile.mockReset();
  mocks.prisma.discountCode.create.mockImplementation(async ({ data }) => ({ id: "d1", ...data }));
  mocks.prisma.discountCode.findUnique.mockResolvedValue(null);
});

it("ships the ceilings this suite assumes", () => {
  expect(CAPS).toMatchObject({ maxUsageLimit: 1000, maxValidDays: 90 });
});

describe("(a) discounts.create from an API key: usageLimit / validUntil ceilings", () => {
  async function create(body: Record<string, unknown>) {
    const { createDiscount } = await import("@/lib/tools/discounts");
    return createDiscount.handler(createDiscount.input.parse(body), KEY);
  }

  it("a usageLimit above the ceiling creates the code switched off and says why", async () => {
    const result = await create({ code: "MANY", type: "percent", value: 10, usageLimit: 2147483647, validUntil: SOON });
    expect(mocks.prisma.discountCode.create.mock.calls[0][0].data).toMatchObject({ usageLimit: 2147483647, active: false });
    expect(result).toMatchObject({ code: "MANY", active: false });
    expect((result as { notice: string }).notice).toMatch(
      /created switched OFF: a usageLimit of 2147483647 is above this shop's cap of 1000 uses/,
    );
  });

  it("an expiry beyond the ceiling creates the code switched off and says why", async () => {
    const result = await create({ code: "FOREVER", type: "percent", value: 10, usageLimit: 5, validUntil: "9999-12-31T23:59:59.000Z" });
    expect(mocks.prisma.discountCode.create.mock.calls[0][0].data.active).toBe(false);
    expect((result as { notice: string }).notice).toMatch(/validUntil 9999-12-31T23:59:59.000Z is more than 90 days ahead/);
  });

  it("names every bound it is beyond", async () => {
    const result = await create({ code: "ALLOVER", type: "percent", value: 60, usageLimit: 5000, validUntil: daysAhead(365) });
    const notice = (result as { notice: string }).notice;
    expect(notice).toMatch(/60% is above .*; and a usageLimit of 5000 .*; and validUntil .* more than 90 days ahead/);
  });

  it("a code at both ceilings is created live", async () => {
    const result = await create({ code: "ATCAP", type: "percent", value: 10, usageLimit: 1000, validUntil: SOON });
    expect(mocks.prisma.discountCode.create.mock.calls[0][0].data).toMatchObject({ usageLimit: 1000, active: true });
    expect(result).toEqual({ id: "d1", code: "ATCAP", active: true });
  });

  it("the admin chat and a flag-off shop keep the unbounded create", async () => {
    const { createDiscount } = await import("@/lib/tools/discounts");
    const body = { code: "BIGRUN", type: "percent", value: 10, usageLimit: 2147483647, validUntil: "9999-12-31T23:59:59.000Z" };
    await expect(createDiscount.handler(createDiscount.input.parse(body), CHAT)).resolves.toEqual({ id: "d1", code: "BIGRUN" });
    mocks.flagOn = false;
    await expect(createDiscount.handler(createDiscount.input.parse(body), KEY)).resolves.toEqual({ id: "d1", code: "BIGRUN" });
    for (const call of mocks.prisma.discountCode.create.mock.calls) expect(call[0].data.active).toBe(true);
  });
});

describe("(a) marketing.create_campaign from an API key: the same ceilings", () => {
  const base = { discountCode: "WEEKEND", discountType: "percent", discountValue: 10, announcement: "Weekend sale now on" };

  async function campaign(body: Record<string, unknown>) {
    const { createCampaign } = await import("@/lib/tools/marketing");
    return createCampaign.handler(createCampaign.input.parse(body), KEY);
  }

  it("a new code beyond a ceiling is a draft and the banner is left alone", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ announcement: "Old banner" });
    const result = await campaign({ ...base, usageLimit: 5000, validUntil: SOON });
    expect(mocks.prisma.discountCode.create.mock.calls[0][0].data).toMatchObject({ usageLimit: 5000, active: false });
    expect(mocks.prisma.discountCode.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
    expect((result as { notice: string }).notice).toMatch(/WEEKEND was created switched OFF: a usageLimit of 5000/);
  });

  it("a live code is not extended beyond the expiry ceiling: 409, nothing written", async () => {
    mocks.prisma.discountCode.findUnique.mockResolvedValue({ active: true, validUntil: null });
    await expect(campaign({ ...base, usageLimit: 10, validUntil: daysAhead(400) })).rejects.toEqual(
      refusal("discount_above_cap", /WEEKEND is live and stays as it is: validUntil .* more than 90 days ahead/),
    );
    expect(mocks.prisma.discountCode.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
  });

  // (e) The measured gap: no test followed a key's within-cap campaign to the row.
  it("(e) a campaign within the caps stores the usageLimit and validUntil it was given, and runs the banner", async () => {
    mocks.prisma.discountCode.upsert.mockResolvedValue({ id: "c1", code: "WEEKEND" });
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ id: 1, announcement: "Old banner" });
    mocks.prisma.brandingSettings.update.mockResolvedValue({ announcement: base.announcement });
    const result = await campaign({ ...base, usageLimit: 25, validUntil: SOON });
    const call = mocks.prisma.discountCode.upsert.mock.calls[0][0];
    expect(call.create).toEqual({
      code: "WEEKEND", type: "percent", value: 10, validUntil: new Date(SOON), usageLimit: 25, active: true,
    });
    expect(call.update).toEqual({ type: "percent", value: 10, validUntil: new Date(SOON), usageLimit: 25 });
    expect(mocks.prisma.discountCode.create).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.update).toHaveBeenCalled();
    expect(result).not.toHaveProperty("notice");
  });
});

describe("(c) discounts.toggle: a key cannot switch on a code it could not have created live", () => {
  async function toggleOn(row: Record<string, unknown>, ctx: never = KEY) {
    const { toggleDiscount } = await import("@/lib/tools/discounts");
    mocks.prisma.discountCode.findUnique.mockResolvedValue({ id: "d1", code: "ADMIN10", type: "percent", value: 10, active: false, ...row });
    mocks.prisma.discountCode.update.mockResolvedValue({ code: "ADMIN10", active: true });
    return toggleDiscount.handler(toggleDiscount.input.parse({ code: "ADMIN10", active: true }), ctx);
  }

  it.each([
    ["no usage limit", { usageLimit: null, validUntil: new Date(SOON) }],
    ["no expiry", { usageLimit: 10, validUntil: null }],
    ["neither (an admin's unlimited code)", { usageLimit: null, validUntil: null }],
    ["a usage limit above the ceiling", { usageLimit: 2147483647, validUntil: new Date(SOON) }],
    ["an expiry beyond the ceiling", { usageLimit: 10, validUntil: new Date("9999-12-31T23:59:59.000Z") }],
  ])("refuses %s with 409, naming the ceilings and not the row", async (_label, row) => {
    const err = await toggleOn(row).catch((e: Error) => e);
    expect(err).toEqual(
      refusal(
        "discount_above_cap",
        /^Discount code ADMIN10 stays off: a code an API key switches on must have a usage limit of at most 1000 uses and an expiry at most 90 days ahead/,
      ),
    );
    expect((err as Error).message).not.toMatch(/2147483647|9999/);
    expect(mocks.prisma.discountCode.update).not.toHaveBeenCalled();
  });

  it("an unlimited code an admin already switched on stays on, untouched by the key's write", async () => {
    mocks.prisma.discountCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(toggleOn({ active: true, usageLimit: null, validUntil: null })).resolves.toEqual({ code: "ADMIN10", active: true });
    expect(mocks.prisma.discountCode.updateMany).toHaveBeenCalledWith({ where: { id: "d1", active: true }, data: { active: true } });
    expect(mocks.prisma.discountCode.update).not.toHaveBeenCalled();
  });

  it("a code within every bound is switched on", async () => {
    await expect(toggleOn({ usageLimit: 1000, validUntil: new Date(SOON) })).resolves.toEqual({ code: "ADMIN10", active: true });
    expect(mocks.prisma.discountCode.update).toHaveBeenCalledWith(expect.objectContaining({ data: { active: true } }));
  });

  it("the admin chat and a flag-off shop still switch an unlimited code on", async () => {
    await expect(toggleOn({ usageLimit: null, validUntil: null }, CHAT)).resolves.toEqual({ code: "ADMIN10", active: true });
    mocks.flagOn = false;
    await expect(toggleOn({ usageLimit: null, validUntil: null })).resolves.toEqual({ code: "ADMIN10", active: true });
  });

  it("switching a code off is never bounded", async () => {
    const { toggleDiscount } = await import("@/lib/tools/discounts");
    mocks.prisma.discountCode.findUnique.mockResolvedValue({ id: "d1", code: "ADMIN10", type: "percent", value: 10, active: true, usageLimit: null, validUntil: null });
    mocks.prisma.discountCode.update.mockResolvedValue({ code: "ADMIN10", active: false });
    await expect(
      toggleDiscount.handler(toggleDiscount.input.parse({ code: "ADMIN10", active: false }), KEY),
    ).resolves.toEqual({ code: "ADMIN10", active: false });
  });
});
