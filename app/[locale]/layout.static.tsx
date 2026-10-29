import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { getBrand } from "@/lib/brand";
import { getActiveDesign, getActiveChromeConfig } from "@/lib/theme";
import { CHROME_REGISTRY } from "@/lib/builder/chrome-registry";
import { FeaturesProvider } from "@/lib/feature-flags/context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SpeculationRules } from "@/components/SpeculationRules";
import { CurrencyProvider } from "@/lib/currency-context";
import { getCurrency } from "@/lib/currency-server";
import { AnnouncementProvider } from "@/lib/a11y/announcement-context";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { notFound } from "next/navigation";
import { isSupportedLocale } from "@/i18n/routing";
import { profileCapabilities } from "@/lib/profile-capabilities";

/**
 * B3 static seam variant — the `site`-profile locale layout (site-profile
 * program). The materializer copies this file over
 * `app/[locale]/layout.tsx` when the db module is not in the profile;
 * NOTHING imports it in the shipped engine (byte-identical until then).
 *
 * Same shell as the db variant — i18n provider, brand/features context,
 * design-owned chrome resolution (Shell/Header/Footer + layout.mainClassName),
 * a11y live regions, speculation rules — minus every surface that requires a
 * database or an excluded module:
 *
 *  - no setup wizard / first-run probes (admin), no phone widget (plugin),
 *    no announcement bar (DB-backed texts), no voice mount / WebMCP
 *    registrar (voice/mcp), no in-place editing (admin), no AI stylist
 *    button (admin-configured AI), no FX-rate priming (webshop).
 *  - `getCurrency()` still resolves the cookie so the (flag-gated) currency
 *    switcher context exists; without the webshop module the switcher UI
 *    never renders.
 */

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const messages = await getMessages();
  const brandConfig = await getBrand();
  const initialCurrency = await getCurrency();

  // Design-owned site-wide chrome — same resolution order as the db variant:
  // explicit chrome-part selection beats the design's siteChrome beats the
  // shared Header/Footer. Without a DB, getActiveChromeConfig() is null and
  // the design/config decide alone.
  const activeDesign = await getActiveDesign().catch(() => null);
  const chromeConfig = await getActiveChromeConfig().catch(() => null);
  const headerEntry = chromeConfig?.headerKey ? CHROME_REGISTRY[chromeConfig.headerKey] : undefined;
  const footerEntry = chromeConfig?.footerKey ? CHROME_REGISTRY[chromeConfig.footerKey] : undefined;
  const DesignHeader = headerEntry?.Component ?? activeDesign?.siteChrome?.Header;
  const DesignFooter = footerEntry?.Component ?? activeDesign?.siteChrome?.Footer;
  const DesignShell = activeDesign?.siteChrome?.Shell;
  const agentApiEnabled =
    profileCapabilities.agentApi && brandConfig.features.mcpPublic;
  const accountAndAdminEnabled = profileCapabilities.accountAndAdmin;
  const designLayout = activeDesign?.layout;
  const body = designLayout?.ownsMain ? (
    children
  ) : (
    <main className={designLayout?.mainClassName ?? "min-h-[60vh]"}>{children}</main>
  );
  const chrome = (
    <>
      {DesignHeader ? (
        <DesignHeader
          locale={locale}
          agentApiEnabled={agentApiEnabled}
          accountAndAdminEnabled={accountAndAdminEnabled}
        />
      ) : (
        <Header />
      )}
      {body}
      {DesignFooter ? (
        <DesignFooter
          locale={locale}
          agentApiEnabled={agentApiEnabled}
          accountAndAdminEnabled={accountAndAdminEnabled}
        />
      ) : (
        <Footer />
      )}
    </>
  );
  const chromeBlock = DesignShell ? <DesignShell locale={locale}>{chrome}</DesignShell> : chrome;

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <CurrencyProvider initial={initialCurrency}>
        <FeaturesProvider initial={brandConfig.features}>
          <AnnouncementProvider>
            {brandConfig.features.speculationRules && <SpeculationRules />}
            {chromeBlock}
            <LiveRegion />
          </AnnouncementProvider>
        </FeaturesProvider>
      </CurrencyProvider>
    </NextIntlClientProvider>
  );
}
