import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { getDesign, inferDesignFromIndustry } from "@/designs";
import { getFeatures } from "@/lib/brand";
import { getActiveThreeDConfig } from "@/lib/three/resolve";
import JsonLd from "@/components/JsonLd";

/**
 * Homepage entrypoint — fetches shared data og delegerer rendering til
 * den valgte design-pakke.
 *
 * v0.7.0 redesign: tidligere hardcoded if/else på industryTemplate. Nu
 * resolver vi en DesignPack via designs/index.ts og kalder dens .homepage-
 * komponent. Three priorities for design-valg (i rækkefølge):
 *
 *   1. VIBE-template (Software 3.0 raw HTML) — full takeover hvis sat
 *   2. settings.designSlug fra DB (eksplicit valg fra /admin/setup)
 *   3. inferDesignFromIndustry() — backwards-compat for shops < v0.7.0
 *
 * Data-fetching forbliver hér (single source-of-truth) — designs får
 * data ind som props. Sparer N round-trips og holder designs
 * server-component-kompatible.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Phase-E hotfix (2026-05-27): wrap Prisma-calls i .catch() så DB-fejl
  // (Turso schema-drift på en canary, build-time uden DB endnu, osv.)
  // IKKE 500-rammer homepage. Sites'et degraderer til "ingen featured
  // products / kategorier / DB-overrides" men loader stadig.
  // Same defensive pattern som components/Footer.tsx + components/Header.tsx.
  const [featured, categories, settings, homePage] = await Promise.all([
    prisma.product.findMany({
      where: { featured: true, deletedAt: null },
      take: 4,
    }).catch((err) => {
      console.error("[home] product.findMany failed, falling back to []:", err);
      return [];
    }),
    prisma.category.findMany({ take: 3 }).catch((err) => {
      console.error("[home] category.findMany failed, falling back to []:", err);
      return [];
    }),
    prisma.brandingSettings.findFirst().catch((err) => {
      console.error("[home] brandingSettings.findFirst failed, falling back to null:", err);
      return null;
    }),
    prisma.page.findUnique({ where: { slug: "home" } }).catch((err) => {
      console.error("[home] page.findUnique failed, falling back to null:", err);
      return null;
    }),
  ]);

  // i18n locale-override: hvis EN, swap fra translations-JSON.
  if (locale === "en") {
    featured.forEach((p) => {
      if (p.translations) {
        const translations = p.translations as { en?: { name?: string; description?: string } } | null;
        if (translations?.en?.name) p.name = translations.en.name;
        if (translations?.en?.description) p.description = translations.en.description;
      }
    });
    categories.forEach((c) => {
      if (c.translations) {
        const translations = c.translations as { en?: { name?: string } } | null;
        if (translations?.en?.name) c.name = translations.en.name;
      }
    });
  }

  // Phase H (2026-05-29): in website-mode, IDENTITY comes from brand.config —
  // not the DB row. Prevents a contaminated/shared DB from flipping a corporate
  // site into a webshop (the Teloz↔Northbound coffee incident). Cosmetics
  // (logo/theme) can still come from the DB via getBrand(); identity cannot.
  const isWebsiteMode = brand.mode === "website";
  const ecommerceEnabled = isWebsiteMode
    ? false
    : (settings?.ecommerceEnabled ?? brand.ecommerceEnabled);
  const industryTemplate = isWebsiteMode
    ? brand.industryTemplate
    : (settings?.industryTemplate || brand.industryTemplate);

  // JSON-LD WebSite — beskriver sitet som helhed (supplerer Organization i
  // root-layout). Gælder begge modes; AI/crawlers bruger den til at forstå
  // navn+domæne. SearchAction kun i webshop-mode (website-mode har ingen
  // /produkter-søgerute), så vi ikke annoncerer en sitelinks-søgeboks der 404'er.
  const websiteJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.storeName,
    url: brand.url,
    description: brand.metadata.description,
    ...(ecommerceEnabled
      ? {
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${brand.url}/produkter?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
          },
        }
      : {}),
  };

  // ──────────────────────────────────────────────────────────────────────
  // 1. VIBE TEMPLATE MODE (Software 3.0) — overstyrer ALT design-valg.
  // ──────────────────────────────────────────────────────────────────────
  if (homePage?.vibeHtml) {
    const translations = homePage.translations as Record<string, { vibeHtml?: string }> | null;
    const localizedHtml = translations?.[locale]?.vibeHtml ?? homePage.vibeHtml;
    return (
      <>
        <JsonLd data={websiteJsonLd} />
        <div
          className="vibe-container w-full"
          dangerouslySetInnerHTML={{ __html: localizedHtml }}
        />
      </>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2. Design-pakke resolver (designSlug i DB > inferens fra industry).
  // ──────────────────────────────────────────────────────────────────────
  const designSlug = isWebsiteMode
    ? inferDesignFromIndustry(brand.industryTemplate, false)
    : (settings?.designSlug ??
      inferDesignFromIndustry(industryTemplate, Boolean(ecommerceEnabled)));
  const design = getDesign(designSlug);

  if (!design) {
    // Ukendt slug i DB (fx admin har sat designSlug='nonsense' eller en
    // imported design er blevet uninstalled). Bedre at 404 end at render
    // blank — admin kan så fixe i /admin/setup.
    console.error(
      `[home] Unknown designSlug "${designSlug}" — falling back to notFound. ` +
        `Fix via /admin/setup or set BrandingSettings.designSlug to a valid value.`,
    );
    notFound();
  }

  // ──────────────────────────────────────────────────────────────────────
  // 3. Render valgte design med shared data.
  // ──────────────────────────────────────────────────────────────────────
  const Homepage = design.homepage;

  // Cartwright Live Canvas — resolve flag + scene config server-side and thread
  // it down. Design packs that support a 3D hero opt in by reading props.threeD.
  const [features, threeDConfig] = await Promise.all([
    getFeatures(),
    getActiveThreeDConfig(),
  ]);

  return (
    <>
      <JsonLd data={websiteJsonLd} />
      <Homepage
        settings={settings}
        locale={locale}
        featured={featured}
        categories={categories}
        threeD={{
          enabled: Boolean(features.threeD),
          scene: threeDConfig.scene,
          intensity: threeDConfig.intensity,
        }}
      />
    </>
  );
}
