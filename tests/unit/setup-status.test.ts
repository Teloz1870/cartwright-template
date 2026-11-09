import { beforeEach, describe, expect, it, vi } from "vitest";

type IntegrationSettingsSelect = {
  setupChecklist?: boolean;
  stripeSecretKey?: boolean;
  stripePublishableKey?: boolean;
  stripeWebhookSecret?: boolean;
  resendApiKey?: boolean;
  anthropicApiKey?: boolean;
  googleGeminiApiKey?: boolean;
};

const mocks = vi.hoisted(() => ({
  integrationSettingsFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    integrationSettings: {
      findUnique: mocks.integrationSettingsFindUnique,
    },
  },
}));

vi.mock("@/lib/secret-encryption", () => ({
  decryptSecret: (value: string) => value,
}));

import { invalidateApiKeyCache } from "@/lib/ai/client";
import { invalidateGeminiKeyCache } from "@/lib/ai/gemini";
import { invalidateResendKeyCache } from "@/lib/mailer/resend";
import { invalidateSetupStatusCache, getSetupStatus } from "@/lib/setup-status";
import { invalidateStripeKeysCache } from "@/lib/stripe";

function mockIntegrationSettings(row: Record<string, string | null>) {
  mocks.integrationSettingsFindUnique.mockImplementation(
    ({ select }: { select: IntegrationSettingsSelect }) => {
      const selected = Object.fromEntries(
        Object.keys(select).map((key) => [key, row[key] ?? null]),
      );
      return Promise.resolve(selected);
    },
  );
}

function findItem(
  status: Awaited<ReturnType<typeof getSetupStatus>>,
  id: string,
) {
  const item = status.items.find((candidate) => candidate.id === id);
  expect(item, `Missing setup item ${id}`).toBeDefined();
  return item!;
}

describe("getSetupStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    invalidateSetupStatusCache();
    invalidateStripeKeysCache();
    invalidateResendKeyCache();
    invalidateApiKeyCache();
    invalidateGeminiKeyCache();
    mockIntegrationSettings({});
  });

  it("returns items, required totals, ok count, pct complete, and missing flag", async () => {
    const status = await getSetupStatus();

    expect(status.items.length).toBeGreaterThan(0);
    expect(status.totalRequired).toBeGreaterThan(0);
    expect(status.okCount).toBeGreaterThanOrEqual(0);
    expect(status.pctComplete).toBe(
      Math.round((status.okCount / status.totalRequired) * 100),
    );
    expect(status.hasMissing).toBe(true);
  });

  it("auto-detects ok status when DB keys are set", async () => {
    mockIntegrationSettings({
      stripeSecretKey: "sk_live_test",
      stripePublishableKey: "pk_live_test",
      stripeWebhookSecret: "whsec_test",
      resendApiKey: "re_test",
      anthropicApiKey: "sk-ant-test",
      googleGeminiApiKey: "AIza-test",
    });

    const status = await getSetupStatus();

    expect(findItem(status, "stripe-keys").status).toBe("ok");
    expect(findItem(status, "stripe-webhook-endpoint").status).toBe("ok");
    expect(findItem(status, "resend-api-key").status).toBe("ok");
    expect(findItem(status, "anthropic-api-key").status).toBe("ok");
    expect(findItem(status, "google-gemini-api-key").status).toBe("ok");
  });

  it("auto-detects missing status when DB keys are null", async () => {
    mockIntegrationSettings({
      stripeSecretKey: null,
      stripePublishableKey: null,
      stripeWebhookSecret: null,
      resendApiKey: null,
      anthropicApiKey: null,
      googleGeminiApiKey: null,
    });

    const status = await getSetupStatus();

    expect(findItem(status, "stripe-keys").status).toBe("missing");
    expect(findItem(status, "stripe-webhook-endpoint").status).toBe("missing");
    expect(findItem(status, "resend-api-key").status).toBe("missing");
    expect(findItem(status, "anthropic-api-key").status).toBe("missing");
    expect(findItem(status, "google-gemini-api-key").status).toBe("warning");
  });

  it("env-only items work via process.env mock", async () => {
    vi.stubEnv("SENTRY_DSN", "https://sentry.example/1");
    vi.stubEnv("CRON_SECRET", "cron-secret-test");

    const status = await getSetupStatus();

    expect(findItem(status, "sentry-dsn").status).toBe("ok");
    expect(findItem(status, "cron-secret").status).toBe("ok");
  });

  it("says plainly that cron jobs are refused on a production deploy without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "production");

    const item = findItem(await getSetupStatus(), "cron-secret");

    expect(item.status).toBe("missing");
    expect(item.description).toContain("every call to the scheduled jobs under /api/cron is refused");
    expect(item.description).not.toContain("next release");
    expect(item.description).not.toContain("anyone can run");
  });

  it("does not call a CRON_SECRET of only whitespace configured (CRON-AUTH-d)", async () => {
    vi.stubEnv("CRON_SECRET", " \t\n");
    vi.stubEnv("VERCEL_ENV", "production");

    const item = findItem(await getSetupStatus(), "cron-secret");

    expect(item.status).toBe("missing");
    expect(item.description).toContain("every call to the scheduled jobs under /api/cron is refused");
  });

  it("keeps the calmer CRON_SECRET wording outside production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");

    const item = findItem(await getSetupStatus(), "cron-secret");

    expect(item.status).toBe("missing");
    expect(item.description).not.toContain("this production deploy");
    expect(item.description).toContain("A production deploy refuses them until it is set");
  });

  // BACKUP-CRON-500: the nightly backup needs a PRIVATE Blob store; the media
  // token alone usually points at a public one, which refuses a backup.
  it("shows backup storage as missing when no Blob token is set", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");

    const item = findItem(await getSetupStatus(), "backup-storage");

    expect(item.status).toBe("missing");
    expect(item.category).toBe("cron");
    expect(item.description).toContain("not configured");
    expect(item.description).toContain("BACKUP_BLOB_READ_WRITE_TOKEN");
  });

  it("warns when backups fall back to the media store's BLOB_READ_WRITE_TOKEN", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_media_token");

    const item = findItem(await getSetupStatus(), "backup-storage");

    expect(item.status).toBe("warning");
    expect(item.description).toContain("BLOB_READ_WRITE_TOKEN");
    expect(item.description).toContain("private");
    expect(item.description).not.toContain("vercel_blob_rw_media_token");
  });

  it("shows backup storage as ok once BACKUP_BLOB_READ_WRITE_TOKEN is set", async () => {
    vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_backup_token");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_media_token");

    const item = findItem(await getSetupStatus(), "backup-storage");

    expect(item.status).toBe("ok");
    expect(item.description).not.toContain("vercel_blob_rw_backup_token");
    // A set variable is all the engine can see: not that the store is private,
    // nor that last night's upload landed.
    expect(item.description).toContain("BACKUP_BLOB_READ_WRITE_TOKEN is set");
    expect(item.description).toContain("cannot see whether that store is private");
    expect(item.description).not.toMatch(/uploads to the private/);
  });

  it("links our backup runbook, never Vercel's procedure, which connects the store", async () => {
    // Vercel's private-storage page creates the store from the linked project
    // with --yes, or connects it for OIDC: default BLOB_* names, Preview ticked.
    const runbook = "https://cartwright.app/docs/deployment/backup-restore#scheduled";
    for (const [backup, media, status] of [
      ["", "", "missing"],
      ["", "vercel_blob_rw_media_token", "warning"],
      ["vercel_blob_rw_backup_token", "", "ok"],
    ] as const) {
      vi.stubEnv("BACKUP_BLOB_READ_WRITE_TOKEN", backup);
      vi.stubEnv("BLOB_READ_WRITE_TOKEN", media);
      invalidateSetupStatusCache();

      const item = findItem(await getSetupStatus(), "backup-storage");

      expect(item.status).toBe(status);
      expect(item.helpUrl, status).toBe(runbook);
      if (status !== "ok") expect(item.description, status).toContain("do not connect it to the project");
    }
  });

  it("manual items read from setupChecklist JSON blob", async () => {
    mockIntegrationSettings({
      setupChecklist: JSON.stringify(["data-processing-agreements", "trustpilot"]),
    });

    const status = await getSetupStatus();

    // data-processing-agreements + trustpilot are blob-driven manual items.
    // cookie-banner moved to auto-detection (consentBanner flag, default off →
    // "missing") so it's no longer toggled via the checklist blob.
    expect(findItem(status, "data-processing-agreements").status).toBe("ok");
    expect(findItem(status, "trustpilot").status).toBe("ok");
    expect(findItem(status, "cookie-banner").status).toBe("missing");
    expect(findItem(status, "emaerket").status).toBe("missing");
  });

  it("pctComplete is rounded from okCount / totalRequired", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");

    const status = await getSetupStatus();

    expect(status.pctComplete).toBe(
      Math.round((status.okCount / status.totalRequired) * 100),
    );
  });
});
