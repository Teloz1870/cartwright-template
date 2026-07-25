import "server-only";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { getAnthropicApiKey } from "@/lib/ai/client";
import { getGoogleGeminiApiKey } from "@/lib/ai/gemini";
import { getResendApiKey } from "@/lib/mailer/resend";
import { getStripeKeys } from "@/lib/stripe";

export type SetupItemCategory =
  | "payment"
  | "email"
  | "monitoring"
  | "cron"
  | "legal"
  | "trust"
  | "deployment"
  | "media";

export type SetupItemStatus = "ok" | "missing" | "warning";

export type SetupItem = {
  id: string;
  category: SetupItemCategory;
  label: string;
  status: SetupItemStatus;
  description?: string;
  helpUrl?: string;
  setupHref?: string;
  manual?: boolean;
  copyableValue?: string;
};

type SetupStatus = {
  items: SetupItem[];
  totalRequired: number;
  okCount: number;
  pctComplete: number;
  hasMissing: boolean;
};

const CACHE_TTL_MS = 60_000;
let cachedStatus: { value: SetupStatus; expiresAt: number } | null = null;

const manualItems = [
  {
    id: "deployment-vercel",
    category: "deployment",
    label: "Deployet til produktion",
    description:
      "Shoppen er deployet (fx til Vercel) og tilgængelig på en offentlig URL.",
    helpUrl: "https://cartwright.app/docs/deployment/vercel",
  },
  {
    id: "deployment-domain",
    category: "deployment",
    label: "Custom domæne konfigureret",
    description:
      "Eget domæne er tilføjet hos hosting-udbyderen med DNS + SSL, og NEXT_PUBLIC_APP_URL matcher det.",
    helpUrl: "https://cartwright.app/docs/deployment/custom-domain",
  },
  {
    id: "deployment-email-domain",
    category: "deployment",
    label: "Email-domæne verificeret",
    description:
      "Afsender-domænet er verificeret i Resend (SPF + DKIM), så transactional mails ikke afvises.",
    helpUrl: "https://cartwright.app/docs/features/email-resend",
  },
  // Phase 10 Slice 5: cookie-banner er flippet til auto-detection nedenfor.
  // Slettes ikke som ID — eksisterende setupChecklist-rækker bevarer state
  // indtil admin trykker næste gang. Manuel-item rolle udfaset.
  {
    id: "data-processing-agreements",
    category: "legal",
    label: "Data processing agreements registered",
    description: "DPAs for Anthropic, Gemini, Stripe, Resend, hosting og analytics.",
    helpUrl: "https://www.datatilsynet.dk/",
  },
  {
    id: "emaerket",
    category: "trust",
    label: "e-mark ready",
    description: "Certification and public badge can be activated after approval.",
    helpUrl: "https://www.emaerket.dk/",
  },
  {
    id: "trustpilot",
    category: "trust",
    label: "Trustpilot ready",
    description: "Domain and reviews are ready to be shown publicly.",
    helpUrl: "https://dk.business.trustpilot.com/",
  },
] satisfies Array<
  Omit<SetupItem, "status" | "manual"> & {
    category: SetupItemCategory;
  }
>;

/**
 * Server-side production setup checklist. Auto checks use DB-aware helpers with
 * env fallback; manual items persist as JSON on IntegrationSettings.
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  const now = Date.now();
  if (cachedStatus && cachedStatus.expiresAt > now) {
    return cachedStatus.value;
  }

  const [
    stripeKeys,
    resendApiKey,
    anthropicApiKey,
    googleGeminiApiKey,
    mediaAiStatus,
    completedManualItems,
  ] = await Promise.all([
    getStripeKeys(),
    getResendApiKey(),
    getAnthropicApiKey(),
    getGoogleGeminiApiKey(),
    getMediaAiStatus(),
    getCompletedManualChecklistItems(),
  ]);

  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const stripeEndpoint = publicAppUrl
    ? `${publicAppUrl.replace(/\/$/, "")}/api/webhook/stripe`
    : "/api/webhook/stripe";

  const items: SetupItem[] = [
    {
      id: "stripe-keys",
      category: "payment",
      label: "Stripe keys",
      status: stripeKeys ? "ok" : "missing",
      description: stripeKeys
        ? "Stripe secret, publishable key, and webhook secret are configured."
        : "Stripe requires secret key, publishable key, and webhook secret before real payment.",
      setupHref: "/admin/integrations",
      helpUrl: "https://docs.stripe.com/keys",
    },
    {
      id: "stripe-webhook-endpoint",
      category: "payment",
      label: "Stripe webhook endpoint",
      status: stripeKeys ? "ok" : "missing",
      description:
        "Add the endpoint in Stripe Dashboard with payment/refund/dispute events.",
      setupHref: "/admin/integrations",
      helpUrl: "https://docs.stripe.com/webhooks",
      copyableValue: stripeEndpoint,
    },
    {
      id: "resend-api-key",
      category: "email",
      label: "Resend API key",
      status: resendApiKey ? "ok" : "missing",
      description: resendApiKey
        ? "Resend API key is configured."
        : "Production email for magic links and order confirmations requires Resend.",
      setupHref: "/admin/integrations",
      helpUrl: "https://resend.com/docs",
    },
    {
      id: "anthropic-api-key",
      category: "email",
      label: "Anthropic API key",
      status: anthropicApiKey ? "ok" : "missing",
      description: anthropicApiKey
        ? "Anthropic API key is configured."
        : "Customer chat requires an Anthropic key.",
      setupHref: "/admin/integrations",
      helpUrl: "https://docs.anthropic.com/",
    },
    {
      id: "google-gemini-api-key",
      category: "email",
      label: "Google Gemini API key",
      status: googleGeminiApiKey ? "ok" : "warning",
      description: googleGeminiApiKey
        ? "Gemini API key is configured."
        : "AI-generated SEO content, theme palettes, and category descriptions require a Gemini key.",
      setupHref: "/admin/integrations",
      helpUrl: "https://ai.google.dev/gemini-api/docs",
    },
    {
      id: "media-ai-generator",
      category: "media",
      label: "Media alt-text generator",
      status: mediaAiStatus.status,
      description: mediaAiStatus.description,
      setupHref: "/admin/integrations",
      helpUrl: "https://ai.google.dev/gemini-api/docs",
    },
    consentBannerItem(),
    envItem({
      id: "ga4-measurement-id",
      category: "monitoring",
      label: "Google Analytics 4 measurement ID",
      envName: "NEXT_PUBLIC_GA4_MEASUREMENT_ID",
      description:
        "GA4 property ID (G-XXXXXXX). Loadet KUN efter cookie-samtykke (Google Consent Mode v2).",
      helpUrl: "https://support.google.com/analytics/answer/9304153",
      optionalWarning: true,
    }),
    envItem({
      id: "google-site-verification",
      category: "monitoring",
      label: "Google Search Console verification",
      envName: "GOOGLE_SITE_VERIFICATION",
      description:
        "Content-værdien fra Search Console's meta-tag verification. Tilføjes som <meta> i layout.",
      helpUrl: "https://support.google.com/webmasters/answer/9008080",
      optionalWarning: true,
    }),
    envItem({
      id: "sentry-dsn",
      category: "monitoring",
      label: "Sentry DSN",
      envName: "SENTRY_DSN",
      description: "Error monitoring endpoint for server runtime issues.",
      helpUrl: "https://docs.sentry.io/platforms/javascript/guides/nextjs/",
      optionalWarning: true,
    }),
    envItem({
      id: "next-public-sentry-dsn",
      category: "monitoring",
      label: "Public Sentry DSN",
      envName: "NEXT_PUBLIC_SENTRY_DSN",
      description: "Browser-side error monitoring endpoint.",
      helpUrl: "https://docs.sentry.io/platforms/javascript/guides/nextjs/",
      optionalWarning: true,
    }),
    envItem({
      id: "cron-secret",
      category: "cron",
      label: "CRON_SECRET",
      envName: "CRON_SECRET",
      description: "Secret for protected cron/reconcile endpoints.",
      helpUrl: "https://vercel.com/docs/cron-jobs",
    }),
    appUrlItem(),
    envItem({
      id: "auth-secret",
      category: "deployment",
      label: "AUTH_SECRET",
      envName: "AUTH_SECRET",
      description:
        "Hemmelig nøgle til session-signing — skal være sat i production-miljøet.",
      helpUrl: "https://cartwright.app/docs/deployment/vercel",
    }),
    ...manualItems.map(
      (item): SetupItem => ({
        ...item,
        manual: true,
        status: completedManualItems.has(item.id) ? "ok" : "missing",
      }),
    ),
  ];

  const requiredItems = items.filter((item) => item.status !== "warning");
  const okCount = requiredItems.filter((item) => item.status === "ok").length;
  const totalRequired = requiredItems.length;
  const pctComplete =
    totalRequired === 0 ? 100 : Math.round((okCount / totalRequired) * 100);

  const status = {
    items,
    totalRequired,
    okCount,
    pctComplete,
    hasMissing: items.some((item) => item.status === "missing"),
  };
  cachedStatus = { value: status, expiresAt: now + CACHE_TTL_MS };
  return status;
}

export async function hasMissingSetupItems(): Promise<boolean> {
  return (await getSetupStatus()).hasMissing;
}

export function invalidateSetupStatusCache(): void {
  cachedStatus = null;
}

/**
 * Phase 10 Slice 5: cookie-banner-status. Auto-detected via flag.
 *   ok       — brand.features.consentBanner=true (banner kører i layout)
 *   missing  — flag off (banner er ikke aktivt, ingen GDPR-compliance)
 */
function consentBannerItem(): SetupItem {
  const features = brand.features as { consentBanner?: boolean };
  const enabled = Boolean(features.consentBanner);
  return {
    id: "cookie-banner",
    category: "legal",
    label: "Cookie-banner",
    status: enabled ? "ok" : "missing",
    description: enabled
      ? "EU-compliant consent banner aktivt (3 kategorier: necessary, analytics, marketing)."
      : "Flag brand.features.consentBanner er false — banneret renderes ikke. Påkrævet for GDPR-compliance før GA4/pixels må køre.",
    helpUrl: "/info/privatlivspolitik",
  };
}

/**
 * Phase 10 Slice 2: helbreds-tjek for media alt-text generator.
 *
 *   ok       — Gemini-key sat + ingen exhausted assets (eller <5% af total)
 *   warning  — Gemini-key mangler (generator no-op'er stille) ELLER
 *              for mange assets sidder fast i skipped/failed
 *   missing  — n/a (generator er ikke "påkrævet" for grundlæggende drift)
 */
async function getMediaAiStatus(): Promise<{
  status: SetupItemStatus;
  description: string;
}> {
  const geminiKey = await getGoogleGeminiApiKey();
  if (!geminiKey) {
    return {
      status: "warning",
      description:
        "Gemini key mangler — auto-genereret alt-tekst + SEO/GEO-metadata på uploads skippes (manuelle alt-tekster virker stadig).",
    };
  }

  try {
    const [total, exhausted, pending] = await Promise.all([
      prisma.mediaAsset.count(),
      prisma.mediaAsset.count({ where: { aiStatus: "skipped" } }),
      prisma.mediaAsset.count({ where: { aiStatus: "pending" } }),
    ]);
    if (total === 0) {
      return {
        status: "ok",
        description:
          "Gemini-drevet alt-text/SEO/GEO generator er aktiv. Endnu ingen uploads.",
      };
    }
    const failedPct = (exhausted / total) * 100;
    if (failedPct >= 5) {
      return {
        status: "warning",
        description: `${exhausted} ud af ${total} assets (${failedPct.toFixed(1)}%) er skipped efter for mange Gemini-fejl. Tjek /admin/media for detaljer.`,
      };
    }
    return {
      status: "ok",
      description: `Aktiv. ${total} assets, ${pending} venter på AI-tagging, ${exhausted} skipped efter retry.`,
    };
  } catch {
    return {
      status: "warning",
      description: "Kunne ikke læse MediaAsset-status (DB ikke tilgængelig).",
    };
  }
}

async function getCompletedManualChecklistItems(): Promise<Set<string>> {
  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { setupChecklist: true },
    });
    return parseChecklist(row?.setupChecklist);
  } catch {
    return new Set();
  }
}

export function parseChecklist(value: string | null | undefined): Set<string> {
  if (!value) return new Set();
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function envItem(args: {
  id: string;
  category: SetupItemCategory;
  label: string;
  envName: string;
  description: string;
  helpUrl: string;
  optionalWarning?: boolean;
}): SetupItem {
  const value = process.env[args.envName]?.trim();
  const status: SetupItemStatus = value
    ? "ok"
    : args.optionalWarning
      ? "warning"
      : "missing";

  return {
    id: args.id,
    category: args.category,
    label: args.label,
    status,
    description: value ? `${args.envName} is configured.` : args.description,
    helpUrl: args.helpUrl,
  };
}

function appUrlItem(): SetupItem {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let status: SetupItemStatus = "missing";
  let description = "Canonical public app URL used for redirects, links, and external callbacks.";

  if (value) {
    try {
      const parsed = new URL(value);
      status = parsed.protocol === "https:" ? "ok" : "warning";
      description =
        parsed.protocol === "https:"
          ? "NEXT_PUBLIC_APP_URL is configured."
          : "NEXT_PUBLIC_APP_URL is set, but production should use HTTPS.";
    } catch {
      status = "warning";
      description = "NEXT_PUBLIC_APP_URL is set, but is not a valid absolute URL.";
    }
  }

  return {
    id: "next-public-app-url",
    category: "monitoring",
    label: "Public app URL",
    status,
    description,
    helpUrl: "https://nextjs.org/docs/app/guides/environment-variables",
  };
}
