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

  // Task D: redirect til /admin/setup hvis fresh fork (ingen produkter +
  // setupComplete=false). Whitelister /admin/setup (selvfølgelig) og
  // /admin/integrations så power-user altid kan nå keys-siden direkte.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname && !isSetupWhitelistedPath(pathname)) {
    if (await shouldShowSetupWizard()) {
      redirect("/admin/setup");
    }
  }

  // Sikkerhed: tving password-skift før resten af admin hvis admin blev oprettet
  // med et genereret start-password (mustChangePassword). /admin/konto selv er
  // whitelisted, ellers loop'er redirecten. Frisk DB-read = ingen JWT-staleness.
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

  // VoiceUsageSection injiceres i AiStatusPill's extensions-slot uden at
  // skulle refaktorere pill'en — voice-stats er server-rendered her fordi
  // pill'en client-poll'er bare provider/model/latency (ikke voice-data).
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
  // Nav-kontekst til den grupperede sidebar. Gating (ecommerce / feature-flags
  // / dev-only) + gruppe-auto-skjul bor nu i lib/admin/nav.ts (filterNav).
  const navCtx = {
    ecommerceEnabled: brand.ecommerceEnabled,
    features: (brand.features ?? {}) as Record<string, boolean | undefined>,
    isProd: process.env.NODE_ENV === "production",
    mode: brandConfig.mode,
  };

  return (
    <div data-admin-skin className="min-h-screen bg-sol-cream text-sol-ink md:flex">
      {/* Polaris-skin: lys sidebar (var(--admin-sidebar-bg)) med mørk tekst.
          Sticky fuld-højde så nav'en bliver mens indholdet scroller. Konto-links
          + theme-toggle bor nu i AdminTopBar. */}
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
        {/* Shopify-agtig topbar: søgning + konto-menu + (mobil) drawer-trigger */}
        <AdminTopBar
          storeName={brand.storeName}
          logo={brand.logo}
          email={session.user.email}
          navCtx={navCtx}
        />

        <SetupWarningBar />

        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      {/* Global ⌘K-launcher — fixed positioned, vises på alle /admin/* sider */}
      <AdminChatLauncher />

      {/* Local-AI status-pill — fixed bottom-right, polls /api/admin/ai/health */}
      <AiStatusPill
        initial={aiStatus}
        healthEndpoint="/api/admin/ai/health"
        extensions={aiStatusExtensions}
      />
    </div>
  );
}
