import type { Metadata } from "next";
import { hreflangFor } from "@/i18n/routing";
import { ogImageUrl, ogLocale, pageOg, toAbsoluteUrl } from "@/lib/og";

type LocalizedPageMetadataInput = {
  locale: string;
  pathTemplate: string;
  baseUrl: string;
  siteName: string;
  title: string;
  description: string;
  imageUrl?: string | null;
};

/**
 * Complete metadata contract for a public locale route.
 *
 * Keeping this in one helper prevents page-specific metadata from silently
 * dropping canonical, hreflang, Open Graph URL/locale, or Twitter imagery.
 * `pathTemplate` must contain `{locale}` and begin with `/`.
 */
export function buildLocalizedPageMetadata({
  locale,
  pathTemplate,
  baseUrl,
  siteName,
  title,
  description,
  imageUrl,
}: LocalizedPageMetadataInput): Metadata {
  const path = pathTemplate.replace("{locale}", locale);
  const canonical = toAbsoluteUrl(path, baseUrl);
  const resolvedImage = toAbsoluteUrl(
    imageUrl || ogImageUrl(title, description),
    baseUrl,
  );
  const social = pageOg(title, description, resolvedImage);

  return {
    title,
    description: description || undefined,
    alternates: {
      canonical,
      languages: hreflangFor(pathTemplate, baseUrl),
    },
    openGraph: {
      ...social.openGraph,
      type: "website",
      siteName,
      url: canonical,
      locale: ogLocale(locale),
    },
    twitter: social.twitter,
  };
}
