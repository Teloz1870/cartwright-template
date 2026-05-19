import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { brand } from "@/brand.config";
import { getActiveTheme, themeToInlineCss } from "@/lib/theme";
import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIStylistButton from "@/components/AIStylistButton";

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
  title: brand.metadata.title,
  description: brand.metadata.description,
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

  return (
    <html
      lang="da"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {themeCss && (
          <style
            id="brand-theme-override"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <AnnouncementBar />
        <Header />
        <main className="min-h-[60vh]">{children}</main>
        <Footer />
        {/* Feature-flag: shops uden AI-stylist (fx panel-hegn) skipper denne mount */}
        {brand.features.aiStylist && <AIStylistButton />}
      </body>
    </html>
  );
}
