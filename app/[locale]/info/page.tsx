import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/JsonLd";
import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { hreflangFor } from "@/i18n/routing";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import { isTrustPageSourceSlug } from "@/lib/canonical-public-routes";
import { listPublishedPageSummaries, type PublicPageSummary } from "@/lib/public-pages";
import { localeHref, pageHref } from "@/lib/urls";

/**
 * `/info` — the index of the shop's information pages (TELOZ-INFO404).
 *
 * The route used to have only `[slug]`, so every link to the bare `/info` —
 * the default "Read the docs" CTA in `brand.config.ts`, the stack pack's CTAs —
 * answered 404. This lists what the shop already publishes, under the URLs the
 * sitemap gives them: the trust pages the footer links (each answers in every
 * profile that ships this route, from the CMS or the engine's default copy —
 * so terms and cookies are listed even without a CMS row, where the sitemap
 * leaves them out), then every other published CMS page.
 *
 * Lives in the `pages-db` module's directory, so a `--profile site` scaffold
 * (no database) prunes it with the rest of the CMS routes.
 */

type Props = { params: Promise<{ locale: string }> };

type Entry = { href: string; title: string; description?: string };

/** Trust pages carried by default copy, so they exist with or without a CMS row. */
const DEFAULT_PAGE_SLUGS = ["terms", "cookies"] as const;

async function publishedPages(): Promise<PublicPageSummary[]> {
  try {
    return await listPublishedPageSummaries();
  } catch {
    // The trust pages below still answer from their default copy during a
    // provider outage. Never log the provider error: it can contain a DSN.
    console.error("[info-index] Published CMS pages are temporarily unavailable.");
    return [];
  }
}

async function buildEntries(locale: string): Promise<Entry[]> {
  const t = await getTranslations({ locale, namespace: "Footer" });
  const trust: Entry[] = [
    { href: pageHref("about", locale), title: t("aboutUs") },
    { href: pageHref("contact", locale), title: t("contact") },
    { href: pageHref("privacy", locale), title: t("privacy") },
    { href: localeHref("/info/terms", locale), title: t("terms") },
    { href: localeHref("/info/cookies", locale), title: t("cookies") },
  ];

  const listed = new Set<string>(DEFAULT_PAGE_SLUGS);
  // A page translates its title and body only (lib/translations.ts), so its
  // meta description is in the base language: show it only there, never as a
  // base-language line under a translated title.
  const showDescriptions = locale === brand.defaultLocale;
  const others = await Promise.all(
    (await publishedPages())
      .filter((page) => !isTrustPageSourceSlug(page.slug) && !listed.has(page.slug))
      .map(async (page) => ({
        href: pageHref(page.slug, locale),
        // An empty title would render a link with no accessible name.
        title: (await getDynamicTranslation(page, "title", page.title, locale)).trim() || page.slug,
        description: (showDescriptions && page.metaDescription) || undefined,
      })),
  );

  return [...trust, ...others];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const [t, resolvedBrand] = await Promise.all([
    getTranslations({ locale, namespace: "InfoIndex" }),
    getBrand(),
  ]);
  const base = resolvedBrand.url.replace(/\/$/, "");
  return {
    title: t("title"),
    description: t("description", { storeName: resolvedBrand.storeName }),
    alternates: {
      canonical: `${base}${localeHref("/info", locale)}`,
      languages: hreflangFor(localeHref("/info", "{locale}"), resolvedBrand.url),
    },
  };
}

export default async function InfoIndexPage({ params }: Props) {
  const { locale } = await params;
  const [t, resolvedBrand, entries] = await Promise.all([
    getTranslations({ locale, namespace: "InfoIndex" }),
    getBrand(),
    buildEntries(locale),
  ]);
  const base = resolvedBrand.url.replace(/\/$/, "");
  const title = t("title");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: `${base}${localeHref("/info", locale)}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: entries.map((entry, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: entry.title,
        url: `${base}${entry.href}`,
      })),
    },
  };

  return (
    <div className="bg-sol-cream min-h-[60vh] text-sol-ink">
      <JsonLd data={jsonLd} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">{title}</h1>
        <p className="mt-4 text-lg text-sol-ink/70">
          {t("description", { storeName: resolvedBrand.storeName })}
        </p>
        <ul className="mt-12 divide-y divide-sol-ink/10 border-y border-sol-ink/10">
          {entries.map((entry) => (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="block py-5 group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sol-accent"
              >
                <span className="text-xl font-bold group-hover:text-sol-accent transition-colors">
                  {entry.title}
                </span>
                {entry.description ? (
                  <span className="mt-1 block text-sol-ink/70">{entry.description}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
