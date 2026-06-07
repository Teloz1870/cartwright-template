import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { brand } from "@/brand.config";
import {
  getActiveTheme,
  themeToInlineCss,
  getActiveDesign,
  designToInlineCss,
  paletteToFullThemeCss,
} from "@/lib/theme";
import JsonLd from "@/components/JsonLd";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConsentProvider } from "@/components/ConsentProvider";
import ConsentBanner from "@/components/ConsentBanner";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { getConsent } from "@/lib/consent-server";
import { getSeoSettings } from "@/lib/seo-settings";
import { getLocale } from "next-intl/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Brand-config driver titel/description så fork-shops kun rediger brand.config.ts
export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: brand.metadata.title,
  description: brand.metadata.description,
  // Site-wide Open Graph / Twitter defaults so EVERY page that doesn't set its
  // own (home, PLP, info, contact, account, cart) gets a proper social-share
  // card. og:image comes from app/opengraph-image.tsx automatically. The PDP
  // overrides title/description/image via its own generateMetadata.
  openGraph: {
    type: "website",
    siteName: brand.storeName,
    title: brand.metadata.title,
    description: brand.metadata.description,
    url: brand.url,
  },
  twitter: {
    card: "summary_large_image",
    title: brand.metadata.title,
    description: brand.metadata.description,
  },
};

// Organization JSON-LD — site-wide entity-signal som søgemaskiner og
// AI-agenter bruger til at forstå "hvem" der står bag shoppen.
const organizationJsonLd: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: brand.storeName,
  url: brand.url,
  description: brand.metadata.description,
  logo: `${brand.url}/icon`,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // v0.7.0: Design Registry → DesignPack-tokens emittes FØRST, derefter
  // override fra BrandingSettings.themeJson (themeToInlineCss). Last-write-
  // wins betyder per-shop palette-finjustering (themeJson) altid overrider
  // design-pakkens default palette uden at skifte design.
  //
  // Pre-v0.7.0 var det kun themeJson — designs/index.ts sørger nu for at
  // hver pakke kommer med sin egen palette så fresh-fork shops får et
  // konsistent look out-of-the-box uden at admin behøver tune palette.
  const [design, theme] = await Promise.all([getActiveDesign(), getActiveTheme()]);
  const designCss = design ? designToInlineCss(design) : null;
  // v0.9.4: en eksplicit themeJson (theme) vinder altid. Ellers, hvis det
  // aktive design er IMPORTERET (applyPaletteAsTheme), mapper vi dets palette
  // til både sol-* (chrome) og cw-* (Studio-atoms) så hele shoppen adopterer
  // designets farver mens det er aktivt. Built-in designs sætter ikke flaget.
  const themeCss = theme
    ? design?.applyPaletteAsTheme
      // themeJson present AND the active design composes the cw-* section atoms
      // (Aurora): emit the brand palette to sol-* (+ fonts/radius) AND cw-* so the
      // atoms adopt the shop's colours too. For non-atom designs (prefix "sol":
      // webshop-classic, saas-dark) applyPaletteAsTheme is unset → unchanged.
      ? `${themeToInlineCss(theme)}\n${paletteToFullThemeCss(theme)}`
      : themeToInlineCss(theme)
    : design?.applyPaletteAsTheme
      ? paletteToFullThemeCss(design.tokens.palette)
      : null;
  const locale = await getLocale();

  // Phase 10 Slice 5: consent + analytics + GSC. Alt er flag-gated så solbriller
  // kan rulle ud uafhængigt. brand.features.consentBanner styrer om banneret
  // overhovedet renderes; analyticsGa4 + env-var styrer GA4-script-injection.
  const features = brand.features as {
    consentBanner?: boolean;
    analyticsGa4?: boolean;
  };
  const consent = features.consentBanner ? await getConsent() : null;
  const gsc = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const ga4Id = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim();
  const showGa4 = Boolean(features.analyticsGa4 && ga4Id);

  // SEO-indeksering: ved "noindex" injiceres meta robots så HTML-sider de-
  // indekseres (belt-and-suspenders ovenpå robots.txt). Default public = intet.
  const seo = await getSeoSettings();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {seo.indexing === "noindex" && (
          <meta name="robots" content="noindex, nofollow" />
        )}
        <JsonLd data={organizationJsonLd} />
        {gsc && <meta name="google-site-verification" content={gsc} />}
        {/* WebMCP origin-trial token (Chrome 149): server-emitted ved parse-tid
            så in-browser-agenter får tools UDEN chrome://flags. Kun når webMcp +
            token-env er sat (default-off → intet emitteres). Se components/WebMcpRegistrar. */}
        {brand.features.webMcp && process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN && (
          <meta
            httpEquiv="origin-trial"
            content={process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN}
          />
        )}
        {designCss && (
          <style
            id="design-pack-tokens"
            dangerouslySetInnerHTML={{ __html: designCss }}
          />
        )}
        {themeCss && (
          <style
            id="brand-theme-override"
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        {/* v0.24.2: dark mode er scopet til admin. Storefront renderer ALTID sit
            brand-tema (lyst for coffee/Solbrillen; mørkt-via-isSaas for Teloz) —
            OS-dark lækker ikke længere ind via enableSystem. Admin-ThemeToggle
            kalder setTheme("dark") eksplicit, hvilket next-themes honorerer uanset
            enableSystem. Se planen i docs / CHANGELOG v0.24.2. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {consent ? (
            <ConsentProvider initial={consent}>
              {showGa4 && <GoogleAnalytics measurementId={ga4Id!} />}
              {children}
              <ConsentBanner locale={locale} />
            </ConsentProvider>
          ) : (
            children
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
