import Link from "next/link";
import NewsletterSignup from "@/components/NewsletterSignup";
import Logo from "@/components/Logo";
import TrustBadges from "@/components/TrustBadges";
import PaymentMethodsRow from "@/components/payments/PaymentMethodsRow";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { getTranslations } from "next-intl/server";

export default async function Footer() {
  // UL8.1: getBrand() i Promise.all så storeName/tagline/copyrightYear
  // reflekteres dynamisk fra DB-overrides hvis sat.
  //
  // Phase-E hotfix (2026-05-27): wrap Prisma-calls i .catch() så DB-fejl
  // (schema-drift, connection-timeout, migrations-mismatch) IKKE tager
  // hele sitet ned. Footer rendres på hver request på hver side; en
  // throw her = 500 globalt. Fallback: tom categories-liste + brand.config
  // defaults. Symptomet (manglende footer-categories) er synligt for ops
  // men ikke catastrofisk for visitor — meget bedre end blankt 500.
  const [categories, brand, settings, t] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }).catch((err) => {
      console.error("[Footer] category.findMany failed, falling back to []:", err);
      return [];
    }),
    getBrand(),
    prisma.brandingSettings.findFirst().catch((err) => {
      console.error("[Footer] brandingSettings.findFirst failed, falling back to null:", err);
      return null;
    }),
    getTranslations("Footer"),
  ]);

  const ecommerceEnabled = settings?.ecommerceEnabled ?? brand.ecommerceEnabled;
  const industryTemplate = settings?.industryTemplate ?? brand.industryTemplate;

  const isSaas = !ecommerceEnabled && industryTemplate === "saas";
  const footerBgClass = isSaas ? "bg-[#0A0A0A] border-t border-white/5" : "bg-sol-accent-deep";

  return (
    <footer className={`mt-auto text-white ${footerBgClass}`}>
      {/* Newsletter hero-strip — full-width, sat på en lysere navy stribe så
          den løfter sig fra resten af footeren uden at føles disconnected.
          Phase 6: tilføj subtle inner top-highlight via pseudo-element så
          stribens kant catcher lys — let glas-effekt uden tung backdrop-blur. */}
      {/* Feature-flag: shops uden newsletter (fx panel-hegn med konfigurator-
          flow) skipper denne section. Tekster "Sommerbrev" + "10%" er
          solbrille-specifikke marketing-tekster — flyttes til brand.config
          hvis det viser sig at flere shops vil have varianter. */}
      {brand.features.newsletter && (
        <section className={`relative border-b border-white/10 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent ${isSaas ? "bg-black" : "bg-sol-accent"}`}>
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-10 lg:px-8 lg:py-12">
            <div className="max-w-md">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-sol-sun">
                Newsletter
              </p>
              <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
                {isSaas ? "Hold dig opdateret" : brand.uiLabels.newsletterHeading}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                {isSaas 
                  ? "Tilmeld dig for nyheder om AI, e-commerce og nye platform-features." 
                  : brand.uiLabels.newsletterSubtext}
              </p>
            </div>
            <div className="w-full md:max-w-md">
              <NewsletterSignup />
            </div>
          </div>
        </section>
      )}

      {/* Main columns — 4-col grid kicker ind ved md (768+) i stedet for
          lg (1024+) så footeren ikke crasher mellem ~640-1023px. */}
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Link
              href="/"
              className="inline-block text-white transition-colors hover:text-sol-sun"
              aria-label={`${brand.storeName} home`}
            >
              <Logo storeName={settings?.storeName ?? brand.storeName} logo={brand.logo} />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">
              {brand.footer.tagline}
            </p>
            <p className="mt-3 text-xs text-white/50">
              {brand.footer.disclaimer}
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
                  href="/contact"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("contact")}
                </Link>
              </li>
              <li>
                <Link
                  href="/info/faq"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("faq")}
                </Link>
              </li>
              {ecommerceEnabled && (
                <>
                  <li>
                    <Link
                      href="/info/shipping"
                      className="text-sm text-white/70 transition hover:text-white"
                    >
                      {t("shipping")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/info/returns"
                      className="text-sm text-white/70 transition hover:text-white"
                    >
                      {t("returns")}
                    </Link>
                  </li>
                </>
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
                  href="/info/om-os"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("aboutUs")}
                </Link>
              </li>
              <li>
                <Link
                  href="/info/terms"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("terms")}
                </Link>
              </li>
              <li>
                <Link
                  href="/info/privacy"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  {t("privacy")}
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-white/70 transition hover:text-white font-bold text-sol-sun"
                >
                  {t("startProject")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom row — trust signals + copyright */}
        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/60 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            {ecommerceEnabled && (
              <>
                <TrustBadges variant="footer" />
                <PaymentMethodsRow size="small" showPrefix />
              </>
            )}
          </div>
          <div className="shrink-0 flex flex-col sm:items-end gap-1.5">
            <p>© {brand.footer.copyrightYear} {brand.storeName}</p>
            <p>
              Ejet og drevet af{" "}
              <a href="https://teloz.net" target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-sol-sun transition-colors">
                Teloz ApS
              </a>
            </p>
            <p>
              <a href="https://github.com/Teloz1870" target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-sol-sun transition-colors inline-flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub Profile
              </a>
            </p>
          </div>
        </div>

        {/* AI-first PR-signaler — Built with Cartwright + offentlig MCP/tool-katalog */}
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
                    Cartwright 2.0 Engine
                  </Link>
                </p>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400 font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Agentic Ready
              </span>
            </div>
            {brand.features.cartwrightBadge && (
              <p className="text-[11px] text-white/40">
                {t("wantSimilar")}{" "}
                <Link href="/built-with-cartwright" className="text-indigo-400 underline">
                  Læs mere her
                </Link>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 md:justify-end">
            <Link
              href="/changelog"
              className="font-bold text-white/80 underline-offset-4 transition hover:text-sol-sun hover:underline"
            >
              Audit feed
            </Link>
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
            <Link
              href="/api/v1/tools"
              className="font-mono text-[11px] text-white/70 transition hover:text-sol-sun"
            >
              /api/v1/tools
            </Link>
            <a
              href="/api/mcp"
              className="font-mono text-[11px] text-white/70 transition hover:text-sol-sun"
            >
              /api/mcp
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
