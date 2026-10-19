import { z } from "zod";

/**
 * SitePack redaction — POSITIVE allowlists, by construction (ultraplan §3.4).
 *
 * The #1 security rule for SitePack: an exporter is NEVER a `findMany()` dump
 * with field omission (one forgotten field = a leaked Stripe key). Instead these
 * serializers BUILD the output from an explicit allowlist of keys — the output
 * shape has no slot a secret could occupy. `IntegrationSettings` is wall-to-wall
 * secrets (anthropicApiKey, stripeSecretKey, resendApiKey, vercelToken, v0ApiKey,
 * googleOAuthClientSecret, phoneIncApiKey, …); the stub below carries only the
 * non-secret provider/model/feature-TOGGLE shape, so a restore knows "this site
 * used the anthropic provider, voiceShop was on" WITHOUT any credential.
 *
 * Defense in depth: import re-applies the same allowlist (never trust the
 * exporter), and the registry runs a secret-shaped-regex scan at publish. The
 * red-team test (tests/unit/sitepack-redact.test.ts) seeds every secret field
 * and asserts no secret value OR field name appears in any output byte.
 *
 * Pure: no DB, no I/O, no server-only. Inputs are permissive (the whole DB row,
 * secrets and all); outputs are typed + allowlist-shaped.
 */

// Permissive input — the full row, so the allowlist (not the caller) decides what
// survives. `unknown` values are read by name and copied only if allowlisted.
type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ── BrandingSettings → redacted NON-LOOK identity copy ────────────────────────
//
// SINGLE SOURCE OF TRUTH (ultraplan §3.4): the embedded `look` (a verbatim
// composition) OWNS palette/chrome/scene/homepage-layout — so `themeJson`,
// `chromeJson` and `threeDConfigJson` are deliberately NOT carried here (the
// composition's palette/chrome/scene own them, restored via applyComposition).
// This blob carries only what the composition does NOT:
//   - identity copy (storeName/tagline/announcement/headline/cta) + logo/favicon
//   - `genomeJson` AUTHORITATIVE full genome incl. the RESOLVED CACHE that the
//     composition's `voice` drops (composition.voice is a derived subset;
//     branding.genomeJson wins on restore — deterministic re-render, no LLM)
//   - `layoutJson` = the BrandingSettings-level builder layout (distinct from a
//     home Page's layoutJson, which travels as that page's content row)
//   - cosmetic runtime flags (featureOverridesJson re-validated on import; SEO)
// OUT, never carried: domain, email* (reconnect in setup), setupComplete (forced
//   false), heroImageAssetId (FK → media-layer remap), agenticPolicyJson,
//   id/updatedAt. `ecommerceEnabled` is IDENTITY → rides manifest.mode + the mode
//   hard-gate, never a free field that could flip a website into a webshop.

export const RedactedBrandingSchema = z.object({
  storeName: z.string().nullable(),
  tagline: z.string().nullable(),
  announcement: z.string().nullable(),
  websiteHeadline: z.string().nullable(),
  heroCta: z.string().nullable(),
  heroImage: z.string().nullable(), // media ref; the media layer remaps it to a fresh Blob asset URL on restore
  designSlug: z.string().nullable(),
  industryTemplate: z.string().nullable(),
  genomeJson: z.string().nullable(),
  layoutJson: z.string().nullable(),
  featureOverridesJson: z.string().nullable(), // re-validated vs the target allowlist on import
  logoImageUrl: z.string().nullable(),
  logoMarkPaths: z.string().nullable(),
  logoMarkViewBox: z.string().nullable(),
  logoMarkStrokeWidth: z.number().nullable(),
  logoMarkClass: z.string().nullable(),
  logoTransform: z.string().nullable(),
  faviconBg: z.string().nullable(),
  faviconFg: z.string().nullable(),
  defaultLocale: z.string().nullable(),
  seoIndexing: z.string().nullable(),
  aiCrawlers: z.string().nullable(),
});
export type RedactedBranding = z.infer<typeof RedactedBrandingSchema>;

export function redactBranding(row: Row): RedactedBranding {
  return {
    storeName: str(row.storeName),
    tagline: str(row.tagline),
    announcement: str(row.announcement),
    websiteHeadline: str(row.websiteHeadline),
    heroCta: str(row.heroCta),
    heroImage: str(row.heroImage),
    designSlug: str(row.designSlug),
    industryTemplate: str(row.industryTemplate),
    genomeJson: str(row.genomeJson),
    layoutJson: str(row.layoutJson),
    featureOverridesJson: str(row.featureOverridesJson),
    logoImageUrl: str(row.logoImageUrl),
    logoMarkPaths: str(row.logoMarkPaths),
    logoMarkViewBox: str(row.logoMarkViewBox),
    logoMarkStrokeWidth: int(row.logoMarkStrokeWidth),
    logoMarkClass: str(row.logoMarkClass),
    logoTransform: str(row.logoTransform),
    faviconBg: str(row.faviconBg),
    faviconFg: str(row.faviconFg),
    defaultLocale: str(row.defaultLocale),
    seoIndexing: str(row.seoIndexing),
    aiCrawlers: str(row.aiCrawlers),
  };
}

// ── IntegrationSettings → a non-secret STUB ───────────────────────────────────
//
// Carries ONLY the provider/model/feature-TOGGLE shape — so a restore can
// re-request the same posture and prompt the owner to reconnect. There is NO
// field here that can hold a key/secret/token/account-id. Every `*ApiKey`,
// `*Secret`, `*Token`, `stripe*`, `vercel*`, `googleOAuth*`, `drive*`, `sheets*`,
// `phoneInc*`, usage/fx caches are structurally absent.

export const IntegrationStubSchema = z.object({
  aiProvider: z.string().nullable(),
  anthropicModel: z.string().nullable(),
  // NOTE: localAiEndpoint is deliberately NOT carried — a private Ollama/LAN host
  // is account/infra-specific (closer to `domain` than to a posture toggle); the
  // importer re-defaults it.
  localAiModel: z.string().nullable(),
  localAiFallbackMode: z.string().nullable(),
  voiceShopEnabled: z.boolean().nullable(),
  voiceShopModel: z.string().nullable(),
  voiceShopVoice: z.string().nullable(),
  voiceShopVisionEnabled: z.boolean().nullable(),
  voiceShopMaxMinutesPerSession: z.number().nullable(),
  voiceShopMaxMinutesPerDay: z.number().nullable(),
  voiceShopAllowedToolsJson: z.string().nullable(), // tool NAMES, not secrets
  videoGenProvider: z.string().nullable(),
  v0PrivacyTier: z.string().nullable(),
});
export type IntegrationStub = z.infer<typeof IntegrationStubSchema>;

export function integrationStub(row: Row): IntegrationStub {
  return {
    aiProvider: str(row.aiProvider),
    anthropicModel: str(row.anthropicModel),
    localAiModel: str(row.localAiModel),
    localAiFallbackMode: str(row.localAiFallbackMode),
    voiceShopEnabled: bool(row.voiceShopEnabled),
    voiceShopModel: str(row.voiceShopModel),
    voiceShopVoice: str(row.voiceShopVoice),
    voiceShopVisionEnabled: bool(row.voiceShopVisionEnabled),
    voiceShopMaxMinutesPerSession: int(row.voiceShopMaxMinutesPerSession),
    voiceShopMaxMinutesPerDay: int(row.voiceShopMaxMinutesPerDay),
    voiceShopAllowedToolsJson: str(row.voiceShopAllowedToolsJson),
    videoGenProvider: str(row.videoGenProvider),
    v0PrivacyTier: str(row.v0PrivacyTier),
  };
}
