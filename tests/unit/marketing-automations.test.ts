import { describe, expect, it, vi } from "vitest";

/**
 * Marketing-automations — emit-gates (flag / Resend-key / consent), happy path
 * og fail-soft. Mocket brand.features, prisma.subscriber, getResendApiKey og
 * Resend-SDK'et, så ingen rigtig email/DB rammes.
 */

const mocks = vi.hoisted(() => ({
  brand: {
    features: { marketingAutomations: false } as {
      marketingAutomations?: boolean;
    },
  },
  prisma: { subscriber: { findUnique: vi.fn() } },
  getResendApiKey: vi.fn(),
  eventsSend: vi.fn(),
}));

vi.mock("@/brand.config", () => ({ brand: mocks.brand }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/mailer/resend", () => ({ getResendApiKey: mocks.getResendApiKey }));
vi.mock("resend", () => ({
  Resend: class {
    events = { send: mocks.eventsSend };
  },
}));

type Opts = {
  flag?: boolean;
  key?: string | null;
  consent?: "confirmed" | "unsubscribed" | null;
};

function setup(opts: Opts = {}) {
  vi.resetModules();
  mocks.brand.features.marketingAutomations = opts.flag ?? false;
  mocks.getResendApiKey.mockReset().mockResolvedValue(opts.key ?? null);
  mocks.prisma.subscriber.findUnique
    .mockReset()
    .mockResolvedValue(opts.consent ? { status: opts.consent } : null);
  mocks.eventsSend
    .mockReset()
    .mockResolvedValue({ data: { id: "evt_1" }, error: null });
}

function load() {
  return import("@/lib/marketing/automations");
}

describe("emitMarketingEvent — gates", () => {
  it("no-op når flag er off", async () => {
    setup({ flag: false, key: "re_x", consent: "confirmed" });
    const { emitMarketingEvent, MARKETING_EVENTS } = await load();
    expect(await emitMarketingEvent(MARKETING_EVENTS.userCreated, "a@b.dk")).toBe(
      false,
    );
    expect(mocks.eventsSend).not.toHaveBeenCalled();
  });

  it("no-op når ingen Resend-key er konfigureret", async () => {
    setup({ flag: true, key: null, consent: "confirmed" });
    const { emitMarketingEvent, MARKETING_EVENTS } = await load();
    expect(await emitMarketingEvent(MARKETING_EVENTS.orderPlaced, "a@b.dk")).toBe(
      false,
    );
    expect(mocks.eventsSend).not.toHaveBeenCalled();
  });

  it("no-op uden marketing-consent (ingen subscriber)", async () => {
    setup({ flag: true, key: "re_x", consent: null });
    const { emitMarketingEvent, MARKETING_EVENTS } = await load();
    expect(
      await emitMarketingEvent(MARKETING_EVENTS.cartAbandoned, "a@b.dk"),
    ).toBe(false);
    expect(mocks.eventsSend).not.toHaveBeenCalled();
  });

  it("no-op når subscriber er unsubscribed", async () => {
    setup({ flag: true, key: "re_x", consent: "unsubscribed" });
    const { emitMarketingEvent, MARKETING_EVENTS } = await load();
    expect(await emitMarketingEvent(MARKETING_EVENTS.userCreated, "a@b.dk")).toBe(
      false,
    );
    expect(mocks.eventsSend).not.toHaveBeenCalled();
  });
});

describe("emitMarketingEvent — happy path + fail-soft", () => {
  it("sender event med normaliseret email + payload og returnerer true", async () => {
    setup({ flag: true, key: "re_x", consent: "confirmed" });
    const { emitMarketingEvent, MARKETING_EVENTS } = await load();
    const r = await emitMarketingEvent(MARKETING_EVENTS.orderPlaced, "  A@B.DK ", {
      orderId: "o1",
    });
    expect(r).toBe(true);
    expect(mocks.eventsSend).toHaveBeenCalledTimes(1);
    expect(mocks.eventsSend).toHaveBeenCalledWith({
      event: "cartwright.order.placed",
      email: "a@b.dk",
      payload: { orderId: "o1" },
    });
  });

  it("kaster ikke når events.send fejler (fire-and-forget-sikkerhed)", async () => {
    setup({ flag: true, key: "re_x", consent: "confirmed" });
    mocks.eventsSend.mockRejectedValue(new Error("resend down"));
    const { emitMarketingEvent, MARKETING_EVENTS } = await load();
    expect(await emitMarketingEvent(MARKETING_EVENTS.userCreated, "a@b.dk")).toBe(
      false,
    );
  });
});

describe("hasMarketingConsent", () => {
  it("true kun for status=confirmed", async () => {
    setup({ consent: "confirmed" });
    const { hasMarketingConsent } = await load();
    expect(await hasMarketingConsent("a@b.dk")).toBe(true);
  });

  it("false for unsubscribed", async () => {
    setup({ consent: "unsubscribed" });
    const { hasMarketingConsent } = await load();
    expect(await hasMarketingConsent("a@b.dk")).toBe(false);
  });

  it("false når ingen subscriber findes", async () => {
    setup({ consent: null });
    const { hasMarketingConsent } = await load();
    expect(await hasMarketingConsent("a@b.dk")).toBe(false);
  });

  it("false for tom email (rammer ikke DB)", async () => {
    setup({ consent: "confirmed" });
    const { hasMarketingConsent } = await load();
    expect(await hasMarketingConsent("   ")).toBe(false);
    expect(mocks.prisma.subscriber.findUnique).not.toHaveBeenCalled();
  });
});
