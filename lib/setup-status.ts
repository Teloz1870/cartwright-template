import "server-only";

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
  | "deployment";

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
  {
    id: "cookie-banner",
    category: "legal",
    label: "Cookie-banner live",
    description: "Confirm that cookie consent is active in production.",
    helpUrl: "/info/privatlivspolitik",
  },
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
    completedManualItems,
  ] = await Promise.all([
    getStripeKeys(),
    getResendApiKey(),
    getAnthropicApiKey(),
    getGoogleGeminiApiKey(),
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
