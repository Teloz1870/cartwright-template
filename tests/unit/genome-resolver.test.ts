import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * resolveCopyField (A1) — verificér resolver-wiring (vibe-intent, schema,
 * audit-context-stamping) med en MOCKET LLM. Ingen rigtige model-kald.
 */

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  chatModelResolved: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("@/lib/ai/client", () => ({ chatModelResolved: mocks.chatModelResolved }));
vi.mock("@/lib/audit-context", () => ({
  withAuditContext: (_ctx: unknown, fn: () => unknown) => Promise.resolve(fn()),
}));

describe("resolveCopyField", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.generateObject.mockReset();
    mocks.chatModelResolved.mockReset();
  });

  it("tvinger vibe-intent og returnerer modellens text", async () => {
    mocks.chatModelResolved.mockResolvedValue({
      handle: {},
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
    mocks.generateObject.mockResolvedValue({
      object: { text: "Calm, single-origin coffee for people who slow down." },
    });

    const { resolveCopyField } = await import("@/lib/genome/resolvers/copy-field");
    const out = await resolveCopyField(
      { label: "footer tagline", purpose: "footer tagline", minLength: 10, maxLength: 220 },
      {
        tone: "warm",
        audience: "consumer",
        formality: "casual",
        vibe: "cozy",
        storeName: "Northbound",
      },
    );

    expect(out).toBe("Calm, single-origin coffee for people who slow down.");
    expect(mocks.chatModelResolved).toHaveBeenCalledWith("vibe");
    // prompten skal bære brand-voicen så modellen kan harmonisere
    const promptArg = mocks.generateObject.mock.calls[0][0].prompt as string;
    expect(promptArg).toContain("warm");
    expect(promptArg).toContain("Northbound");
  });
});
