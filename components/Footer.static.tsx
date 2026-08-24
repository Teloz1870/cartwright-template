import Link from "next/link";
import NewsletterSignup from "@/components/NewsletterSignup";
import Logo from "@/components/Logo";
import { CartwrightLogo } from "@/components/CartwrightLogo";
import { fetchBrandingSettings } from "@/lib/data-source/brand";
import { fetchNavCategories, fetchInfoPages } from "@/lib/data-source/nav";
import { getBrand } from "@/lib/brand";
import { getActiveDesign } from "@/lib/theme";
import { readField } from "@/lib/genome/read";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * B3 static seam variant — the `site`-profile shared footer (site-profile
 * program). The materializer copies this file over `components/Footer.tsx`
 * when the db module is not in the profile; NOTHING imports it in the
 * shipped engine (byte-identical until then).
 *
 * Same structure and copy chain as the db variant (brand/nav/design through
 * the seams, genome copy via the static store → anchors), minus the
 * excluded-module surfaces: no in-place editing attributes (admin), no
 * TrustBadges/PaymentMethodsRow (webshop). The ecommerce nav column renders
 * only when identity says webshop — never in a site profile.
 */
export default async function Footer() {
  const [categories, brand, settings, t, design, infoPages, locale] = await Promise.all([
    fetchNavCategories().catch(() => []),
    getBrand(),
    fetchBrandingSettings().catch(() => null),
    getTranslations("Footer"),
    getActiveDesign().catch(() => null),
    fetchInfoPages().catch(() => [] as { slug: string }[]),
    getLocale(),
  ]);

  const ecommerceEnabled = settings?.ecommerceEnabled ?? brand.ecommerceEnabled;

  const infoSlugs = new Set(infoPages.map((p) => p.slug));
  const aboutHref = `/${locale}/about`;
  const faqHref = infoSlugs.has("faq") ? `/${locale}/info/faq` : null;

  const isSaas = design?.chrome === "dark";
  const footerBgClass = isSaas ? "bg-[#0A0A0A] border-t border-white/5" : "bg-sol-accent-deep";

  const g = brand.features.genomeResolve;
  const footerTagline = g
    ? await readField("footer.tagline").catch(() => brand.footer.tagline)
    : brand.footer.tagline;
  const footerDisclaimer = g
    ? await readField("footer.disclaimer").catch(() => brand.footer.disclaimer)
    : brand.footer.disclaimer;
  const newsletterHeading = g
    ? await readField("uiLabels.newsletterHeading").catch(() => brand.uiLabels.newsletterHeading)
    : brand.uiLabels.newsletterHeading;
  const newsletterSubtext = g
    ? await readField("uiLabels.newsletterSubtext").catch(() => brand.uiLabels.newsletterSubtext)
    : brand.uiLabels.newsletterSubtext;

  return (
    <footer data-site-footer className={`mt-auto text-white ${footerBgClass}`}>
      {brand.features.newsletter && (
        <section className={`relative border-b border-white/10 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent ${isSaas ? "bg-black" : "bg-sol-accent"}`}>
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-10 lg:px-8 lg:py-12">
            <div className="max-w-md">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-sol-sun">
                Newsletter
              </p>
              <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
                {isSaas ? "Hold dig opdateret" : newsletterHeading}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                {isSaas
                  ? "Tilmeld dig for nyheder om AI, e-commerce og nye platform-features."
                  : newsletterSubtext}
              </p>
            </div>
            <div className="w-full md:max-w-md">
              <NewsletterSignup />
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Link
              href="/"
              className="inline-block text-white transition-colors hover:text-sol-sun"
              aria-label={`${settings?.storeName ?? brand.storeName} home`}
            >
              {(settings?.storeName ?? brand.storeName) === "Cartwright" ? (
                <CartwrightLogo className="text-2xl" />
              ) : (
                <Logo storeName={settings?.storeName ?? brand.storeName} logo={brand.logo} />
              )}
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">
              {footerTagline}
            </p>
            <p className="mt-3 text-xs text-white/70">
              {footerDisclaimer}
            </p>
          </div>

          {ecommerceEnabled && (
            <nav aria-label="Shop">
              <h2 className="text-sm font-black uppercase tracking-wide text-white">
                Shop
              </h2>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link
                    href="/produkter"
                    className="text-sm text-white/70 transition hover:text-white"
                  >
                    {brand.uiLabels.allProductsLink}
                  </Link>
                </li>
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/category/${category.slug}`}
                      className="text-sm text-white/70 transition hover:text-white"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <nav aria-label="Customer service">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">
              {t("customerService")}
            </h2>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href={`/${locale}/contact`}
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("contact")}
                </Link>
              </li>
              {faqHref && (
                <li>
                  <Link
                    href={faqHref}
                    className="text-sm text-white/70 transition hover:text-white"
                  >
                    {t("faq")}
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">
              {t("company")}
            </h2>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href={aboutHref}
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("aboutUs")}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/info/terms`}
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("terms")}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/privacy`}
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("privacy")}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/info/cookies`}
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("cookies")}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/contact`}
                  className="text-sm text-white/70 transition hover:text-white font-bold text-sol-sun"
                >
                  {t("startProject")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/60 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3" />
          <div className="shrink-0 flex flex-col sm:items-end gap-1.5">
            <p>© {brand.footer.copyrightYear} {brand.storeName}</p>
            <p>
              {t("ownedBy")}{" "}
              <a href={brand.footer.ownerUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-sol-sun transition-colors">
                {brand.company.legalName}
              </a>
            </p>
            <p>
              <a href={brand.footer.githubUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-sol-sun transition-colors inline-flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub Profile
              </a>
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-4 border-t border-white/10 pt-6 text-center text-xs text-white/60 sm:flex-row sm:justify-between sm:text-left">
          <div className="flex flex-col sm:items-start items-center gap-1.5">
            <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
              {brand.features.cartwrightBadge && (
                <p>
                  {t("builtBy")}{" "}
                  <Link
                    href="/built-with-cartwright"
                    className="font-bold text-white/80 underline-offset-4 transition hover:text-sol-sun hover:underline"
                  >
                    Cartwright Engine
                  </Link>
                </p>
              )}
            </div>
            {brand.features.cartwrightBadge && (
              <p className="text-[11px] text-white/60">
                {t("wantSimilar")}{" "}
                <Link href="/built-with-cartwright" className="text-[var(--cw-brand)] underline">
                  {t("readMore")}
                </Link>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 md:justify-end">
            <a
              href="/sitemap.xml"
              className="font-bold text-white/80 underline-offset-4 transition hover:text-sol-sun hover:underline"
            >
              Sitemap
            </a>
            <a
              href="/robots.txt"
              className="font-bold text-white/80 underline-offset-4 transition hover:text-sol-sun hover:underline"
            >
              robots.txt (GEO)
            </a>
            <a
              href="/llms.txt"
              className="font-bold text-white/80 underline-offset-4 transition hover:text-sol-sun hover:underline"
            >
              llms.txt
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
