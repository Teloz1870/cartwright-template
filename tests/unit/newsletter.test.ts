import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Newsletter-backend (H7) — validering, single-opt-in, idempotens, unsubscribe,
 * CSV. Mocket prisma.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    subscriber: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function reset() {
  vi.resetModules();
  mocks.prisma.subscriber.findUnique.mockReset();
  mocks.prisma.subscriber.upsert.mockReset().mockResolvedValue({});
  mocks.prisma.subscriber.update.mockReset().mockResolvedValue({});
}

describe("subscribe", () => {
  beforeEach(reset);

  it("afviser ugyldig email uden at skrive", async () => {
    const { subscribe } = await import("@/lib/newsletter");
    const r = await subscribe("ikke-en-email", "footer");
    expect(r.ok).toBe(false);
    expect(mocks.prisma.subscriber.upsert).not.toHaveBeenCalled();
  });

  it("opretter confirmed subscriber (single-opt-in)", async () => {
    mocks.prisma.subscriber.findUnique.mockResolvedValue(null);
    const { subscribe } = await import("@/lib/newsletter");
    const r = await subscribe("  KIM@Test.dk ", "footer");
    expect(r.ok).toBe(true);
    const call = mocks.prisma.subscriber.upsert.mock.calls[0][0];
    expect(call.where.email).toBe("kim@test.dk"); // normaliseret
    expect(call.create.status).toBe("confirmed");
  });

  it("er idempotent for allerede tilmeldt", async () => {
    mocks.prisma.subscriber.findUnique.mockResolvedValue({ email: "kim@test.dk", status: "confirmed" });
    const { subscribe } = await import("@/lib/newsletter");
    const r = await subscribe("kim@test.dk");
    expect(r.ok).toBe(true);
    expect(mocks.prisma.subscriber.upsert).not.toHaveBeenCalled();
  });
});

describe("unsubscribe", () => {
  beforeEach(reset);

  it("sætter status unsubscribed for gyldigt token", async () => {
    mocks.prisma.subscriber.findUnique.mockResolvedValue({ token: "t1", email: "kim@test.dk" });
    const { unsubscribe } = await import("@/lib/newsletter");
    const r = await unsubscribe("t1");
    expect(r.ok).toBe(true);
    const call = mocks.prisma.subscriber.update.mock.calls[0][0];
    expect(call.data.status).toBe("unsubscribed");
  });

  it("fejler for ukendt token", async () => {
    mocks.prisma.subscriber.findUnique.mockResolvedValue(null);
    const { unsubscribe } = await import("@/lib/newsletter");
    expect((await unsubscribe("nope")).ok).toBe(false);
  });
});

describe("subscribersToCsv", () => {
  beforeEach(reset);

  it("escaper og formaterer rækker", async () => {
    const { subscribersToCsv } = await import("@/lib/newsletter");
    const csv = subscribersToCsv([
      { email: 'a"b@test.dk', status: "confirmed", source: "footer", createdAt: new Date("2026-05-31T00:00:00Z") },
    ]);
    expect(csv.split("\n")[0]).toBe("email,status,source,createdAt");
    expect(csv).toContain('"a""b@test.dk"');
  });
});
