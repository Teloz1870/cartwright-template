import type { Metadata } from "next";
import localFont from "next/font/local";
import "./fonts/geist/faces.css";
import "./fonts/geist-mono/faces.css";
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
import { resolveMotionAttr } from "@/lib/motion";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConsentProvider } from "@/components/ConsentProvider";
import ConsentBanner from "@/components/ConsentBanner";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { getConsent } from "@/lib/consent-server";
import { getSeoSettings } from "@/lib/seo-settings";
import { getLocale } from "next-intl/server";
import { getBrand } from "@/lib/brand";

// Self-hosted: the files `next/font/google` used to fetch on every cold build
// (FONT1 — that fetch flaked red builds). The latin face is preloaded here; the
// other subsets Google serves (latin-ext, Cyrillic, Vietnamese, symbols) live in
// faces.css and load only for a character in their range, exactly as before.
// Re-fetch with `node scripts/fonts/fetch.mjs` (the call is in each fonts.json).
// Turbopack names a local font's family — and its CSS variable — after the
// binding, and design packs name these families literally in their tokens
// (`sans: "Geist, …"`, `mono: "Geist Mono, …"`). So the sans binding IS the
// family name; "Geist Mono" has a space no binding can carry, so its face is
// declared under that name and the variable lists it after the binding's inert
// one (`"GeistMono", "Geist Mono", "Geist Mono Fallback"`). The fallback faces
// come from faces.css with the metrics next/font/google used.
const Geist = localFont({
  src: [{ path: "./fonts/geist/geist-latin-normal-100-900.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
  adjustFontFallback: false,
  fallback: ["Geist Fallback"],
  variable: "--font-geist-sans",
});

const GeistMono = localFont({
  src: [{ path: "./fonts/geist-mono/geist-mono-latin-normal-100-900.woff2", weight: "100 900", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "Geist Mono" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
  adjustFontFallback: false,
  fallback: ["Geist Mono", "Geist Mono Fallback"],
  variable: "--font-geist-mono",
});

// Brand-config driver titel/description så fork-shops kun rediger brand.config.ts
export async function generateMetadata(): Promise<Metadata> {
  const resolved = await getBrand();
  return {
  metadataBase: new URL(resolved.url),
  title: resolved.metadata.title,
  description: resolved.metadata.description,
  // Site-wide Open Graph / Twitter defaults so EVERY page that doesn't set its
  // own (home, PLP, info, contact, account, cart) gets a proper social-share
  // card. og:image comes from app/opengraph-image.tsx automatically. The PDP
  // overrides title/description/image via its own generateMetadata.
  openGraph: {
    type: "website",
    siteName: resolved.storeName,
    title: resolved.metadata.title,
    description: resolved.metadata.description,
    url: resolved.url,
  },
  twitter: {
    card: "summary_large_image",
    title: resolved.metadata.title,
    description: resolved.metadata.description,
  },
  };
}

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
  const [design, theme, resolvedBrand] = await Promise.all([getActiveDesign(), getActiveTheme(), getBrand()]);
  const companySameAs = resolvedBrand.company.sameAs ?? [];
  const organizationJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: resolvedBrand.storeName,
    legalName: resolvedBrand.company.legalName || resolvedBrand.storeName,
    url: resolvedBrand.url,
    description: resolvedBrand.metadata.description,
    logo: `${resolvedBrand.url}/icon`,
    ...(companySameAs.length > 0
      ? { sameAs: companySameAs }
      : {}),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: resolvedBrand.contact.email || resolvedBrand.emails.support,
      telephone: resolvedBrand.contact.phone || undefined,
      availableLanguage: resolvedBrand.locales,
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: resolvedBrand.company.address,
      postalCode: resolvedBrand.company.postalCode,
      addressLocality: resolvedBrand.company.city,
      addressRegion: resolvedBrand.company.region || undefined,
      addressCountry: resolvedBrand.company.country,
    },
  };
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

  // Motion & Effects (PART 4): master flag default-off ⇒ data-motion="off" ⇒
  // ingen effekt-regler i themes/motion.css matcher ⇒ byte-identisk canary-
  // render. Når motionEffects er on skalerer den valgte preset (subtle/bold)
  // hele feel'en. Læses compile-time fra brand.config (redeploy for at ændre);
  // en DB-override (motionPresetJson) er en bevidst senere follow-up.
  const motionAttr = resolveMotionAttr(brand.features, brand.motionPreset);

  return (
    <html
      lang={locale}
      data-motion={motionAttr}
      className={`${Geist.variable} ${GeistMono.variable} h-full antialiased`}
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
            token-env er sat (default-off → intet emitteres). RUNTIME-opløst
            (resolvedBrand) som alle andre webMcp-gates — flaget er runtime-tier,
            og en admin-tænding skal også tænde tokenet uden deploy. */}
        {resolvedBrand.features.webMcp && process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN && (
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
        {/* Dark-mode-modellen (fix/dark-mode-unify): ÉN switch, ejet af `.dark`
            klassen på <html>. globals.css' `@custom-variant dark` re-keyer alle
            `dark:`-utilities til samme klasse som token-overrides i
            themes/generic.css — OS-dark alene ændrer INTET (enableSystem=false +
            color-scheme styres i globals.css). Ingen UI sætter pt. `.dark`:
            admin-ThemeToggle'en er fjernet (admin må ikke temae kundens store-
            front; admin er altid lys via [data-admin-skin]). En evt. tidligere
            PERSISTERET localStorage `theme=dark` honoreres stadig af next-themes
            — det er nu harmløst, fordi utilities + tokens flipper sammen
            (kohærent mørk storefront, admin upåvirket). Storefront-dark som
            per-design opt-in er Phase 3. Kontrakt-test:
            tests/unit/dark-mode-contract.test.ts. */}
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
