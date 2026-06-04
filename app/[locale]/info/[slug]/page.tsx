import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";
import { isAnnotateEditEnabled } from "@/lib/annotate/server";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import AnimatedPageContent from "./AnimatedPageContent";

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return { title: "Side ikke fundet" };

  // metaTitle (per-locale via translations) wins; else the localized title.
  const pageTitle = page.metaTitle || (await getDynamicTranslation(page, "title", page.title));

  return {
    title: pageTitle,
    description: page.metaDescription || undefined,
  };
}

export default async function InfoPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) notFound();

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
