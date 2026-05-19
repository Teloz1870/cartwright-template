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
  | "trust";

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
    id: "cookie-banner",
    category: "legal",
    label: "Cookie-banner live",
    description: "Bekræft at cookie-samtykke er aktivt i production.",
    helpUrl: "/info/privatlivspolitik",
  },
  {
    id: "data-processing-agreements",
    category: "legal",
    label: "Databehandleraftaler registreret",
    description: "DPAs for Anthropic, Gemini, Stripe, Resend, hosting og analytics.",
    helpUrl: "https://www.datatilsynet.dk/",
  },
  {
    id: "emaerket",
    category: "trust",
    label: "e-mærket klar",
    description: "Certificering og offentlig badge kan aktiveres efter godkendelse.",
    helpUrl: "https://www.emaerket.dk/",
  },
  {
    id: "trustpilot",
    category: "trust",
    label: "Trustpilot klar",
    description: "Domæne og reviews er klar til at blive vist offentligt.",
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
        ? "Stripe secret, publishable key og webhook secret er konfigureret."
        : "Stripe kræver secret key, publishable key og webhook secret før real payment.",
      setupHref: "/admin/integrations",
      helpUrl: "https://docs.stripe.com/keys",
    },
    {
      id: "stripe-webhook-endpoint",
      category: "payment",
      label: "Stripe webhook endpoint",
      status: stripeKeys ? "ok" : "missing",
      description:
        "Tilføj endpointet i Stripe Dashboard med payment/refund/dispute events.",
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
        ? "Resend API key er konfigureret."
        : "Production-mail til magic-links og ordrebekræftelser kræver Resend.",
      setupHref: "/admin/integrations",
      helpUrl: "https://resend.com/docs",
    },
    {
      id: "anthropic-api-key",
      category: "email",
      label: "Anthropic API key",
      status: anthropicApiKey ? "ok" : "missing",
      description: anthropicApiKey
        ? "Anthropic API key er konfigureret."
        : "Kunde-chatten kræver en Anthropic key.",
      setupHref: "/admin/integrations",
      helpUrl: "https://docs.anthropic.com/",
    },
    {
      id: "google-gemini-api-key",
      category: "email",
      label: "Google Gemini API key",
      status: googleGeminiApiKey ? "ok" : "warning",
      description: googleGeminiApiKey
        ? "Gemini API key er konfigureret."
        : "AI-genereret SEO-content, theme-palette og kategori-beskrivelser kræver Gemini key.",
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
      description: "Secret til beskyttede cron/reconcile endpoints.",
      helpUrl: "https://vercel.com/docs/cron-jobs",
    }),
    appUrlItem(),
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
    description: value ? `${args.envName} er konfigureret.` : args.description,
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
          ? "NEXT_PUBLIC_APP_URL er konfigureret."
          : "NEXT_PUBLIC_APP_URL er sat, men production bør bruge HTTPS.";
    } catch {
      status = "warning";
      description = "NEXT_PUBLIC_APP_URL er sat, men er ikke en gyldig absolut URL.";
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
