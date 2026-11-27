import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * DRØM133-a, triad round 1 (Codex P2): the bound must fail CLOSED when the
 * feature flags cannot be read. Uses the real brand loader (lib/brand +
 * lib/data-source/brand); only prisma is mocked, so a failing
 * BrandingSettings read is exactly what a DB blip between the transport gate
 * and the tool call looks like (getBrand's 30 s cache expired meanwhile).
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    discountCode: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    brandingSettings: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({
  withAudit: async (_meta: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/tools/marketing-helpers", () => ({ writePreviewFile: vi.fn() }));

const KEY = { actor: "apikey:k1" } as never;
const CHAT = { actor: "operator-chat:u1" } as never;

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  for (const fn of Object.values(mocks.prisma.discountCode)) fn.mockReset();
  for (const fn of Object.values(mocks.prisma.brandingSettings)) fn.mockReset();
  mocks.prisma.brandingSettings.findUnique.mockRejectedValue(new Error("libsql: connection reset"));
  mocks.prisma.brandingSettings.findFirst.mockRejectedValue(new Error("libsql: connection reset"));
  mocks.prisma.discountCode.create.mockImplementation(async ({ data }) => ({ id: "d1", ...data }));
  mocks.prisma.discountCode.findUnique.mockResolvedValue(null);
});

describe("flags unreadable (BrandingSettings read fails)", () => {
  it("an API key's discounts.create is refused and writes nothing", async () => {
    const { createDiscount } = await import("@/lib/tools/discounts");
    await expect(
      createDiscount.handler(createDiscount.input.parse({ code: "ninety", type: "percent", value: 90 }), KEY),
    ).rejects.toThrow(/feature flags could not be read/);
    expect(mocks.prisma.discountCode.create).not.toHaveBeenCalled();
  });

  it("an API key's discounts.toggle on is refused and writes nothing", async () => {
    const { toggleDiscount } = await import("@/lib/tools/discounts");
    mocks.prisma.discountCode.findUnique.mockResolvedValue({ id: "d1", code: "HALF60", type: "percent", value: 60, active: false });
    await expect(
      toggleDiscount.handler(toggleDiscount.input.parse({ code: "HALF60", active: true }), KEY),
    ).rejects.toThrow(/feature flags could not be read/);
    expect(mocks.prisma.discountCode.update).not.toHaveBeenCalled();
  });

  it("an API key's marketing.create_campaign is refused and writes nothing", async () => {
    const { createCampaign } = await import("@/lib/tools/marketing");
    const args = createCampaign.input.parse({
      discountCode: "MEGA70", discountType: "percent", discountValue: 70, announcement: "Mega sale now on",
    });
    await expect(createCampaign.handler(args, KEY)).rejects.toThrow(/feature flags could not be read/);
    expect(mocks.prisma.discountCode.create).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
  });

  it("the admin chat is not gated on the flag read (old behaviour)", async () => {
    const { createDiscount } = await import("@/lib/tools/discounts");
    await expect(
      createDiscount.handler(createDiscount.input.parse({ code: "ninety", type: "percent", value: 90 }), CHAT),
    ).resolves.toEqual({ id: "d1", code: "NINETY" });
  });
});
