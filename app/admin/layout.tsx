import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import {
  isSetupWhitelistedPath,
  shouldShowSetupWizard,
} from "@/lib/setup-wizard";
import AdminChatLauncher from "@/components/admin/AdminChatLauncher";
import AdminNav from "@/components/admin/AdminNav";
import AdminTopBar from "@/components/admin/AdminTopBar";
import SetupWarningBar from "@/components/admin/SetupWarningBar";
import AiStatusPill from "@/components/admin/AiStatusPill";
import VoiceUsageSection from "@/components/admin/VoiceUsageSection";
import Logo from "@/components/Logo";

import { brand as brandConfig } from "@/brand.config";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { getInitialAiStatus } from "@/lib/ai/status";
import { getVoiceShopSettings, readDailyUsage } from "@/lib/voice/settings";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  // Task D: redirect to /admin/setup on a fresh fork (no products +
  // setupComplete=false). Whitelists /admin/setup (of course) and
  // /admin/integrations so a power user can always reach the keys page directly.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname && !isSetupWhitelistedPath(pathname)) {
    if (await shouldShowSetupWizard()) {
      redirect("/admin/setup");
    }
  }

  // Security: force a password change before the rest of admin if the admin was
  // created with a generated starter password (mustChangePassword). /admin/konto
  // itself is whitelisted, or the redirect would loop. A fresh DB read = no JWT staleness.
  if (pathname && pathname !== "/admin/konto") {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { mustChangePassword: true },
    });
    if (me?.mustChangePassword) {
      redirect("/admin/konto");
    }
  }

  const features = (brandConfig.features ?? {}) as Record<string, boolean | undefined>;
  const voiceShopOn = !!features.voiceShop;

  const [brand, aiStatus, voiceShopSettings, voiceUsage] = await Promise.all([
    getBrand(),
    getInitialAiStatus(),
    voiceShopOn ? getVoiceShopSettings() : Promise.resolve(null),
    voiceShopOn ? readDailyUsage() : Promise.resolve(null),
  ]);

  // VoiceUsageSection is injected into AiStatusPill's extensions slot without
  // having to refactor the pill — voice stats are server-rendered here because
  // the pill only client-polls provider/model/latency (not voice data).
  const aiStatusExtensions =
    voiceShopOn && voiceShopSettings && voiceUsage
      ? [
          <VoiceUsageSection
            key="voice-usage"
            enabled={voiceShopSettings.enabled}
            minutesUsed={voiceUsage.minutesUsed}
            maxMinutesPerDay={voiceShopSettings.maxMinutesPerDay}
          />,
        ]
      : undefined;
  // AI disabled from the start: neither the chat launcher nor the status pill
  // floats in the corner until a provider is actually configured (key/endpoint).
  // On a fresh scaffold without a key = no AI UI at all; the pill NEVER shows a
  // stray "AI offline" in the corner. "degraded" counts as configured (worth showing).
  const aiConfigured =
    aiStatus.kind !== "offline" && aiStatus.kind !== "unknown";

  // Nav context for the grouped sidebar. Gating (ecommerce / feature flags
  // / dev-only) + automatic group hiding now live in lib/admin/nav.ts (filterNav).
  const navCtx = {
    ecommerceEnabled: brand.ecommerceEnabled,
    features: (brand.features ?? {}) as Record<string, boolean | undefined>,
    isProd: process.env.NODE_ENV === "production",
    mode: brandConfig.mode,
  };

  return (
    <div data-admin-skin className="min-h-screen bg-sol-cream text-sol-ink md:flex">
      {/* Polaris skin: light sidebar (var(--admin-sidebar-bg)) with dark text.
          Sticky full height so the nav stays put while the content scrolls.
          Account links + theme toggle now live in AdminTopBar. */}
      <aside
        className="hidden w-56 shrink-0 flex-col border-r md:flex md:sticky md:top-0 md:h-[100dvh] md:overflow-y-auto"
        style={{
          background: "var(--admin-sidebar-bg)",
          borderRightColor: "var(--admin-sidebar-border)",
        }}
      >
        <div
          className="border-b px-5 py-4"
          style={{ borderBottomColor: "var(--admin-sidebar-border)" }}
        >
          <Link href="/admin" className="text-sol-ink">
            <Logo storeName={brand.storeName} logo={brand.logo} />
          </Link>
        </div>

        <AdminNav variant="sidebar" {...navCtx} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Shopify-style top bar: search + account menu + (mobile) drawer trigger */}
        <AdminTopBar
          storeName={brand.storeName}
          logo={brand.logo}
          email={session.user.email}
          navCtx={navCtx}
        />

        <SetupWarningBar />

        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      {/* Global ⌘K launcher + AI status pill — only when an AI provider is
          configured. Fresh scaffold without a key ⇒ no AI element in the corner
          (AI disabled from the start). Set up in /admin/integrations. */}
      {aiConfigured && (
        <>
          <AdminChatLauncher />
          <AiStatusPill
            initial={aiStatus}
            healthEndpoint="/api/admin/ai/health"
            extensions={aiStatusExtensions}
          />
        </>
      )}
    </div>
  );
}
