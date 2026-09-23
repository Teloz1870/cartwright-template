import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { localizedBrandCopy } from "@/lib/brand-copy";
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
  /**
   * The description, in the language of the page.
   *
   * The locale layout localises this tag, but a PAGE's metadata overrides a
   * layout's — and the homepage is the one page that sets its own. So the
   * layout fix reached every route except the front page, which is the one an
   * agent or a crawler hits first. Measured on the eyewear canary after that
   * fix deployed: /en still served a fully Danish description.
   *
   * Absent translation ⇒ the base value, so single-locale shops and every
   * default-locale page are byte-identical.
   */
  const description = localizedBrandCopy(
    "metadata.description",
    resolved.metadata.description,
    locale,
  );
  const base = resolved.url.replace(/\/$/, "");
  const canonical = `${base}/${locale}`;
  const socialImage = `${base}/opengraph-image`;

  return {
    title: resolved.metadata.title,
    description,
    alternates: {
      canonical,
      languages: hreflangFor("/{locale}", resolved.url),
      // Markdown-alternativet til homepage-dokumentet (samme indhold som
      // Accept-negotiation på "/" serverer). Annonceres både her i <head>
      // og som Link-header i proxy.ts.
      types: {
        "text/markdown": `${base}/index.md`,
      },
    },
    openGraph: {
      type: "website",
      siteName: resolved.storeName,
      title: resolved.metadata.title,
      description,
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
      description,
      images: [socialImage],
    },
  };
}
