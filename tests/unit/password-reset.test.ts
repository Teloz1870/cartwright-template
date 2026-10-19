import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Password-reset-service: no-enumeration request + single-use/expiry-validering
 * af reset-tokens. Mocket prisma, mailer og brand; rigtig crypto/bcrypt.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  sendPasswordResetEmail: vi.fn(),
  brand: { url: "https://shop.dk" },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/mailer", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));
vi.mock("@/brand.config", () => ({ brand: mocks.brand }));

function load() {
  vi.resetModules();
  return import("@/lib/auth/password-reset");
}

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-reset";
  mocks.prisma.user.findUnique.mockReset();
  mocks.prisma.user.update.mockReset().mockResolvedValue({});
  mocks.prisma.passwordResetToken.findUnique.mockReset();
  mocks.prisma.passwordResetToken.create.mockReset().mockResolvedValue({});
  mocks.prisma.passwordResetToken.update.mockReset().mockResolvedValue({});
  mocks.prisma.$transaction.mockReset().mockResolvedValue([]);
  mocks.sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
});

describe("requestPasswordReset — no-enumeration", () => {
  it("ukendt email → ingen token, ingen mail", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const { requestPasswordReset } = await load();
    await requestPasswordReset("ghost@x.dk");
    expect(mocks.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("kendt email → opretter hashet token + sender mail med rå token i link", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "u1" });
    const { requestPasswordReset } = await load();
    await requestPasswordReset("  A@B.dk ");

    expect(mocks.prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    const created = mocks.prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(created.userId).toBe("u1");
    expect(created.tokenHash).toHaveLength(64); // sha256 hex
    expect(created.expiresAt instanceof Date).toBe(true);

    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const arg = mocks.sendPasswordResetEmail.mock.calls[0][0];
    expect(arg.email).toBe("a@b.dk");
    expect(arg.url).toContain(
      "https://shop.dk/account/reset-password?token=",
    );
    // det rå token i linket må IKKE være lig DB-hashen
    const rawToken = new URL(arg.url).searchParams.get("token");
    expect(rawToken).toBeTruthy();
    expect(rawToken).not.toBe(created.tokenHash);
  });
});

describe("consumePasswordResetToken", () => {
  it("ukendt token → fejl, ingen skrivning", async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue(null);
    const { consumePasswordResetToken } = await load();
    const r = await consumePasswordResetToken("tok", "new-password");
    expect(r.ok).toBe(false);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("udløbet token → fejl", async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });
    const { consumePasswordResetToken } = await load();
    expect((await consumePasswordResetToken("tok", "new-password")).ok).toBe(
      false,
    );
  });

  it("allerede brugt token → fejl", async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 100000),
      usedAt: new Date(),
    });
    const { consumePasswordResetToken } = await load();
    expect((await consumePasswordResetToken("tok", "new-password")).ok).toBe(
      false,
    );
  });

  it("gyldigt token → opdaterer password + markerer token brugt", async () => {
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 100000),
      usedAt: null,
    });
    const { consumePasswordResetToken } = await load();
    const r = await consumePasswordResetToken("tok", "new-strong-password");
    expect(r.ok).toBe(true);
    expect(mocks.prisma.user.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.user.update.mock.calls[0][0].where).toEqual({ id: "u1" });
    expect(
      typeof mocks.prisma.user.update.mock.calls[0][0].data.passwordHash,
    ).toBe("string");
    expect(mocks.prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { usedAt: expect.any(Date) },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
