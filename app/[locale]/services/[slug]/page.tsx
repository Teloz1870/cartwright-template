import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";
import AnimatedPageContent from "@/app/[locale]/info/[slug]/AnimatedPageContent";
import { getBrand } from "@/lib/brand";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const service = await prisma.service.findUnique({ where: { slug } });
  const brand = await getBrand();
  if (!service) return { title: `Ydelse ikke fundet | ${brand.storeName}` };

  const pageTitle = await getDynamicTranslation(service, "title", service.title);
  const description = await getDynamicTranslation(
    service,
    "shortDescription",
    service.shortDescription ?? "",
  );

  return {
    title: `${pageTitle} | ${brand.storeName}`,
    description: description || undefined,
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const service = await prisma.service.findUnique({ where: { slug } });
  if (!service) notFound();

  // If service contains vibe-coded HTML layout, render it directly
  if (service.vibeHtml) {
    let normalizedHtml = service.vibeHtml.replace(/className=/g, "class=");
    normalizedHtml = normalizedHtml.replace(/htmlFor=/g, "for=");
    return (
      <div
        className="bg-[#0A0A0A] text-white min-h-screen"
        dangerouslySetInnerHTML={{ __html: normalizedHtml }}
      />
    );
  }

  // Locale-aware title + body (falls back to base text).
  const pageTitle = await getDynamicTranslation(service, "title", service.title);
  const body = await getDynamicTranslation(service, "body", service.body);
  const blocks = renderContentBlocks(body);

  // We pass the data to the client component to handle Framer Motion animations
  return (
    <AnimatedPageContent
      page={{ title: pageTitle, heroImage: service.heroImage }}
      blocks={blocks}
    />
  );
}
