/**
 * DRØM146-c — the two sign-in mails carry a credential: the magic link and the
 * password-reset link (its raw token; the database holds only a hash). With
 * Resend configured, a send Resend refuses used to be written to
 * `.mail-previews/` on the server instead, so a working login link sat on disk
 * in production and the customer was told to check an inbox nothing reached.
 * Now the refusal reaches the caller and nothing is written. Without Resend
 * (dev) the preview file is written exactly as before.
 *
 * The real lib/mailer.ts, lib/auth.ts provider and lib/auth/password-reset.ts
 * run here; only the Resend adapter, the database and `after()` are stand-ins.
 * The magic-link caller runs through the installed Auth.js `Auth()` itself —
 * the handler POST /api/auth/signin/email reaches — so "a thrown send becomes
 * an error answer, not the verify-request page" is pinned against the version
 * in node_modules, not against a reading of it.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useResend: true,
  resendMagicLink: vi.fn(),
  resendRaw: vi.fn(),
  config: null as null | Record<string, unknown>,
  afterCallbacks: [] as Array<() => unknown>,
  prisma: {
    passwordResetToken: { create: vi.fn() },
    // The account lookup (REG-EMAIL-CASE-b/-c): only KNOWN has an account.
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/mailer/resend", () => ({
  shouldUseResend: async () => mocks.useResend,
  ResendMailer: class {
    sendMagicLink = mocks.resendMagicLink;
    sendRaw = mocks.resendRaw;
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
// Auth.js's email flow needs these three adapter methods (assertConfig).
vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: () => ({
    getUserByEmail: async () => null,
    createVerificationToken: async (t: unknown) => t,
    useVerificationToken: async () => null,
  }),
}));
// The real CredentialsSignin: lib/auth.ts throws its magic-link errors as one.
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  default: (config: Record<string, unknown>) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void mocks.afterCallbacks.push(cb) };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

import "@/lib/auth";
import { MAGIC_LINK_ERROR_CODE, magicLinkErrorMessageKey } from "@/lib/auth/magic-link-errors";
import { sendMagicLinkEmail, sendPasswordResetEmail } from "@/lib/mailer";
import { requestPasswordResetAction } from "@/app/[locale]/account/forgot-password/actions";
import {
  magicLinkPerEmailLimiter,
  magicLinkPerIpLimiter,
  passwordResetPerEmailLimiter,
  passwordResetPerIpLimiter,
} from "@/lib/rate-limit";

const KNOWN = "known@example.com";
const UNKNOWN = "ghost@example.com";
// Held by two accounts in other cases, neither with a password: the rule picks
// none of them, so no link is sent (REG-EMAIL-CASE-c).
const TWIN = "twin@example.com";
const DOWN = new Error("Resend error: domain not verified");
const LINK = {
  email: "buyer@example.com",
  url: "https://shop.test/api/auth/callback/email?token=SECRET-LOGIN-TOKEN",
};

let cwd: string;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useResend = true;
  mocks.resendMagicLink.mockReset().mockRejectedValue(DOWN);
  mocks.resendRaw.mockReset().mockRejectedValue(DOWN);
  mocks.afterCallbacks.length = 0;
  mocks.prisma.passwordResetToken.create.mockReset().mockResolvedValue({});
  mocks.prisma.$queryRaw
    .mockReset()
    .mockImplementation(async (_sql: TemplateStringsArray, ...values: unknown[]) =>
      values.includes(KNOWN)
        ? [{ id: "u1", email: KNOWN, name: "", role: "customer", passwordHash: null }]
        : values.includes(TWIN)
          ? [
              { id: "t1", email: "Twin@example.com", name: "", role: "customer", passwordHash: null },
              { id: "t2", email: "TWIN@example.com", name: "", role: "customer", passwordHash: null },
            ]
          : [],
    );
  process.env.AUTH_SECRET = "test-secret-for-drm146c";
  magicLinkPerEmailLimiter.reset();
  magicLinkPerIpLimiter.reset();
  passwordResetPerEmailLimiter.reset();
  passwordResetPerIpLimiter.reset();
  // PreviewMailer writes under process.cwd(): point it at an empty directory.
  cwd = mkdtempSync(join(tmpdir(), "cw-authmail-"));
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(cwd, { recursive: true, force: true });
});

const previews = () => {
  const dir = join(cwd, ".mail-previews");
  return existsSync(dir) ? readdirSync(dir) : [];
};
const logged = () => consoleError.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

describe("Resend configured and failing: the sign-in mails reject and write nothing", () => {
  it("the magic link rejects with Resend's error, writes no preview file, logs no link", async () => {
    await expect(sendMagicLinkEmail(LINK)).rejects.toBe(DOWN);
    expect(mocks.resendMagicLink).toHaveBeenCalledExactlyOnceWith(LINK);
    expect(previews()).toEqual([]);
    expect(logged()).toContain("Resend magic-link send failed");
    expect(logged()).not.toContain("SECRET-LOGIN-TOKEN");
  });

  it("the password reset rejects with Resend's error, writes no preview file, logs no link", async () => {
    const reset = { email: KNOWN, url: "https://shop.test/account/reset-password?token=SECRET-RESET" };
    await expect(sendPasswordResetEmail(reset)).rejects.toBe(DOWN);
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);
    expect(mocks.resendRaw.mock.calls[0][0].to).toBe(KNOWN);
    expect(previews()).toEqual([]);
    expect(logged()).toContain("Resend password-reset send failed");
    expect(logged()).not.toContain("SECRET-RESET");
  });
});

describe("no Resend (dev): the preview file, exactly as before", () => {
  it("both sign-in mails land in .mail-previews/ with their link, and resolve", async () => {
    mocks.useResend = false;
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => ++now);
    await sendMagicLinkEmail(LINK);
    await sendPasswordResetEmail({ email: KNOWN, url: "https://shop.test/account/reset-password?token=DEV" });

    const files = previews().sort();
    expect(files).toHaveLength(2);
    const bodies = files.map((f) => readFileSync(join(cwd, ".mail-previews", f), "utf8")).join("\n");
    expect(bodies).toContain("SECRET-LOGIN-TOKEN");
    expect(bodies).toContain("token=DEV");
    expect(mocks.resendMagicLink).not.toHaveBeenCalled();
    expect(mocks.resendRaw).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The magic-link caller: Auth.js's own handler, with lib/auth.ts's provider.
// ---------------------------------------------------------------------------

/** The @auth/core next-auth is installed with — npm's or pnpm's layout alike. */
const authCoreDir = path.dirname(
  createRequire(path.join(realpathSync(path.resolve("node_modules/next-auth")), "package.json")).resolve(
    "@auth/core",
  ),
);
type AuthFn = (request: Request, config: Record<string, unknown>) => Promise<Response>;
const ORIGIN = "https://shop.test";

/**
 * What the login form's `signIn("email", { redirect: false })` does
 * (next-auth/react.js): fetch a CSRF token, POST the address with
 * `X-Auth-Return-Redirect`, and read `error` and `code` off the URL Auth.js
 * answers with. MagicLinkForm shows its error state for any `error` — the
 * message `magicLinkErrorMessageKey` picks from the two — and "check your
 * inbox" only without one.
 *
 * `quiet`: the per-address limit throws before the send awaits anything, and
 * Auth.js holds that rejected send unobserved across its `await createHash`
 * before `Promise.all` takes it — an unhandled rejection in Auth.js itself
 * (magic-link-account-case.test.ts, `quiet`). Observing it at once changes
 * nothing else: `Promise.all` still rejects with it.
 */
async function signInWithEmail(
  email: string,
  quiet = false,
): Promise<{ url: string; error: string | null; code: string | null; message: string | null }> {
  const { Auth } = (await import(pathToFileURL(path.join(authCoreDir, "index.js")).href)) as {
    Auth: AuthFn;
  };
  const providers = (mocks.config!.providers as Array<Record<string, unknown>>).map((provider) => {
    if (!quiet || provider.id !== "email") return provider;
    const send = provider.sendVerificationRequest as (params: unknown) => Promise<void>;
    return {
      ...provider,
      sendVerificationRequest(params: unknown) {
        const sent = send(params);
        sent.catch(() => {});
        return sent;
      },
    };
  });
  const config = {
    ...mocks.config,
    providers,
    secret: "test-auth-secret-drm146c",
    basePath: "/api/auth",
    trustHost: true,
    logger: { error: () => {}, warn: () => {}, debug: () => {} },
  };
  const csrfRes = await Auth(new Request(`${ORIGIN}/api/auth/csrf`), config);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const cookie = csrfRes.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  const res = await Auth(
    new Request(`${ORIGIN}/api/auth/signin/email`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-auth-return-redirect": "1",
        cookie,
      },
      body: new URLSearchParams({ email, csrfToken, callbackUrl: `${ORIGIN}/en/account` }),
    }),
    config,
  );
  const { url } = (await res.json()) as { url: string };
  const params = new URL(url).searchParams;
  const error = params.get("error");
  const code = params.get("code");
  return { url, error, code, message: error ? magicLinkErrorMessageKey({ error, code }) : null };
}

describe("the magic-link caller (Auth.js signin/email)", () => {
  it("a refused send answers with an error, not the verify-request page, and writes no file", async () => {
    // Resend answers over the network, so its refusal arrives after Auth.js
    // has hashed the token and joined the send in `Promise.all`. A refusal in
    // the same tick would sit unobserved across that `await createHash`
    // (send-token.js) and be reported as an unhandled rejection — a property
    // of Auth.js, not of this path (magic-link-account-case.test.ts, `quiet`).
    mocks.resendMagicLink.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(DOWN), 5)),
    );
    const { url, error, code, message } = await signInWithEmail(KNOWN);
    expect(mocks.resendMagicLink).toHaveBeenCalledTimes(1);
    expect(error).toBe("CredentialsSignin");
    expect(code).toBe(MAGIC_LINK_ERROR_CODE.sendFailed);
    // "We could not send the link", not "something went wrong" (DRØM146-d).
    expect(message).toBe("magicSendFailed");
    expect(url).not.toContain("verify-request");
    expect(previews()).toEqual([]);
  });

  it("the per-address limit answers with its own code, the same for an address with an account and one without", async () => {
    // DRØM146-d: the form looked for "rate" in `result.error`, but Auth.js
    // only ever put "Configuration" there, so a throttle read as an outage.
    mocks.resendMagicLink.mockResolvedValue(undefined);
    const answers: Record<string, Awaited<ReturnType<typeof signInWithEmail>>> = {};
    for (const email of [KNOWN, UNKNOWN]) {
      for (let i = 0; i < 3; i++) expect((await signInWithEmail(email)).error).toBeNull();
      answers[email] = await signInWithEmail(email, true);
    }
    expect(mocks.resendMagicLink).toHaveBeenCalledTimes(6);
    const { url, ...known } = answers[KNOWN];
    const { url: unknownUrl, ...unknown } = answers[UNKNOWN];
    expect(known).toEqual({
      error: "CredentialsSignin",
      code: MAGIC_LINK_ERROR_CODE.rateLimited,
      message: "magicTooManyRequests",
    });
    expect(unknown).toEqual(known);
    expect(url).toBe(unknownUrl);
    // The server's message stays on the server.
    expect(url).not.toMatch(/too many/i);
  });

  it("an address several case-variant accounts hold is still answered as sent during an outage (documented, not fixed)", async () => {
    // No link goes out for it (REG-EMAIL-CASE-c), so nothing reaches the
    // provider and nothing can fail. Making this answer match the outage
    // would need to know the provider is down without sending; see the
    // comment at the `!target` branch in lib/auth.ts.
    const { url, error } = await signInWithEmail(TWIN);
    expect(mocks.resendMagicLink).not.toHaveBeenCalled();
    expect(error).toBeNull();
    expect(url).toContain("/api/auth/verify-request");
  });

  it("a send Resend accepts still answers with the verify-request page", async () => {
    mocks.resendMagicLink.mockResolvedValue(undefined);
    const { url, error } = await signInWithEmail(KNOWN);
    expect(error).toBeNull();
    expect(url).toContain("/api/auth/verify-request");
    expect(previews()).toEqual([]);
  });
});

describe("magicLinkErrorMessageKey", () => {
  it("names the throttle and the refused send by their code, and anything else generically", () => {
    expect(
      magicLinkErrorMessageKey({ error: "CredentialsSignin", code: MAGIC_LINK_ERROR_CODE.rateLimited }),
    ).toBe("magicTooManyRequests");
    expect(
      magicLinkErrorMessageKey({ error: "CredentialsSignin", code: MAGIC_LINK_ERROR_CODE.sendFailed }),
    ).toBe("magicSendFailed");
    // A database outage, a malformed address, a bug: Auth.js's catch-all.
    expect(magicLinkErrorMessageKey({ error: "Configuration" })).toBe("magicGenericError");
    expect(magicLinkErrorMessageKey({ error: "CredentialsSignin", code: "credentials" })).toBe(
      "magicGenericError",
    );
  });
});

// ---------------------------------------------------------------------------
// The password-reset caller: the public answer says nothing about the send.
// ---------------------------------------------------------------------------

function form(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

async function forgot(email: string) {
  const answer = await requestPasswordResetAction({ status: "idle" }, form(email));
  for (const cb of mocks.afterCallbacks.splice(0)) await cb();
  return answer;
}

describe("the password-reset caller (forgot-password action)", () => {
  it("the answer is identical for an account that exists, one that does not, and a refused send", async () => {
    mocks.resendRaw.mockResolvedValue(undefined);
    const exists = await forgot(KNOWN);
    const missing = await forgot(UNKNOWN);
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();

    passwordResetPerEmailLimiter.reset();
    mocks.resendRaw.mockReset().mockRejectedValue(DOWN);
    const failed = await forgot(KNOWN);
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);

    expect(missing).toEqual(exists);
    expect(failed).toEqual(exists);
    expect(exists).toEqual({ status: "sent", message: "forgotActions_sentMessage" });
  });

  it("a refused send is logged on the server without the reset token, and writes no file", async () => {
    await forgot(KNOWN);
    expect(mocks.resendRaw).toHaveBeenCalledTimes(1);
    const sentUrl = new URL(
      String(mocks.resendRaw.mock.calls[0][0].text).match(/https:\/\/\S+/)![0],
    );
    const token = sentUrl.searchParams.get("token")!;
    expect(token.length).toBeGreaterThan(20);

    expect(logged()).toContain("[password-reset] request failed");
    expect(logged()).not.toContain(token);
    expect(previews()).toEqual([]);
  });
});
