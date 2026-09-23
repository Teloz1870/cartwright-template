import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/admin/integrations` must not under-report production.
 *
 * `getResendStatus()` read ONLY the encrypted DB row, while the runtime reader
 * `lib/mailer/resend.ts` falls back to `process.env.RESEND_API_KEY`. So a shop
 * that set the key in Vercel's environment — a completely normal deployment —
 * saw "Preview mode — mails are written to .mail-previews/" in the admin while
 * real emails were demonstrably going out.
 *
 * That matters more than a cosmetic badge. This is the surface an operator is
 * pointed at to answer "what is actually configured in production", and it is
 * the surface a downstream fork was pointed at while debugging mail. It told
 * them the key was missing; they issued a new one that fixed nothing.
 *
 * `getIntegrationStatus()` and `getGoogleOAuthStatus()` already had the shape:
 * `isSet` counts either source, `preview` stays DB-only (a masked env key would
 * read as "stored here" and invite an operator to clear it), and `envFallback`
 * is the separate signal. Resend now matches.
 */

const mocks = vi.hoisted(() => ({
  row: null as { resendApiKey: string | null } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ id: "admin" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/db", () => ({
  prisma: { integrationSettings: { findUnique: async () => mocks.row } },
}));
vi.mock("@/lib/secret-encryption", () => ({
  decryptSecret: (v: string) => `decrypted:${v}`,
  encryptSecret: (v: string) => `encrypted:${v}`,
}));

const ENV_KEY = "re_env_0123456789abcdefghij";

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.row = null;
  delete process.env.RESEND_API_KEY;
});

describe("getResendStatus — env fallback", () => {
  it("reports configured when the key lives ONLY in the environment", async () => {
    process.env.RESEND_API_KEY = ENV_KEY;

    const { getResendStatus } = await import("@/app/admin/integrations/actions");
    const status = await getResendStatus();

    expect(status.isSet).toBe(true);
    expect(status.envFallback).toBe(true);
  });

  it("does not present the env key as a stored value", async () => {
    // A masked env key in `preview` would read as "saved here" and invite the
    // operator to clear it — which would not remove it.
    process.env.RESEND_API_KEY = ENV_KEY;

    const { getResendStatus } = await import("@/app/admin/integrations/actions");

    expect((await getResendStatus()).preview).toBeNull();
  });

  it("a stored key still wins and is NOT flagged as env fallback", async () => {
    mocks.row = { resendApiKey: "cipher" };
    process.env.RESEND_API_KEY = ENV_KEY;

    const { getResendStatus } = await import("@/app/admin/integrations/actions");
    const status = await getResendStatus();

    expect(status.isSet).toBe(true);
    expect(status.envFallback).toBe(false);
    expect(status.preview).toBeTruthy();
  });

  it("reports NOT configured when neither source has a key", async () => {
    const { getResendStatus } = await import("@/app/admin/integrations/actions");
    const status = await getResendStatus();

    expect(status.isSet).toBe(false);
    expect(status.envFallback).toBe(false);
    expect(status.preview).toBeNull();
  });

  it("an empty env var is not a key", async () => {
    // `RESEND_API_KEY=""` is the most common Vercel mis-entry; `??` would have
    // accepted it. The runtime reader would then send nothing while the admin
    // claimed configured.
    process.env.RESEND_API_KEY = "   ";

    const { getResendStatus } = await import("@/app/admin/integrations/actions");
    const status = await getResendStatus();

    expect(status.isSet).toBe(false);
    expect(status.envFallback).toBe(false);
  });
});
