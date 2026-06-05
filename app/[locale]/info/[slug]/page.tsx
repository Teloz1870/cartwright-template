import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";
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
