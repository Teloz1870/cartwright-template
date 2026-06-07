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
import SetupWarningBar from "@/components/admin/SetupWarningBar";
import AiStatusPill from "@/components/admin/AiStatusPill";
import VoiceUsageSection from "@/components/admin/VoiceUsageSection";
import { ThemeToggle } from "@/components/ThemeToggle";
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
    <div className="min-h-screen bg-sol-cream text-sol-ink md:flex">
      {/* Phase 8 Task C: admin sidebar nu i sol-accent-deep (matcher Footer-paletten
          fra Phase 6). border-r med subtle glass-border for premium-edge frem for
          hård sol-ink/white-divider. */}
      <aside className="hidden w-56 shrink-0 border-r border-sol-glass-border bg-sol-accent-deep text-white md:flex md:min-h-screen md:flex-col">
        <div className="border-b border-white/10 px-5 py-5 flex items-center justify-between">
          <Link href="/admin" className="text-xl font-black">
            <Logo storeName={brand.storeName} logo={brand.logo} />
          </Link>
          <ThemeToggle />
        </div>

        <AdminNav variant="sidebar" {...navCtx} />

        <div className="border-t border-white/10 p-3 flex flex-col gap-1">
          <Link
            href="/admin/konto"
            className="block rounded-lg px-3 py-2 text-sm font-bold text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            Min konto
          </Link>
          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-sm font-bold text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            Til butikken
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <SetupWarningBar />

        {/* Phase 8 Task C: mobile admin-header matcher sidebar (sol-accent-deep) */}
        <div className="bg-sol-accent-deep px-4 py-3 text-white md:hidden">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="text-lg font-black">
                <Logo storeName={brand.storeName} logo={brand.logo} className="scale-90 transform origin-left" />
              </Link>
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-3">
              <Link href="/admin/konto" className="text-sm font-bold text-white/85">
                Konto
              </Link>
              <Link href="/" className="text-sm font-bold text-white/85">
                Butik
              </Link>
            </div>
          </div>

          <AdminNav variant="mobile" {...navCtx} />
        </div>

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
