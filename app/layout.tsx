import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { brand } from "@/brand.config";
import { getActiveTheme, themeToInlineCss } from "@/lib/theme";
import JsonLd from "@/components/JsonLd";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConsentProvider } from "@/components/ConsentProvider";
import ConsentBanner from "@/components/ConsentBanner";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { getConsent } from "@/lib/consent-server";
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
  // ULTRAPLAN-lite UL6: hvis admin har gemt theme via wizard, injicer
  // CSS-variabler runtime så de overrider themes/<slug>.css. Hvis ingen
  // theme i DB, falder vi tilbage til compile-time CSS (default-adfærd).
  const theme = await getActiveTheme();
  const themeCss = theme ? themeToInlineCss(theme) : null;
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

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <JsonLd data={organizationJsonLd} />
        {gsc && <meta name="google-site-verification" content={gsc} />}
        {themeCss && (
          <style
            id="brand-theme-override"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {consent ? (
            <ConsentProvider initial={consent}>
              {showGa4 && <GoogleAnalytics measurementId={ga4Id!} />}
              {children}
              <ConsentBanner />
            </ConsentProvider>
          ) : (
            children
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
