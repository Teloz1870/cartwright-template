import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { brand } from "@/brand.config";
import { getActiveTheme, themeToInlineCss } from "@/lib/theme";
import JsonLd from "@/components/JsonLd";
import { ThemeProvider } from "@/components/ThemeProvider";
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

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <JsonLd data={organizationJsonLd} />
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
