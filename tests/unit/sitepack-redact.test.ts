import { describe, expect, it } from "vitest";

import {
  redactBranding,
  RedactedBrandingSchema,
  integrationStub,
  IntegrationStubSchema,
} from "@/lib/sitepack/redact";
import {
  SitePackManifestSchema,
  SITEPACK_SCHEMA,
  CONTENT_SCHEMA_VERSION,
  SECTION_SPEC_VERSIONS,
} from "@/lib/sitepack/spec";

/**
 * SitePack redaction — the security-critical red-team. A SitePack must NEVER
 * carry a credential or account-specific secret, even if a future schema change
 * adds a new secret field (the positive-allowlist design makes that structurally
 * impossible). No DB — pure functions over seeded rows.
 */

// Every secret / forbidden field across IntegrationSettings + BrandingSettings,
// each seeded with a UNIQUE sentinel value so a leak is unmistakable. Includes
// id/updatedAt + every account-id + operational cache/timestamp — so a future
// allowlist regression that lets one through is CAUGHT by the test.
const FORBIDDEN_INTEGRATION = [
  "anthropicApiKey", "googleGeminiApiKey", "stripeSecretKey", "stripePublishableKey",
  "stripeWebhookSecret", "resendApiKey", "videoGenerationApiKey", "phoneIncWorkspaceId",
  "phoneIncApiKey", "vercelToken", "vercelProjectId", "vibeApiKey", "v0ApiKey",
  "v0DefaultDesignSystemId", "googleOAuthClientId", "googleOAuthClientSecret",
  "driveFolderId", "driveBackupFolderId", "sheetsSpreadsheetId", "aiUsageJson",
  "v0UsageJson", "voiceShopLastDailyUsageJson", "sheetsLastSyncResultJson",
  "fxRatesJson", "setupChecklist", "localAiEndpoint", "lastDegradedAt",
  "lastModelDetectedAt", "sheetsLastSyncAt", "id", "updatedAt",
];
const FORBIDDEN_BRANDING = [
  "domain", "emailFrom", "emailFromName", "emailSupport", "emailAdmin",
  "setupComplete", "agenticPolicyJson", "heroImageAssetId", "ecommerceEnabled",
  "id", "updatedAt",
];
// Look blobs the EMBEDDED composition owns — must NOT be double-carried here
// (single source of truth; ultraplan §3.4).
const COMPOSITION_OWNED = ["themeJson", "chromeJson", "threeDConfigJson"];

function seedRow(forbidden: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = { ...extra };
  for (const k of forbidden) row[k] = `SECRET_${k}_VALUE`;
  return row;
}

// Robust leak check: the field is absent as an output KEY (exact match — avoids
// false positives on short names like "id"), AND its unique sentinel VALUE never
// appears anywhere in the serialized output.
function assertNoLeak(out: Record<string, unknown>, forbidden: string[]) {
  const keys = Object.keys(out);
  const blob = JSON.stringify(out);
  for (const k of forbidden) {
    expect(keys, `leaked field as key: ${k}`).not.toContain(k);
    expect(blob, `leaked value of ${k}`).not.toContain(`SECRET_${k}_VALUE`);
  }
}

describe("integrationStub — red-team", () => {
  it("carries the non-secret posture but leaks NO secret value or field name", () => {
    const row = seedRow(FORBIDDEN_INTEGRATION, {
      aiProvider: "anthropic",
      anthropicModel: "claude-haiku-4-5",
      localAiModel: "gemma:7b",
      voiceShopEnabled: true,
      voiceShopVoice: "Puck",
      videoGenProvider: "luma",
    });
    const stub = integrationStub(row) as Record<string, unknown>;
    assertNoLeak(stub, FORBIDDEN_INTEGRATION);
    // ...while the non-secret posture DID survive.
    expect(stub.aiProvider).toBe("anthropic");
    expect(stub.anthropicModel).toBe("claude-haiku-4-5");
    expect(stub.localAiModel).toBe("gemma:7b");
    expect(stub.voiceShopEnabled).toBe(true);
    expect(stub.voiceShopVoice).toBe("Puck");
    expect(IntegrationStubSchema.parse(stub)).toBeTruthy();
  });

  it("an UNKNOWN future secret field can never appear (allowlist, not omission)", () => {
    const stub = integrationStub({ aiProvider: "local", someFutureSecretKeyV9: "SECRET_NEW" }) as Record<string, unknown>;
    const blob = JSON.stringify(stub);
    expect(blob).not.toContain("someFutureSecretKeyV9");
    expect(blob).not.toContain("SECRET_NEW");
  });
});

describe("redactBranding — red-team", () => {
  it("carries identity/look but leaks NO PII/identity-forbidden field", () => {
    const row = seedRow(FORBIDDEN_BRANDING, {
      storeName: "Aluzaun",
      tagline: "Danish aluminium fences",
      designSlug: "aurora-shop",
      genomeJson: '{"identity":{"tone":"premium"}}',
      layoutJson: '{"sections":[]}',
    });
    const redacted = redactBranding(row) as Record<string, unknown>;
    assertNoLeak(redacted, FORBIDDEN_BRANDING);
    // ...while the non-look identity DID survive.
    expect(redacted.storeName).toBe("Aluzaun");
    expect(redacted.designSlug).toBe("aurora-shop");
    expect((redacted.genomeJson as string)).toContain("premium");
    expect(redacted.layoutJson).toBe('{"sections":[]}');
    expect(RedactedBrandingSchema.parse(redacted)).toBeTruthy();
  });

  it("does NOT double-carry the look blobs owned by the embedded composition", () => {
    const redacted = redactBranding(seedRow(COMPOSITION_OWNED, { storeName: "X" })) as Record<string, unknown>;
    assertNoLeak(redacted, COMPOSITION_OWNED); // themeJson/chromeJson/threeDConfigJson live in the composition `look`
  });

  it("ecommerceEnabled (identity) never travels in the branding blob — it rides manifest.mode", () => {
    expect(Object.keys(redactBranding({ storeName: "X", ecommerceEnabled: true }))).not.toContain("ecommerceEnabled");
  });
});

describe("SitePackManifestSchema", () => {
  const goodManifest = {
    schema: SITEPACK_SCHEMA,
    containerSchemaVersion: 1,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    id: "01J8ABCDEF",
    name: "Aluzaun — Danish aluminium fences",
    createdAt: "2026-06-14T00:00:00Z",
    exporter: { engine: "cartwright", version: "0.0.0-source", channel: "source", commit: "", gitRef: "main" },
    compat: { minEngineContentSchema: 1, sectionSpecVersions: { ...SECTION_SPEC_VERSIONS } },
    mode: "webshop",
    defaultLocale: "da",
    locales: ["da", "en"],
    designRef: { slug: "aurora-shop", kind: "data", version: "1.0.0" },
    pluginsRequired: ["three-scenes"],
    featuresRequested: ["webshop", "reviews"],
    featuresRequired: ["webshop"],
    containsCode: false,
    counts: { pages: 8, products: 124 },
    uncompressedBytes: 73400320,
    integrity: { algo: "sha256", files: { "content/pages.ndjson": "sha256-x" }, merkleRoot: "sha256-root" },
    license: "proprietary",
    author: { handle: "@aluzaun", keyId: "ed25519:9f3c" },
  };

  it("accepts a well-formed manifest", () => {
    expect(SitePackManifestSchema.parse(goodManifest).mode).toBe("webshop");
  });

  it("defaults containsCode to false when omitted", () => {
    const { containsCode: _omit, ...without } = goodManifest;
    expect(SitePackManifestSchema.parse(without).containsCode).toBe(false);
  });

  it("rejects a wrong schema literal (a non-SitePack tarball)", () => {
    expect(() => SitePackManifestSchema.parse({ ...goodManifest, schema: "something-else" })).toThrow();
  });

  it("rejects an invalid mode (identity must be one of the three)", () => {
    expect(() => SitePackManifestSchema.parse({ ...goodManifest, mode: "blog" })).toThrow();
  });

  it("rejects a defaultLocale that is not in locales (internally inconsistent)", () => {
    expect(() => SitePackManifestSchema.parse({ ...goodManifest, defaultLocale: "de" })).toThrow(/defaultLocale/);
  });

  it("rejects a sectionSpecVersions map missing a known section key", () => {
    const { genome: _drop, ...partial } = SECTION_SPEC_VERSIONS;
    expect(() =>
      SitePackManifestSchema.parse({ ...goodManifest, compat: { minEngineContentSchema: 1, sectionSpecVersions: partial } }),
    ).toThrow(/sectionSpecVersions/);
  });

  it("rejects a missing required field", () => {
    const { contentSchemaVersion: _omit, ...missing } = goodManifest;
    expect(() => SitePackManifestSchema.parse(missing)).toThrow();
  });
});
