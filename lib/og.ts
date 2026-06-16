import type { Metadata } from "next";
import { brand } from "@/brand.config";

/**
 * Per-page Open Graph / share-card helpers.
 *
 * `pageOg()` is spread into a page's `generateMetadata`/`metadata` so sharing
 * that URL unfurls a card with the page's own title + description — not the
 * site-wide brand card (`app/opengraph-image.tsx`) that every unwired route
 * falls back to. Pass an `imageUrl` (an existing hero/cover photo) to use that
 * instead of the generated `/og` card. Pure (no `next/og`) so any page can
 * import it without pulling the OG renderer into its bundle.
 */

/** Relative path → absolute (against brand.url); absolute URLs pass through. */
export function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${brand.url}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * The `og:locale` tag for a route locale — the underscore + region form social
 * platforms expect (`da` → `da_DK`, `en` → `en_US`). Falls back to the bare
 * locale for any unmapped code. Distinct from the hyphenated hreflang tags in
 * `i18n/routing.ts` (BCP-47, for `<link rel="alternate" hreflang>`); OG wants
 * the underscore form. Pages historically hardcoded this (PDP "da_DK", category
 * "en_US") — both wrong on the other locale; route it through here instead.
 */
const OG_LOCALES: Record<string, string> = {
  da: "da_DK",
  en: "en_US",
  de: "de_DE",
  sv: "sv_SE",
  no: "nb_NO",
};

export function ogLocale(locale: string): string {
  return OG_LOCALES[locale] ?? locale;
}

/** The brand-themed `/og` card URL for a title + description (resolved absolute by metadataBase). */
export function ogImageUrl(title: string, description: string): string {
  return `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
}

export function pageOg(
  title: string,
  description: string,
  imageUrl?: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  const image = imageUrl ?? ogImageUrl(title, description);
  return {
    openGraph: {
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
