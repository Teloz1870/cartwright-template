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

  it("manual items read from setupChecklist JSON blob", async () => {
    mockIntegrationSettings({
      setupChecklist: JSON.stringify(["cookie-banner", "trustpilot"]),
    });

    const status = await getSetupStatus();

    expect(findItem(status, "cookie-banner").status).toBe("ok");
    expect(findItem(status, "trustpilot").status).toBe("ok");
    expect(findItem(status, "data-processing-agreements").status).toBe("missing");
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
