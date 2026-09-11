import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

/**
 * /admin/konto change-password-action + password-styrkevalidering. Mocket
 * requireAdmin + prisma; rigtig bcrypt (få runs, hurtigt nok) for realisme.
 */

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

async function load() {
  vi.resetModules();
  return import("@/app/admin/konto/actions");
}

const CURRENT = "correct-current-pw";
const STRONG = "new-strong-password";

describe("changeAdminPassword", () => {
  beforeEach(async () => {
    mocks.requireAdmin.mockReset().mockResolvedValue({ user: { id: "u1" } });
    const hash = await bcrypt.hash(CURRENT, 10);
    mocks.prisma.user.findUnique
      .mockReset()
      .mockResolvedValue({ passwordHash: hash });
    mocks.prisma.user.update.mockReset().mockResolvedValue({});
  });

  it("afviser når nuværende adgangskode er forkert", async () => {
    const { changeAdminPassword } = await load();
    const r = await changeAdminPassword(
      { status: "idle" },
      fd({ current: "wrong", next: STRONG, confirm: STRONG }),
    );
    expect(r.status).toBe("error");
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("afviser svagt nyt password (<12 tegn)", async () => {
    const { changeAdminPassword } = await load();
    const r = await changeAdminPassword(
      { status: "idle" },
      fd({ current: CURRENT, next: "short", confirm: "short" }),
    );
    expect(r.status).toBe("error");
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("afviser når de to nye ikke matcher", async () => {
    const { changeAdminPassword } = await load();
    const r = await changeAdminPassword(
      { status: "idle" },
      fd({ current: CURRENT, next: STRONG, confirm: "different-strong-pw" }),
    );
    expect(r.status).toBe("error");
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("afviser magic-link-konto uden passwordHash", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ passwordHash: null });
    const { changeAdminPassword } = await load();
    const r = await changeAdminPassword(
      { status: "idle" },
      fd({ current: "x", next: STRONG, confirm: STRONG }),
    );
    expect(r.status).toBe("error");
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("happy path: hasher nyt password + rydder mustChangePassword", async () => {
    const { changeAdminPassword } = await load();
    const r = await changeAdminPassword(
      { status: "idle" },
      fd({ current: CURRENT, next: STRONG, confirm: STRONG }),
    );
    expect(r.status).toBe("success");
    expect(mocks.prisma.user.update).toHaveBeenCalledTimes(1);
    const arg = mocks.prisma.user.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1" });
    expect(arg.data.mustChangePassword).toBe(false);
    expect(await bcrypt.compare(STRONG, arg.data.passwordHash)).toBe(true);
  });
});

describe("validatePasswordStrength", () => {
  it("afviser tom og for kort, accepterer >=12 tegn", async () => {
    const { validatePasswordStrength } = await import("@/lib/auth/password");
    expect(validatePasswordStrength("").ok).toBe(false);
    expect(validatePasswordStrength("short").ok).toBe(false);
    expect(validatePasswordStrength("a-twelve-char").ok).toBe(true);
  });
});
