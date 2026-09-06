import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A contact form must accept a plain enquiry.
 *
 * `/api/inquiries` required `projectType` — "Du skal vælge en service" — which
 * is agency vocabulary: which *service* are you buying. A product or SaaS fork
 * has no service to pick, so it could not receive an ordinary enquiry at all,
 * and found out via a lost customer. The shipped `SmartContactForm` masked it by
 * always sending a defaulted value, so only a fork with its own form (or a
 * direct POST) ever hit the wall.
 *
 * `projectType` is now optional at the wire. The DB column stays NON-NULL and
 * the route writes `?? ""` — deliberate: the demo deploy workflow runs no
 * migrations, and the canary databases are Turso (which the Prisma 7 CLI cannot
 * push to non-interactively). Shipping a nullable column would
 * have broken the live contact form on both canaries until someone ran a manual
 * `turso shell`. Relaxing the column is a separate, owner-gated step.
 */

const mocks = vi.hoisted(() => ({
  leadCreate: vi.fn(),
  features: {} as { leadAiTriage?: boolean; contactAttachments?: boolean },
  limiterAllowed: true,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void cb };
});

vi.mock("@/brand.config", () => ({
  brand: {
    storeName: "Test Shop",
    get features() {
      return mocks.features;
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: { lead: { create: (a: unknown) => mocks.leadCreate(a), update: vi.fn() } },
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiSettings: async () => ({ anthropicConfigured: false, localConfigured: false }),
}));
vi.mock("@/lib/ai/client", () => ({ chatModelResolved: vi.fn() }));
vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@/lib/audit-context", () => ({
  withAuditContext: (_c: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  inquiryPerIpLimiter: { check: () => ({ allowed: mocks.limiterAllowed, retryAfter: 60 }) },
  supportTriagePerIpLimiter: { check: () => ({ allowed: mocks.limiterAllowed, retryAfter: 60 }) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/inquiries/route");
  return POST(
    new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const PLAIN = {
  name: "Test Testesen",
  email: "t@example.test",
  message: "En helt almindelig henvendelse uden service-felt.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.features = {};
  mocks.limiterAllowed = true;
  mocks.leadCreate.mockResolvedValue({ id: "lead_1" });
});

describe("/api/inquiries — a plain enquiry is enough", () => {
  it("accepts name + email + message with no projectType", async () => {
    const res = await post(PLAIN);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "lead_1" });
  });

  it("stores an empty string, never null, so the non-null column is safe", async () => {
    // The canary databases still have `projectType TEXT NOT NULL`; a null here
    // would fail the insert on a live site.
    await post(PLAIN);

    expect(mocks.leadCreate.mock.calls[0][0].data.projectType).toBe("");
  });

  it("still stores a service when one IS given (agency forks unaffected)", async () => {
    await post({ ...PLAIN, projectType: "Kundeservice" });

    expect(mocks.leadCreate.mock.calls[0][0].data.projectType).toBe("Kundeservice");
  });

  it("keeps the budget default — it never blocked a submission", async () => {
    await post(PLAIN);

    // The point of this test is that the field is optional and the submission
    // still lands. The default value itself changed from "Ukendt" to "": this
    // form never sends `budget`, so the default WAS the stored value for every
    // lead from it, and the admin rendered it as a Danish badge on an English
    // shop. Empty omits the badge (app/admin/leads/page.tsx renders it behind
    // `lead.budget &&`), which is the honest rendering of "not asked".
    expect(mocks.leadCreate.mock.calls[0][0].data.budget).toBe("");
  });

  it("still rejects a genuinely invalid submission", async () => {
    // Relaxing one field must not turn the endpoint into a sink.
    const res = await post({ name: "x", email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(mocks.leadCreate).not.toHaveBeenCalled();
  });
});
