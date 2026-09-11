import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * saveDomainStep (setup-wizard "Email & Domæne" step). Før denne ændring blev
 * email-felterne samlet i UI'en men aldrig gemt (dead code). Disse tests låser
 * fast at de NU persisteres til BrandingSettings (læses runtime af
 * lib/brand.ts getBrand()) og at en valgfri Resend-key sendes videre til den
 * fuldt-wirede setResendKeyAction. Alt mocket — ingen DB.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    brandingSettings: { upsert: vi.fn() },
    integrationSettings: { upsert: vi.fn() },
  },
  requireAdmin: vi.fn(),
  setResendKeyAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/admin/integrations/actions", () => ({
  setResendKeyAction: mocks.setResendKeyAction,
  getResendStatus: vi.fn(),
}));

function reset() {
  vi.resetModules();
  mocks.prisma.brandingSettings.upsert.mockReset().mockResolvedValue({});
  mocks.prisma.integrationSettings.upsert.mockReset().mockResolvedValue({});
  mocks.requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin" } });
  mocks.setResendKeyAction
    .mockReset()
    .mockResolvedValue({ ok: true, preview: "re_…" });
}

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("saveDomainStep", () => {
  beforeEach(reset);

  it("persists email identity to BrandingSettings", async () => {
    const { saveDomainStep } = await import("@/app/admin/setup/actions");
    const r = await saveDomainStep(
      fd({ setupEmail: "owner@shop.dk", fromName: "Shop", domain: "shop.dk" }),
    );
    expect(r.ok).toBe(true);
    const arg = mocks.prisma.brandingSettings.upsert.mock.calls[0][0];
    expect(arg.update).toMatchObject({
      emailAdmin: "owner@shop.dk",
      emailFrom: "owner@shop.dk",
      emailFromName: "Shop",
      domain: "shop.dk",
    });
  });

  it("forwards a provided Resend key to setResendKeyAction", async () => {
    const { saveDomainStep } = await import("@/app/admin/setup/actions");
    await saveDomainStep(fd({ resendKey: "re_test123" }));
    expect(mocks.setResendKeyAction).toHaveBeenCalledOnce();
    const passed = mocks.setResendKeyAction.mock.calls[0][0] as FormData;
    expect(passed.get("apiKey")).toBe("re_test123");
  });

  it("aborts and surfaces the Resend error when the key is invalid", async () => {
    mocks.setResendKeyAction.mockResolvedValue({
      ok: false,
      error: "Forkert format",
    });
    const { saveDomainStep } = await import("@/app/admin/setup/actions");
    const r = await saveDomainStep(fd({ resendKey: "bad" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Forkert format");
  });

  it("rejects an invalid email without writing anything", async () => {
    const { saveDomainStep } = await import("@/app/admin/setup/actions");
    const r = await saveDomainStep(fd({ setupEmail: "not-an-email" }));
    expect(r.ok).toBe(false);
    expect(mocks.prisma.brandingSettings.upsert).not.toHaveBeenCalled();
  });

  it("does nothing destructive on empty input", async () => {
    const { saveDomainStep } = await import("@/app/admin/setup/actions");
    const r = await saveDomainStep(fd({}));
    expect(r.ok).toBe(true);
    expect(mocks.prisma.brandingSettings.upsert).not.toHaveBeenCalled();
    expect(mocks.setResendKeyAction).not.toHaveBeenCalled();
  });
});
