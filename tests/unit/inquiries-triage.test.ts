import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The visitor's critical path must not wait on — or silently fail on — an LLM.
 *
 * `/api/inquiries` used to `await` a structured-output triage call BEFORE
 * `prisma.lead.create`, under a comment that read "AI Triage in background".
 * Two consequences, both invisible:
 *
 *  1. every visitor waited a full round-trip before their confirmation;
 *  2. on a shop without an Anthropic key the call threw and logged
 *     `AI Triage failed:` on EVERY submission, forever — while an inner `catch`
 *     saved the lead anyway, so nothing ever surfaced. `ANTHROPIC_API_KEY` is
 *     documented as optional with a "graceful no-op" contract (README.md,
 *     .env.example) and `lib/env-preflight.ts` does not require it, so this was
 *     a correctly-configured install logging an error per contact form fill.
 *
 * The triage now runs in `after()` (the pattern `lib/registry-stats.ts` already
 * established), behind `features.leadAiTriage` (default OFF) and an
 * `anthropicConfigured` check — deliberately NOT `isAiConfigured()`, which is
 * true when EITHER provider is configured, while `chatModelResolved("vibe")`
 * forces Anthropic.
 *
 * `after` is stubbed to run its callback immediately so the assertions can
 * observe the enrichment; what the tests pin is the ORDER (lead created and
 * responded before any AI work) and the SILENCE (no model call, no console
 * noise) when a guard is closed.
 */

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  afterCallbacks: [] as Array<() => unknown>,
  features: { leadAiTriage: false } as { leadAiTriage?: boolean; contactAttachments?: boolean },
  aiSettings: { anthropicConfigured: false, localConfigured: false },
  chatModelResolved: vi.fn(),
  generateObject: vi.fn(),
  leadCreate: vi.fn(),
  leadUpdate: vi.fn(),
  limiterAllowed: true,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      mocks.order.push("after:scheduled");
      mocks.afterCallbacks.push(cb);
    },
  };
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
  prisma: {
    lead: {
      create: (args: unknown) => {
        mocks.order.push("lead.create");
        return mocks.leadCreate(args);
      },
      update: (args: unknown) => {
        mocks.order.push("lead.update");
        return mocks.leadUpdate(args);
      },
    },
  },
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiSettings: async () => mocks.aiSettings,
}));

vi.mock("@/lib/ai/client", () => ({
  chatModelResolved: (...args: unknown[]) => {
    mocks.order.push("chatModelResolved");
    return mocks.chatModelResolved(...args);
  },
}));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => {
    mocks.order.push("generateObject");
    return mocks.generateObject(...args);
  },
}));

vi.mock("@/lib/audit-context", () => ({
  withAuditContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  inquiryPerIpLimiter: { check: () => ({ allowed: mocks.limiterAllowed, retryAfter: 60 }) },
  supportTriagePerIpLimiter: { check: () => ({ allowed: mocks.limiterAllowed, retryAfter: 60 }) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

const VALID = {
  name: "Test Testesen",
  email: "t@example.test",
  projectType: "Kundeservice",
  message: "En henvendelse der er lang nok til at trigge triagen.",
};

function post(body: Record<string, unknown> = VALID) {
  return new Request("http://localhost:3000/api/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runPost(body?: Record<string, unknown>) {
  const { POST } = await import("@/app/api/inquiries/route");
  return POST(post(body));
}

/** Drain whatever `after()` scheduled, the way the runtime would post-response. */
async function drainAfter() {
  for (const cb of mocks.afterCallbacks.splice(0)) await cb();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.order.length = 0;
  mocks.afterCallbacks.length = 0;
  mocks.features = { leadAiTriage: false };
  mocks.aiSettings = { anthropicConfigured: false, localConfigured: false };
  mocks.limiterAllowed = true;
  mocks.leadCreate.mockResolvedValue({ id: "lead_1" });
  mocks.leadUpdate.mockResolvedValue({});
  mocks.chatModelResolved.mockResolvedValue({
    provider: "anthropic",
    model: "claude",
    handle: {},
  });
  mocks.generateObject.mockResolvedValue({
    object: { priority: "urgent", summary: "Vil have hjælp", suggestedReply: "Hej!" },
  });
});

describe("/api/inquiries — the AI never blocks the visitor", () => {
  it("saves the lead and responds BEFORE any model work is scheduled", async () => {
    mocks.features = { leadAiTriage: true };
    mocks.aiSettings = { anthropicConfigured: true, localConfigured: false };

    const res = await runPost();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "lead_1" });
    // The ordering IS the fix: nothing AI-shaped may precede lead.create.
    expect(mocks.order).toEqual(["lead.create", "after:scheduled"]);
    expect(mocks.chatModelResolved).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it("enriches the saved lead once the scheduled work runs", async () => {
    mocks.features = { leadAiTriage: true };
    mocks.aiSettings = { anthropicConfigured: true, localConfigured: false };

    await runPost();
    await drainAfter();

    expect(mocks.chatModelResolved).toHaveBeenCalledWith("vibe");
    expect(mocks.leadUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.leadUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "lead_1" },
      data: {
        aiPriority: "urgent",
        aiSummary: "Vil have hjælp",
        aiSuggestedReply: "Hej!",
      },
    });
  });

  it("creates the lead with a neutral priority so the row is complete without AI", async () => {
    await runPost();

    expect(mocks.leadCreate.mock.calls[0][0]).toMatchObject({
      data: { aiPriority: "normal", aiSummary: null, aiSuggestedReply: null },
    });
  });
});

describe("/api/inquiries — both guards are silent", () => {
  it("flag OFF ⇒ nothing is scheduled at all (default posture)", async () => {
    mocks.aiSettings = { anthropicConfigured: true, localConfigured: false };

    const res = await runPost();

    expect(res.status).toBe(200);
    expect(mocks.order).toEqual(["lead.create"]);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("flag ON but no Anthropic key ⇒ no model call and NO console error", async () => {
    // The regression this whole file exists for: one console.error per
    // submission, forever, on an install whose documented contract says the key
    // is optional.
    mocks.features = { leadAiTriage: true };
    mocks.aiSettings = { anthropicConfigured: false, localConfigured: true };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runPost();
    await drainAfter();

    expect(mocks.chatModelResolved).not.toHaveBeenCalled();
    expect(mocks.leadUpdate).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a short message is not worth a model call", async () => {
    mocks.features = { leadAiTriage: true };
    mocks.aiSettings = { anthropicConfigured: true, localConfigured: false };

    await runPost({ ...VALID, message: "hej" });

    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("a failing model leaves the saved lead intact and never fails the request", async () => {
    mocks.features = { leadAiTriage: true };
    mocks.aiSettings = { anthropicConfigured: true, localConfigured: false };
    mocks.generateObject.mockRejectedValue(new Error("upstream 529"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await runPost();
    await drainAfter();

    expect(res.status).toBe(200);
    expect(mocks.leadUpdate).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled(); // a real failure SHOULD be loud
    errorSpy.mockRestore();
  });
});
