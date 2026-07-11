import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderContentBlocks } from "@/lib/content";
import AnimatedPageContent from "@/app/[locale]/info/[slug]/AnimatedPageContent";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";
import { homeBreadcrumbLabel } from "@/lib/breadcrumbs";
import { getBrand } from "@/lib/brand";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import { pageOg, toAbsoluteUrl } from "@/lib/og";
import type { Service } from "@/app/generated/prisma/client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const service = await prisma.service.findUnique({ where: { slug } });
  const brand = await getBrand();
  // A draft service is invisible to the public — same as not found.
  if (!service || service.status !== "published") return { title: `Ydelse ikke fundet | ${brand.storeName}` };

  const pageTitle = await getDynamicTranslation(service, "title", service.title);
  const description = await getDynamicTranslation(
    service,
    "shortDescription",
    service.shortDescription ?? "",
  );

  return {
    title: `${pageTitle} | ${brand.storeName}`,
    description: description || undefined,
    ...pageOg(
      pageTitle,
      description,
      service.heroImage ? toAbsoluteUrl(service.heroImage) : undefined,
    ),
  };
}

/**
 * Schema.org structured data for a service-detail page — Teloz's website-mode
 * canary ships its PRIMARY citable content (agency offerings) here, so the
 * `Service` + `BreadcrumbList` blocks let Google and AI agents understand and
 * cite it. Server-rendered, purely additive (no visible change). We deliberately
 * emit NO `Offer`: `priceString` is freeform admin copy ("fra 5.000 kr.",
 * "Kontakt os") that can't be trusted to parse into a numeric price.
 */
function buildServiceJsonLd(
  service: Pick<Service, "slug" | "heroImage">,
  opts: { title: string; description: string; brandUrl: string; brandName: string; locale: string },
): Array<Record<string, unknown>> {
  const { title, description, brandUrl, brandName, locale } = opts;
  const serviceUrl = `${brandUrl}/services/${service.slug}`;

  const serviceLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: title,
    url: serviceUrl,
    provider: { "@type": "Organization", name: brandName, url: brandUrl },
  };
  if (description) serviceLd.description = description;
  if (service.heroImage) serviceLd.image = toAbsoluteUrl(service.heroImage);

  const homeLabel = homeBreadcrumbLabel(locale);
  const servicesLabel = locale === "da" ? "Ydelser" : "Services";
  const breadcrumbLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: homeLabel, item: brandUrl },
      { "@type": "ListItem", position: 2, name: servicesLabel, item: `${brandUrl}/services` },
      { "@type": "ListItem", position: 3, name: title, item: serviceUrl },
    ],
  };

  return [serviceLd, breadcrumbLd];
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);

  const service = await prisma.service.findUnique({ where: { slug } });
  // Only published services reach the storefront; a draft renders as not-found.
  if (!service || service.status !== "published") notFound();

  // Locale-aware title + short description, computed up-front so every render
  // path (vibeHtml + default) can emit the same structured data.
  const pageTitle = await getDynamicTranslation(service, "title", service.title);
  const shortDescription = await getDynamicTranslation(
    service,
    "shortDescription",
    service.shortDescription ?? "",
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
