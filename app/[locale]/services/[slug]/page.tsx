import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";
import AnimatedPageContent from "@/app/[locale]/info/[slug]/AnimatedPageContent";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";
import { homeBreadcrumbLabel } from "@/lib/breadcrumbs";
import { getBrand } from "@/lib/brand";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import { buildLocalizedPageMetadata } from "@/lib/localized-page-metadata";
import { buildServiceJsonLd } from "@/lib/service-jsonld";
import { brand as brandConfig } from "@/brand.config";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const isSaas =
    !brandConfig.ecommerceEnabled && brandConfig.industryTemplate === "saas";
  if (!isSaas) notFound();
  const slug = decodeURIComponent(rawSlug);
  const service = await prisma.service.findUnique({ where: { slug } });
  const brand = await getBrand();
  // A draft service is invisible to the public — same as not found.
  if (!service || service.status !== "published") return { title: `Ydelse ikke fundet | ${brand.storeName}` };

  const pageTitle = await getDynamicTranslation(
    service,
    "title",
    service.title,
    locale,
  );
  const description = await getDynamicTranslation(
    service,
    "shortDescription",
    service.shortDescription ?? "",
    locale,
  );

  return buildLocalizedPageMetadata({
    locale,
    pathTemplate: `/{locale}/services/${encodeURIComponent(slug)}`,
    baseUrl: brand.url,
    siteName: brand.storeName,
    title: `${pageTitle} | ${brand.storeName}`,
    description: description || brand.metadata.description,
    imageUrl: service.heroImage,
  });
}

/**
 * Schema.org structured data for a service-detail page — Teloz's website-mode
 * canary ships its PRIMARY citable content (agency offerings) here, so the
 * `Service` + `BreadcrumbList` blocks let Google and AI agents understand and
 * cite it. Server-rendered, purely additive (no visible change). We deliberately
 * emit NO `Offer`: `priceString` is freeform admin copy ("fra 5.000 kr.",
 * "Kontakt os") that can't be trusted to parse into a numeric price.
 */
export default async function ServiceDetailPage({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const isSaas =
    !brandConfig.ecommerceEnabled && brandConfig.industryTemplate === "saas";
  if (!isSaas) notFound();
  const slug = decodeURIComponent(rawSlug);

  const service = await prisma.service.findUnique({ where: { slug } });
  // Only published services reach the storefront; a draft renders as not-found.
  if (!service || service.status !== "published") notFound();

  // Locale-aware title + short description, computed up-front so every render
  // path (vibeHtml + default) can emit the same structured data.
  const pageTitle = await getDynamicTranslation(
    service,
    "title",
    service.title,
    locale,
  );
  const shortDescription = await getDynamicTranslation(
    service,
    "shortDescription",
    service.shortDescription ?? "",
    locale,
  );
  const brand = await getBrand();
  const jsonLd = buildServiceJsonLd(service, {
    title: pageTitle,
    description: shortDescription,
    brandUrl: brand.url,
    brandName: brand.storeName,
    locale,
  });

  // If service contains vibe-coded HTML layout, render it directly
  if (service.vibeHtml) {
    let normalizedHtml = service.vibeHtml.replace(/className=/g, "class=");
    normalizedHtml = normalizedHtml.replace(/htmlFor=/g, "for=");
    return (
      <>
        <JsonLd data={jsonLd} />
        <div
          className="bg-[#0A0A0A] text-white min-h-screen"
          dangerouslySetInnerHTML={{ __html: normalizedHtml }}
        />
      </>
    );
  }

  // Locale-aware body (falls back to base text).
  const body = await getDynamicTranslation(service, "body", service.body);
  const blocks = renderContentBlocks(body);

  // We pass the data to the client component to handle Framer Motion animations
  return (
    <>
      <JsonLd data={jsonLd} />
      {/* Visible breadcrumb trail (mirrors the BreadcrumbList JSON-LD; rendered
          server-side since AnimatedPageContent is a client component). */}
      {brand.features.breadcrumbs ? (
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              // Labels mirror this page's BreadcrumbList JSON-LD exactly.
              { label: homeBreadcrumbLabel(locale), href: `/${locale}` },
              {
                label: locale === "da" ? "Ydelser" : "Services",
                href: `/${locale}/services`,
              },
              { label: pageTitle },
            ]}
          />
        </div>
      ) : null}
      <AnimatedPageContent
        page={{ title: pageTitle, heroImage: service.heroImage }}
        blocks={blocks}
      />
    </>
  );
}
