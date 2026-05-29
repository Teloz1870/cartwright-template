import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import {
  isSetupWhitelistedPath,
  shouldShowSetupWizard,
} from "@/lib/setup-wizard";
import AdminChatLauncher from "@/components/admin/AdminChatLauncher";
import AdminNavLink from "@/components/admin/AdminNavLink";
import SetupWarningBar from "@/components/admin/SetupWarningBar";
import AiStatusPill from "@/components/admin/AiStatusPill";
import VoiceUsageSection from "@/components/admin/VoiceUsageSection";
import { ThemeToggle } from "@/components/ThemeToggle";
import Logo from "@/components/Logo";

import { brand as brandConfig } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { getInitialAiStatus } from "@/lib/ai/status";
import { getVoiceShopSettings, readDailyUsage } from "@/lib/voice/settings";

type NavLink = {
  href: string;
  label: string;
  ecommerce?: boolean;
  /** Only show when brand.features.adminAgenticDashboard is true (Phase 9). */
  agentic?: boolean;
  /** Only show when brand.features.mediaLibrary is true (Phase 10). */
  mediaLibrary?: boolean;
  /** Only show when brand.features.reviews is true (Phase 10 Slice 7). */
  reviews?: boolean;
};

const allNavLinks: NavLink[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/produkter", label: "Produkter", ecommerce: true },
  { href: "/admin/sider", label: "Sider" },
  { href: "/admin/vibe-sandbox", label: "Vibe Sandkasse" },
  { href: "/admin/kategorier", label: "Kategorier", ecommerce: true },
  { href: "/admin/services", label: "Ydelser" },
  { href: "/admin/ordrer", label: "Ordrer", ecommerce: true },
  { href: "/admin/anmeldelser", label: "Anmeldelser", reviews: true },
  { href: "/admin/rabatkoder", label: "Rabatkoder", ecommerce: true },
  { href: "/admin/kunder", label: "Kunder" },
  { href: "/admin/mails", label: "Mails" },
  { href: "/admin/telefon", label: "Telefoni" },
  { href: "/admin/api-keys", label: "API-keys" },
  { href: "/admin/media", label: "Media", mediaLibrary: true },
  { href: "/admin/designs", label: "Designs" },
  { href: "/admin/integrations", label: "Integrationer" },
  { href: "/admin/audit", label: "Audit-log" },
  { href: "/admin/ai", label: "AI-copilot" },
  { href: "/admin/agentic", label: "Agentic A2A", agentic: true },
  { href: "/admin/indstillinger", label: "Indstillinger" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  // Task D: redirect til /admin/setup hvis fresh fork (ingen produkter +
  // setupComplete=false). Whitelister /admin/setup (selvfølgelig) og
  // /admin/integrations så power-user altid kan nå keys-siden direkte.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname && !isSetupWhitelistedPath(pathname)) {
    if (await shouldShowSetupWizard()) {
      redirect("/admin/setup");
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
  // brand.features.adminAgenticDashboard may be undefined on older configs
  // (the field was added in Phase 4 close-out). Default to false.
  const agenticEnabled = Boolean(
    (brand.features as { adminAgenticDashboard?: boolean }).adminAgenticDashboard,
  );
  const mediaLibraryEnabled = Boolean(
    (brand.features as { mediaLibrary?: boolean }).mediaLibrary,
  );
  const reviewsEnabled = Boolean(
    (brand.features as { reviews?: boolean }).reviews,
  );
  const navLinks = allNavLinks.filter((l) => {
    if (l.ecommerce && !brand.ecommerceEnabled) return false;
    if (l.agentic && !agenticEnabled) return false;
    if (l.mediaLibrary && !mediaLibraryEnabled) return false;
    if (l.reviews && !reviewsEnabled) return false;
    return true;
  });

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

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navLinks.map((link) => (
            <AdminNavLink key={link.href} href={link.href} label={link.label} />
          ))}
        </nav>

        <div className="border-t border-white/10 p-3 flex flex-col gap-1">
          <Link
            href="/account"
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
              <Link href="/account" className="text-sm font-bold text-white/85">
                Konto
              </Link>
              <Link href="/" className="text-sm font-bold text-white/85">
                Butik
              </Link>
            </div>
          </div>

          <nav className="-mx-1 flex gap-1 overflow-x-auto">
            {navLinks.map((link) => (
              <AdminNavLink key={link.href} href={link.href} label={link.label} mobile />
            ))}
          </nav>
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
