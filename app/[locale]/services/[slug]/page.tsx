import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";
import AnimatedPageContent from "@/app/[locale]/info/[slug]/AnimatedPageContent";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const service = await prisma.service.findUnique({ where: { slug } });
  const brand = await getBrand();

  const pageTitle = service?.title || "Ydelse ikke fundet";

  return { 
    title: `${pageTitle} | ${brand.storeName}`,
    description: service?.shortDescription || undefined
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

  const blocks = renderContentBlocks(service.body);

  // We pass the data to the client component to handle Framer Motion animations
  return (
    <AnimatedPageContent 
      page={{ title: service.title, heroImage: service.heroImage }} 
      blocks={blocks} 
    />
  );
}
