import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIStylistButton from "@/components/AIStylistButton";
import VoiceShopMount from "@/components/voice/VoiceShopMount";
import WelcomeGuide from "@/components/WelcomeGuide";
import { PhoneWidget } from "@/components/ui/PhoneWidget";
import { CurrencyProvider } from "@/lib/currency-context";
import { getCurrency } from "@/lib/currency-server";
import { AnnouncementProvider } from "@/lib/a11y/announcement-context";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { shouldShowSetupWizard } from "@/lib/setup-wizard";
import { prisma } from "@/lib/db";

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

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <CurrencyProvider initial={initialCurrency}>
        <AnnouncementProvider>
          {brandConfig.ecommerceEnabled && <AnnouncementBar />}
          <Header />
          <main className="min-h-[60vh]">{children}</main>
          <Footer />
          {brand.features.aiStylist && <AIStylistButton ecommerceEnabled={brandConfig.ecommerceEnabled} />}
          <VoiceShopMount />
          {brandConfig.ecommerceEnabled && brand.features.welcomeGuide && (
            <WelcomeGuide setupPending={setupPending} />
          )}
          {brandConfig.ecommerceEnabled && <PhoneWidget workspaceId={phoneIncWorkspaceId || undefined} />}
          {/* Phase B1 — screen-reader announcement surface for cart, reviews,
              and other async state changes. Must render at the bottom so the
              live regions exist in the DOM at page load (some assistive tech
              only watches regions present from the start). */}
          <LiveRegion />
        </AnnouncementProvider>
      </CurrencyProvider>
    </NextIntlClientProvider>
  );
}
