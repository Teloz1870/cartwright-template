import { describe, expect, it, vi, beforeEach } from "vitest";
import { brand } from "@/brand.config";

/**
 * DRØM133-a — the runtime flag `apiDiscountBounds` (lib/tools/discount-bounds.ts).
 * With it on, a discount code minted by an API key (`apikey:` actor — REST and
 * MCP both stamp it) must carry usageLimit + validUntil, and one above
 * policies.apiDiscountCaps (50 % / 50000 øre by default) is stored switched off
 * with a plain notice. The admin chat (`operator-chat:`) and flag-off shops keep
 * the old payloads exactly. Mocks: prisma, withAudit, getFeatureGateState, preview mail.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    discountCode: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    brandingSettings: { findUnique: vi.fn(), update: vi.fn() },
  },
  flagOn: false,
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
const UNTIL = "2026-12-31T23:59:59.000Z";

// TOOL-REFUSAL-4XX-b: each refusal is a ToolRefusal, so REST/MCP answer 409
// with this code instead of an opaque 500. Matched by shape, not instanceof:
// vi.resetModules gives every test its own copy of lib/tools/refusal.
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

async function create(body: Record<string, unknown>, ctx: never) {
  const { createDiscount } = await import("@/lib/tools/discounts");
  return createDiscount.handler(createDiscount.input.parse(body), ctx);
}

describe("discounts.create from an API key, apiDiscountBounds on", () => {
  it.each([
    [{ validUntil: UNTIL }, "usageLimit"],
    [{ usageLimit: 10 }, "validUntil"],
  ])("refuses a code without %o, naming %s, and writes nothing", async (extra, missing) => {
    await expect(create({ code: "SPRING10", type: "percent", value: 10, ...extra }, KEY)).rejects.toEqual(
      refusal("discount_limit_and_expiry_required", new RegExp(`must set both usageLimit and validUntil.*missing: ${missing}`)),
    );
    expect(mocks.prisma.discountCode.create).not.toHaveBeenCalled();
  });

  it("creates a percent code above the cap switched off and says so", async () => {
    const result = await create({ code: "HALF60", type: "percent", value: 60, usageLimit: 5, validUntil: UNTIL }, KEY);
    expect(mocks.prisma.discountCode.create.mock.calls[0][0].data).toEqual({
      code: "HALF60", type: "percent", value: 60, validUntil: new Date(UNTIL), usageLimit: 5, active: false,
    });
    expect(result).toMatchObject({ id: "d1", code: "HALF60", active: false });
    expect((result as { notice: string }).notice).toMatch(/created switched OFF: 60% is above this shop's cap of 50%/);
  });

  it("creates a fixed code above the cap switched off, in the shop's base currency", async () => {
    const result = await create({ code: "BIG600", type: "fixed", value: 60000, usageLimit: 1, validUntil: UNTIL }, KEY);
    expect(mocks.prisma.discountCode.create.mock.calls[0][0].data.active).toBe(false);
    // The scaffold gate runs this suite under the USD market too: read the
    // currency from brand.config instead of assuming the engine's DKK default.
    const cur = brand.policies.currency;
    expect((result as { notice: string }).notice).toContain(
      `600.00 ${cur} is above this shop's cap of 500.00 ${cur}`,
    );
  });

  it("creates a code at the cap active, with the limits it was given", async () => {
    const result = await create({ code: "FIFTY", type: "percent", value: 50, usageLimit: 3, validUntil: UNTIL }, KEY);
    expect(mocks.prisma.discountCode.create.mock.calls[0][0].data).toMatchObject({ usageLimit: 3, active: true });
    expect(result).toEqual({ id: "d1", code: "FIFTY", active: true });
  });
});

describe("the unbounded paths keep the old payload", () => {
  const OLD = { code: "NINETY", type: "percent", value: 90, validUntil: null, usageLimit: null, active: true };

  it("the admin chat creates a 90% code without limits, active", async () => {
    const result = await create({ code: "ninety", type: "percent", value: 90 }, CHAT);
    expect(mocks.prisma.discountCode.create).toHaveBeenCalledWith({ data: OLD });
    expect(result).toEqual({ id: "d1", code: "NINETY" });
  });

  it("an API key on a shop with the flag off does too", async () => {
    mocks.flagOn = false;
    const result = await create({ code: "ninety", type: "percent", value: 90 }, KEY);
    expect(mocks.prisma.discountCode.create).toHaveBeenCalledWith({ data: OLD });
    expect(result).toEqual({ id: "d1", code: "NINETY" });
  });
});

describe("discounts.toggle", () => {
  async function toggleOn(ctx: never) {
    const { toggleDiscount } = await import("@/lib/tools/discounts");
    mocks.prisma.discountCode.findUnique.mockResolvedValue({ id: "d1", code: "HALF60", type: "percent", value: 60, active: false });
    mocks.prisma.discountCode.update.mockResolvedValue({ code: "HALF60", active: true });
    return toggleDiscount.handler(toggleDiscount.input.parse({ code: "HALF60", active: true }), ctx);
  }

  it("an API key cannot switch on a code above the cap: 409 naming the cap, not the stored value", async () => {
    const err = await toggleOn(KEY).catch((e: Error) => e);
    expect(err).toEqual(refusal("discount_above_cap", /^Discount code HALF60 stays off: its value is above this shop's cap of 50% /));
    // A refusal's text is public and never built from a DB row (lib/tools/refusal.ts).
    expect((err as Error).message).not.toContain("60%");
    expect(mocks.prisma.discountCode.update).not.toHaveBeenCalled();
  });

  it("the admin chat can", async () => {
    await expect(toggleOn(CHAT)).resolves.toEqual({ code: "HALF60", active: true });
  });

  // Triad round 2 (Codex P2): a key's "on" for a code an admin already switched
  // on must not undo an admin's switch-off that lands between the read and the
  // write. The row is modelled here; the admin's write lands right after the read.
  it("a key's no-op 'on' does not undo a concurrent admin switch-off of a code above the cap", async () => {
    const { toggleDiscount } = await import("@/lib/tools/discounts");
    const row = { id: "d1", code: "HALF60", type: "percent", value: 60, active: true };
    mocks.prisma.discountCode.findUnique.mockImplementation(async () => {
      const seen = { ...row };
      row.active = false; // the admin switches it off after the key's read
      return seen;
    });
    const write = async ({ where, data }: { where: { id: string; active?: boolean }; data: { active: boolean } }) => {
      const matches = where.id === row.id && (where.active === undefined || where.active === row.active);
      if (matches) row.active = data.active;
      return matches;
    };
    mocks.prisma.discountCode.update.mockImplementation(async (a) => (await write(a), { code: row.code, active: row.active }));
    mocks.prisma.discountCode.updateMany.mockImplementation(async (a) => ({ count: (await write(a)) ? 1 : 0 }));
    await expect(
      toggleDiscount.handler(toggleDiscount.input.parse({ code: "HALF60", active: true }), KEY),
    ).rejects.toEqual(refusal("discount_above_cap", /HALF60 stays off/));
    expect(row.active).toBe(false);
  });

  it("a key's 'on' for a code above the cap that is still on keeps it on", async () => {
    const { toggleDiscount } = await import("@/lib/tools/discounts");
    mocks.prisma.discountCode.findUnique.mockResolvedValue({ id: "d1", code: "HALF60", type: "percent", value: 60, active: true });
    mocks.prisma.discountCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      toggleDiscount.handler(toggleDiscount.input.parse({ code: "HALF60", active: true }), KEY),
    ).resolves.toEqual({ code: "HALF60", active: true });
    expect(mocks.prisma.discountCode.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", active: true },
      data: { active: true },
    });
    expect(mocks.prisma.discountCode.update).not.toHaveBeenCalled();
  });
});

describe("marketing.create_campaign from an API key, apiDiscountBounds on", () => {
  const base = { discountCode: "MEGA70", discountType: "percent", discountValue: 70, announcement: "Mega sale now on" };

  async function campaign(body: Record<string, unknown>, ctx: never) {
    const { createCampaign } = await import("@/lib/tools/marketing");
    return createCampaign.handler(createCampaign.input.parse(body), ctx);
  }

  it("refuses a campaign without usageLimit before any write", async () => {
    await expect(campaign({ ...base, validUntil: UNTIL }, KEY)).rejects.toEqual(
      refusal("discount_limit_and_expiry_required", /missing: usageLimit/),
    );
    expect(mocks.prisma.discountCode.create).not.toHaveBeenCalled();
    expect(mocks.prisma.discountCode.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
  });

  it("creates a new code above the cap switched off and leaves the banner and preview alone", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ announcement: "Old banner" });
    const result = await campaign({ ...base, validUntil: UNTIL, usageLimit: 20, previewEmail: "a@b.dk" }, KEY);
    expect(mocks.prisma.discountCode.create.mock.calls[0][0].data).toMatchObject({ code: "MEGA70", usageLimit: 20, active: false });
    expect(mocks.prisma.discountCode.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
    expect(mocks.writePreviewFile).not.toHaveBeenCalled();
    expect(result).toMatchObject({ announcement: "Old banner", previewPath: null });
    expect((result as { notice: string }).notice).toMatch(/MEGA70 was created switched OFF: 70% is above .* banner and preview mail were not changed/);
  });

  it("refuses to re-price a live code above the cap", async () => {
    mocks.prisma.discountCode.findUnique.mockResolvedValue({ active: true });
    await expect(campaign({ ...base, validUntil: UNTIL, usageLimit: 20 }, KEY)).rejects.toEqual(
      refusal("discount_above_cap", /MEGA70 is live and stays as it is: 70% is above/),
    );
    expect(mocks.prisma.discountCode.upsert).not.toHaveBeenCalled();
  });

  it("a draft code that appears after step 0 is a 409 discount_code_exists, not a 500", async () => {
    mocks.prisma.discountCode.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    await expect(campaign({ ...base, validUntil: UNTIL, usageLimit: 20 }, KEY)).rejects.toEqual(
      refusal("discount_code_exists", /^Discount code MEGA70 already exists/),
    );
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
  });

  it("the admin chat runs the old upsert with no limits", async () => {
    mocks.prisma.discountCode.upsert.mockResolvedValue({ id: "c1", code: "MEGA70" });
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue({ id: 1, announcement: "Old banner" });
    mocks.prisma.brandingSettings.update.mockResolvedValue({ announcement: base.announcement });
    const result = await campaign(base, CHAT);
    expect(mocks.prisma.discountCode.upsert.mock.calls[0][0].create).toEqual({
      code: "MEGA70", type: "percent", value: 70, validUntil: null, active: true,
    });
    expect(result).not.toHaveProperty("notice");
  });
});
