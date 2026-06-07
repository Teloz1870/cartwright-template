import { notFound } from "next/navigation";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";
import { resolvePageLayout } from "@/lib/builder/page-layout";
import { buildPageSectionsJsonLd } from "@/lib/builder/section-jsonld";
import { PageSections } from "@/components/builder/PageSections";
import JsonLd from "@/components/JsonLd";
import { isAnnotateEditEnabled } from "@/lib/annotate/server";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import { pageOg, toAbsoluteUrl } from "@/lib/og";
import AnimatedPageContent from "./AnimatedPageContent";
import { getDefaultLegalContent } from "@/lib/legal/default-content";

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) {
    const fallback = getDefaultLegalContent(slug, locale);
    if (fallback) return { title: fallback.title, ...pageOg(fallback.title, "") };
    return { title: "Side ikke fundet" };
  }

  // metaTitle (per-locale via translations) wins; else the localized title.
  const pageTitle = page.metaTitle || (await getDynamicTranslation(page, "title", page.title));
  const description = page.metaDescription || "";

  return {
    title: pageTitle,
    description: description || undefined,
    // Prefer the page's hero photo for the share card; else a generated card.
    ...pageOg(pageTitle, description, page.heroImage ? toAbsoluteUrl(page.heroImage) : undefined),
  };
}

export default async function InfoPage({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);

  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) {
    // Default legal-indhold (privacy/terms/cookies) så footer-links ikke 404'er
    // på en frisk shop. En CMS-Page med samme slug overskriver dette.
    const fallback = getDefaultLegalContent(slug, locale);
    if (fallback) {
      const blocks = renderContentBlocks(fallback.body);
      return (
        <AnimatedPageContent
          page={{ title: fallback.title, heroImage: null }}
          blocks={blocks}
          editEnabled={false}
          slug={slug}
        />
      );
    }
    notFound();
  }

  // Locale-aware via brand.config locales (falls back to base text).
  const pageTitle = await getDynamicTranslation(page, "title", page.title);
  const pageBody = await getDynamicTranslation(page, "body", page.body);
  const activeVibeHtml = await getDynamicTranslation(page, "vibeHtml", page.vibeHtml ?? "");

  // If page contains vibe-coded HTML layout, render it directly
  if (activeVibeHtml) {
    let normalizedHtml = activeVibeHtml.replace(/className=/g, "class=");
    normalizedHtml = normalizedHtml.replace(/htmlFor=/g, "for=");
    return (
      <div 
        className="bg-[#0A0A0A] text-white min-h-screen"
        dangerouslySetInnerHTML={{ __html: normalizedHtml }}
      />
    );
  }

  // Visual Builder: hvis flag on OG siden har et godkendt section-tree, render
  // det. Begge betingelser kræves, så flag-off ELLER layoutJson===null bevarer
  // den eksisterende body-render uændret (canary-safe). resolvePageLayout
  // returnerer [] ved invalid JSON → vi falder igennem til body-render.
  if (brand.features.visualBuilderEnabled && page.layoutJson) {
    const sections = resolvePageLayout(page.layoutJson);
    if (sections.length > 0) {
      // Emit Schema.org JSON-LD derived from the section data (FAQPage, HowTo,
      // Review, ImageGallery, ItemList) so AI search engines can cite this
      // builder-built page. Server-rendered; canary-safe (only fires when a page
      // has layoutJson — no canary does).
      const sectionLd = buildPageSectionsJsonLd(sections, {
        baseUrl: brand.url,
        orgName: brand.storeName,
      });
      return (
        <>
          {sectionLd.length > 0 ? <JsonLd data={sectionLd} /> : null}
          <PageSections sections={sections} />
        </>
      );
    }
  }

  const blocks = renderContentBlocks(pageBody);
  const editEnabled = await isAnnotateEditEnabled();

  // We pass the data to the client component to handle Framer Motion animations
  return (
    <AnimatedPageContent
      page={{ title: pageTitle, heroImage: page.heroImage }}
      blocks={blocks}
      editEnabled={editEnabled}
      slug={slug}
    />
  );
}
