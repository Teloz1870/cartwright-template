import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";
import AnimatedPageContent from "./AnimatedPageContent";

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);
  const page = await prisma.page.findUnique({ where: { slug } });

  let pageTitle = page?.metaTitle || page?.title || "Side ikke fundet";
  
  if (locale === "en" && page?.translations) {
    const translations = page.translations as any;
    if (translations?.en?.title) pageTitle = translations.en.title;
  }

  return { 
    title: pageTitle,
    description: page?.metaDescription || undefined
  };
}

export default async function InfoPage({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);

  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) notFound();

  let pageTitle = page.title;
  let pageBody = page.body;
  let activeVibeHtml = page.vibeHtml;

  if (locale === "en" && page.translations) {
    const translations = page.translations as any;
    if (translations?.en?.title) pageTitle = translations.en.title;
    if (translations?.en?.body) pageBody = translations.en.body;
    if (translations?.en?.vibeHtml) activeVibeHtml = translations.en.vibeHtml;
  }

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

  // We pass the data to the client component to handle Framer Motion animations
  return (
    <AnimatedPageContent 
      page={{ title: pageTitle, heroImage: page.heroImage }} 
      blocks={blocks} 
    />
  );
}
