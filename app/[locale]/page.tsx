import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";
import { getDesign, inferDesignFromIndustry } from "@/designs";

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
  const [featured, categories, settings, homePage] = await Promise.all([
    prisma.product.findMany({
      where: { featured: true, deletedAt: null },
      take: 4,
    }),
    prisma.category.findMany({ take: 3 }),
    prisma.brandingSettings.findFirst(),
    prisma.page.findUnique({ where: { slug: "home" } }),
  ]);

  // i18n locale-override: hvis EN, swap fra translations-JSON.
  if (locale === "en") {
    featured.forEach((p) => {
      if (p.translations) {
        const translations = p.translations as any;
        if (translations?.en?.name) p.name = translations.en.name;
        if (translations?.en?.description) p.description = translations.en.description;
      }
    });
    categories.forEach((c) => {
      if (c.translations) {
        const translations = c.translations as any;
        if (translations?.en?.name) c.name = translations.en.name;
      }
    });
  }

  const ecommerceEnabled = settings?.ecommerceEnabled ?? brand.ecommerceEnabled;
  const industryTemplate = settings?.industryTemplate || brand.industryTemplate;

  // ──────────────────────────────────────────────────────────────────────
  // 1. VIBE TEMPLATE MODE (Software 3.0) — overstyrer ALT design-valg.
  // ──────────────────────────────────────────────────────────────────────
  if (homePage?.vibeHtml) {
    const translations = homePage.translations as Record<string, { vibeHtml?: string }> | null;
    const localizedHtml = translations?.[locale]?.vibeHtml ?? homePage.vibeHtml;
    return (
      <div
        className="vibe-container w-full"
        dangerouslySetInnerHTML={{ __html: localizedHtml }}
      />
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2. Design-pakke resolver (designSlug i DB > inferens fra industry).
  // ──────────────────────────────────────────────────────────────────────
  const designSlug =
    settings?.designSlug ??
    inferDesignFromIndustry(industryTemplate, Boolean(ecommerceEnabled));
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
  return (
    <Homepage
      settings={settings}
      locale={locale}
      featured={featured}
      categories={categories}
    />
  );
}
