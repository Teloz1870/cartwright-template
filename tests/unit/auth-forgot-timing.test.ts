import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AUTH-FORGOT-TIMING: the forgot-password form must not say with its response
 * time who is a customer. The action used to await the reset inline, so a
 * known address paid a token insert and the mail send before the uniform
 * answer while an unknown one returned straight after the lookup.
 *
 * What these tests pin is not a duration (wall-clock is flaky) but the SHAPE:
 * when the action resolves, nothing has touched the database or the mailer,
 * for a known and an unknown address alike — the work is one `after()`
 * callback. `after` is stubbed to collect callbacks so a test can run them
 * once the "response" is in hand. Prisma, the mailer, headers and translations
 * are mocked; the limiters are real.
 */

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown>,
  afterThrows: false,
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: { create: vi.fn() },
  },
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      if (mocks.afterThrows) throw new Error("`after` called outside a request scope");
      mocks.afterCallbacks.push(cb);
    },
  };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/mailer", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));
vi.mock("@/brand.config", () => ({ brand: { url: "https://shop.example" } }));

import { requestPasswordResetAction } from "@/app/[locale]/account/forgot-password/actions";
import { schedulePasswordReset } from "@/lib/auth/password-reset";
import {
  passwordResetPerEmailLimiter,
  passwordResetPerIpLimiter,
} from "@/lib/rate-limit";

const KNOWN = "known@example.com";
const UNKNOWN = "ghost@example.com";

function form(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

async function flushAfter(): Promise<void> {
  const pending = mocks.afterCallbacks.splice(0);
  for (const cb of pending) await cb();
}

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-reset";
  mocks.afterCallbacks.length = 0;
  mocks.afterThrows = false;
  passwordResetPerEmailLimiter.reset();
  passwordResetPerIpLimiter.reset();
  mocks.prisma.user.findUnique
    .mockReset()
    .mockImplementation(async ({ where }: { where: { email: string } }) =>
      where.email === KNOWN ? { id: "u1" } : null,
    );
  mocks.prisma.passwordResetToken.create.mockReset().mockResolvedValue({});
  mocks.sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
});

describe("forgot password — a known and an unknown address take the same path to the answer", () => {
  it.each([KNOWN, UNKNOWN])(
    "%s: the answer comes back before any lookup, token or mail, with one reset scheduled",
    async (email) => {
      const res = await requestPasswordResetAction({ status: "idle" }, form(email));

      expect(res).toEqual({ status: "sent", message: "forgotActions_sentMessage" });
      expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
      expect(mocks.prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mocks.afterCallbacks).toHaveLength(1);
    },
  );

  it("after the answer, a known address gets its token and mail and an unknown one gets nothing", async () => {
    await requestPasswordResetAction({ status: "idle" }, form(KNOWN));
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
    await flushAfter();
    expect(mocks.prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendPasswordResetEmail.mock.calls[0][0].email).toBe(KNOWN);

    mocks.prisma.passwordResetToken.create.mockClear();
    mocks.sendPasswordResetEmail.mockClear();

    await requestPasswordResetAction({ status: "idle" }, form(UNKNOWN));
    await flushAfter();
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("a failing mail send is logged after the answer and never reaches it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendPasswordResetEmail.mockRejectedValue(new Error("resend down"));

    const res = await requestPasswordResetAction({ status: "idle" }, form(KNOWN));
    expect(res.status).toBe("sent");
    expect(err).not.toHaveBeenCalled();

    await expect(flushAfter()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith("[password-reset] request failed:", expect.any(Error));
    err.mockRestore();
  });

  it("the fourth request for one address is throttled: the same answer, and nothing more scheduled", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await requestPasswordResetAction({ status: "idle" }, form(KNOWN));
      expect(res).toEqual({ status: "sent", message: "forgotActions_sentMessage" });
    }
    expect(mocks.afterCallbacks).toHaveLength(3);
  });
});

describe("schedulePasswordReset — outside a request scope", () => {
  it("falls back to a loose promise, so a script still sends the mail", async () => {
    mocks.afterThrows = true;
    schedulePasswordReset(KNOWN);
    await vi.waitFor(() => expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1));
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});
