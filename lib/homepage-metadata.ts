import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { hreflangFor } from "@/i18n/routing";

/**
 * Shared locale-home metadata for both database and static scaffold profiles.
 *
 * A child `openGraph` object replaces the parent metadata object rather than
 * deep-merging it. Keep the generated social image explicit here so adding a
 * locale-aware canonical never silently drops `og:image`/`twitter:image`.
 */
export async function buildHomepageMetadata(locale: string): Promise<Metadata> {
  const resolved = await getBrand();
  const base = resolved.url.replace(/\/$/, "");
  const canonical = `${base}/${locale}`;
  const socialImage = `${base}/opengraph-image`;

  return {
    title: resolved.metadata.title,
    description: resolved.metadata.description,
    alternates: {
      canonical,
      languages: hreflangFor("/{locale}", resolved.url),
    },
    openGraph: {
      type: "website",
      siteName: resolved.storeName,
      title: resolved.metadata.title,
      description: resolved.metadata.description,
      url: canonical,
      images: [{
        url: socialImage,
        width: 1200,
        height: 630,
        alt: resolved.storeName,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: resolved.metadata.title,
      description: resolved.metadata.description,
      images: [socialImage],
    },
  };
}
