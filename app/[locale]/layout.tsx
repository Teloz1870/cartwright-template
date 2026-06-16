import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { getBrand } from "@/lib/brand";
import { getActiveDesign, getActiveChromeConfig } from "@/lib/theme";
import { CHROME_REGISTRY } from "@/lib/builder/chrome-registry";
import { FeaturesProvider } from "@/lib/feature-flags/context";
import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIStylistButton from "@/components/AIStylistButton";
import VoiceShopMount from "@/components/voice/VoiceShopMount";
import WebMcpRegistrar from "@/components/WebMcpRegistrar";
import WelcomeGuide from "@/components/WelcomeGuide";
import { PhoneWidget } from "@/components/ui/PhoneWidget";
import { CurrencyProvider } from "@/lib/currency-context";
import { getCurrency } from "@/lib/currency-server";
import { AnnouncementProvider } from "@/lib/a11y/announcement-context";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { shouldShowSetupWizard } from "@/lib/setup-wizard";
import { prisma } from "@/lib/db";
import { EditModeProvider } from "@/components/annotate/EditModeProvider";
import EditModeOverlay from "@/components/annotate/EditModeOverlay";
import { isAnnotateEditEnabled } from "@/lib/annotate/server";
import { isAiConfigured } from "@/lib/ai/status";
import { primeFxRatesFromDb } from "@/lib/fx/rates";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  const messages = await getMessages();
  const brandConfig = await getBrand();

  // Clean first-visit check that gracefully handles database connection failures
  const setupPending = await shouldShowSetupWizard().catch(() => false);

  const integrations = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: { phoneIncWorkspaceId: true }
  }).catch(() => null);

  const phoneIncWorkspaceId = integrations?.phoneIncWorkspaceId;

  // Currency-cookie reader → CurrencyProvider initial. Returnerer base-
  // currency hvis features.currencySwitcher=false så SSR-HTML matcher
  // post-hydration state.
  const initialCurrency = await getCurrency();
  const fxRateOverrides = await primeFxRatesFromDb();

  // In-place editing: admin + annotateEdit-flag. False ⇒ provider/overlay er
  // no-op og editAttr lægger ingen attributter på DOM (byte-identisk for andre).
  const editEnabled = await isAnnotateEditEnabled();

  // AI-assistent-FAB deaktiveret fra start: vises kun når aiStylist-flaget er ON
  // OG en provider faktisk er konfigureret. Frisk scaffold uden nøgle ⇒ ingen
  // svævende AI-knap. Canary-sikkert: deploys med ANTHROPIC_API_KEY i env er
  // konfigureret ⇒ uændret. (getAiSettings er 30s-cachet.)
  const aiConfigured = await isAiConfigured();

  // Design-owned site-wide chrome (DesignPack.siteChrome). When the active design
  // provides a Shell/Header/Footer, its look reaches EVERY page; otherwise this is
  // all undefined and the shared Header/Footer render exactly as before (fail-soft
  // to null on DB error → default chrome). Byte-identical when no design sets it.
  //
  // Mixer 2.0 Phase 1 — selectable chrome parts: an explicit, validated
  // BrandingSettings.chromeJson selection (chrome-registry key) beats the
  // design's own siteChrome, which beats the shared chrome. chromeJson unset/
  // invalid → getActiveChromeConfig() is null and resolution is unchanged.
  const activeDesign = await getActiveDesign().catch(() => null);
  const chromeConfig = await getActiveChromeConfig().catch(() => null);
  const headerEntry = chromeConfig?.headerKey ? CHROME_REGISTRY[chromeConfig.headerKey] : undefined;
  const footerEntry = chromeConfig?.footerKey ? CHROME_REGISTRY[chromeConfig.footerKey] : undefined;
  const DesignHeader = headerEntry?.Component ?? activeDesign?.siteChrome?.Header;
  const DesignFooter = footerEntry?.Component ?? activeDesign?.siteChrome?.Footer;
  const DesignShell = activeDesign?.siteChrome?.Shell;
  const chrome = (
    <>
      {DesignHeader ? <DesignHeader locale={locale} /> : <Header />}
      <main className="min-h-[60vh]">{children}</main>
      {DesignFooter ? <DesignFooter locale={locale} /> : <Footer />}
    </>
  );
  const chromeBlock = DesignShell ? <DesignShell locale={locale}>{chrome}</DesignShell> : chrome;

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <CurrencyProvider
        initial={initialCurrency}
        fxRateOverrides={fxRateOverrides}
      >
        <FeaturesProvider initial={brandConfig.features}>
          <AnnouncementProvider>
           <EditModeProvider enabled={editEnabled}>
            {brandConfig.features.announcementBar && <AnnouncementBar />}
            {chromeBlock}
            {brandConfig.features.aiStylist && aiConfigured && <AIStylistButton ecommerceEnabled={brandConfig.ecommerceEnabled} />}
            <VoiceShopMount />
            {/* WebMCP-eksperiment: kun webshop + flag on. Default-off ⇒ renderer
                slet ikke, så canaries med flaget off er byte-identiske. */}
            {brandConfig.ecommerceEnabled && brandConfig.features.webMcp && <WebMcpRegistrar />}
            {/* First-run canvas (firstRunWelcome) supersedes the WelcomeGuide
                modal — engine default false ⇒ `!false` ≡ today (canary-safe). */}
            {brandConfig.ecommerceEnabled &&
              brandConfig.features.welcomeGuide &&
              !brandConfig.features.firstRunWelcome && (
              <WelcomeGuide setupPending={setupPending} />
            )}
            {brandConfig.features.phoneWidget && <PhoneWidget workspaceId={phoneIncWorkspaceId || undefined} />}
            {/* Phase B1 — screen-reader announcement surface for cart, reviews,
                and other async state changes. Must render at the bottom so the
                live regions exist in the DOM at page load (some assistive tech
                only watches regions present from the start). */}
            <LiveRegion />
            <EditModeOverlay />
           </EditModeProvider>
          </AnnouncementProvider>
        </FeaturesProvider>
      </CurrencyProvider>
    </NextIntlClientProvider>
  );
}
