import { notFound } from "next/navigation";
import { fetchBrandingSettings } from "@/lib/data-source/brand";
import { brand } from "@/brand.config";
import { getDesign, type HomeGenomeCopy } from "@/designs";
import { readField } from "@/lib/genome/read";
import { decodeItems } from "@/lib/genome/list";
import { getFeatures, resolveStoreIdentity } from "@/lib/brand";
import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { hreflangFor } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const [{ locale }, resolved] = await Promise.all([params, getBrand()]);
  const canonical = `${resolved.url.replace(/\/$/, "")}/${locale}`;
  return {
    title: resolved.metadata.title,
    description: resolved.metadata.description,
    alternates: { canonical, languages: hreflangFor("/{locale}", resolved.url) },
    openGraph: { type: "website", siteName: resolved.storeName, title: resolved.metadata.title, description: resolved.metadata.description, url: canonical },
    twitter: { card: "summary_large_image", title: resolved.metadata.title, description: resolved.metadata.description },
  };
}

/**
 * B3 static seam variant — the `site`-profile homepage (site-profile
 * program). The materializer copies this file over `app/[locale]/page.tsx`
 * when the db module is not in the profile; NOTHING imports it in the
 * shipped engine (byte-identical until then).
 *
 * Same render path as the db variant — resolve identity, render the active
 * DesignPack with the shared copy chain (`settings ?? genome ?? brand.website`)
 * — with every DB-backed source at its documented no-data value:
 *
 *  - settings comes through the brand data-source seam (static → null,
 *    brand.config wins everywhere),
 *  - no featured products / categories (webshop module absent),
 *  - no vibe-HTML takeover and no first-run canvas (both live in the DB),
 *  - genome copy still resolves via the genome-store seam (static store →
 *    anchors), so Voice-less scaffolds render brand.website.* exactly like a
 *    db profile with an empty genome,
 *  - the 3D hero is off (the three-scenes plugin isn't in the profile).
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const settings = await fetchBrandingSettings().catch(() => null);

  const { ecommerceEnabled, designSlug } = resolveStoreIdentity(settings);

  // JSON-LD WebSite — same block as the db variant. A site profile has no
  // /produkter search route, so no SearchAction is advertised.
  const websiteJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.storeName,
    url: brand.url,
    description: brand.metadata.description,
  };
  void ecommerceEnabled;

  const design = getDesign(designSlug);
  if (!design) {
    console.error(
      `[home] Unknown designSlug "${designSlug}" — falling back to notFound. ` +
        `Set brand.config.ts designSlug to a design included in this profile.`,
    );
    notFound();
  }

  const Homepage = design.homepage;
  const features = await getFeatures();

  // Voice/Genome copy — identical chain to the db variant. The genome-store
  // seam's static variant returns an empty genome, so every readField yields
  // its anchor (= the matching brand.website.* value).
  let homeGenome: HomeGenomeCopy | undefined;
  if (features.genomeResolve) {
    const [
      eyebrow,
      hHeadline,
      hTagline,
      hCta,
      vpTitle,
      vpDesc,
      ftTitle,
      ftDesc,
      cfTitle,
      cfDesc,
      cfCta,
      vpItems,
      ftItems,
      shHeroTitle,
      shHeroSub,
      shHeroCta,
      shPitchTitle,
      shPitchBody,
    ] = await Promise.all([
      readField("home.hero.eyebrow"),
      readField("home.hero.headline"),
      readField("home.hero.tagline"),
      readField("home.hero.cta"),
      readField("home.valueProps.title"),
      readField("home.valueProps.description"),
      readField("home.features.title"),
      readField("home.features.description"),
      readField("home.ctaFooter.title"),
      readField("home.ctaFooter.description"),
      readField("home.ctaFooter.cta"),
      readField("home.valueProps.items"),
      readField("home.features.items"),
      readField("shop.hero.title"),
      readField("shop.hero.subtagline"),
      readField("shop.hero.cta"),
      readField("shop.pitch.title"),
      readField("shop.pitch.body"),
    ]);
    homeGenome = {
      hero: { eyebrow, headline: hHeadline, tagline: hTagline, cta: hCta },
      valueProps: { title: vpTitle, description: vpDesc },
      valuePropsItems: decodeItems(vpItems),
      features: { title: ftTitle, description: ftDesc },
      featuresItems: decodeItems(ftItems),
      ctaFooter: { title: cfTitle, description: cfDesc, cta: cfCta },
      shop: {
        heroTitle: shHeroTitle,
        heroSubtagline: shHeroSub,
        heroCta: shHeroCta,
        pitchTitle: shPitchTitle,
        pitchBody: shPitchBody,
      },
    };
  }

  return (
    <>
      <JsonLd data={websiteJsonLd} />
      <Homepage
        settings={settings}
        locale={locale}
        featured={[]}
        categories={[]}
        threeD={{ enabled: false, scene: "aurora", intensity: 0.6 }}
        editEnabled={false}
        genome={homeGenome}
      />
    </>
  );
}
