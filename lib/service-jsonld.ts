import { toAbsoluteUrl } from "@/lib/og";

type PublicServiceForJsonLd = {
  slug: string;
  heroImage: string | null;
};

/** Build locale-correct Service and BreadcrumbList structured data. */
export function buildServiceJsonLd(
  service: PublicServiceForJsonLd,
  opts: {
    title: string;
    description: string;
    brandUrl: string;
    brandName: string;
    locale: string;
  },
): Array<Record<string, unknown>> {
  const { title, description, brandUrl, brandName, locale } = opts;
  const baseUrl = brandUrl.replace(/\/+$/, "");
  const localeHomeUrl = `${baseUrl}/${locale}`;
  const servicesUrl = `${localeHomeUrl}/services`;
  const serviceUrl = `${servicesUrl}/${encodeURIComponent(service.slug)}`;

  const serviceLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: title,
    url: serviceUrl,
    provider: { "@type": "Organization", name: brandName, url: baseUrl },
  };
  if (description) serviceLd.description = description;
  if (service.heroImage) {
    serviceLd.image = toAbsoluteUrl(service.heroImage, baseUrl);
  }

  const homeLabel = locale === "da" ? "Forside" : "Home";
  const servicesLabel = locale === "da" ? "Ydelser" : "Services";
  const breadcrumbLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: homeLabel,
        item: localeHomeUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: servicesLabel,
        item: servicesUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: serviceUrl,
      },
    ],
  };

  return [serviceLd, breadcrumbLd];
}
