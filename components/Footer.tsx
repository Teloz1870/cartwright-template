import Link from "next/link";
import NewsletterSignup from "@/components/NewsletterSignup";
import Logo from "@/components/Logo";
import TrustBadges from "@/components/TrustBadges";
import PaymentMethodsRow from "@/components/payments/PaymentMethodsRow";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";

export default async function Footer() {
  // UL8.1: getBrand() i Promise.all så storeName/tagline/copyrightYear
  // reflekteres dynamisk fra DB-overrides hvis sat.
  const [categories, brand] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    getBrand(),
  ]);

  return (
    <footer className="mt-auto bg-sol-accent-deep text-white">
      {/* Newsletter hero-strip — full-width, sat på en lysere navy stribe så
          den løfter sig fra resten af footeren uden at føles disconnected.
          Phase 6: tilføj subtle inner top-highlight via pseudo-element så
          stribens kant catcher lys — let glas-effekt uden tung backdrop-blur. */}
      {/* Feature-flag: shops uden newsletter (fx panel-hegn med konfigurator-
          flow) skipper denne section. Tekster "Sommerbrev" + "10%" er
          solbrille-specifikke marketing-tekster — flyttes til brand.config
          hvis det viser sig at flere shops vil have varianter. */}
      {brand.features.newsletter && (
        <section className="relative border-b border-white/10 bg-sol-accent before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-10 lg:px-8 lg:py-12">
            <div className="max-w-md">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-sol-sun">
                Sommerbrev
              </p>
              <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
                {brand.uiLabels.newsletterHeading}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                {brand.uiLabels.newsletterSubtext}
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
              aria-label={`${brand.storeName} forside`}
            >
              <Logo />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">
              {brand.footer.tagline}
            </p>
            <p className="mt-3 text-xs text-white/50">
              {brand.footer.disclaimer}
            </p>
          </div>

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
                    href={`/kategori/${category.slug}`}
                    className="text-sm text-white/70 transition hover:text-white"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Kundeservice">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">
              Kundeservice
            </h2>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/info/kontakt"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  Kontakt
                </Link>
              </li>
              <li>
                <Link
                  href="/info/faq"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link
                  href="/info/fragt-og-levering"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  Fragt &amp; levering
                </Link>
              </li>
              <li>
                <Link
                  href="/info/returret"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  Returret &amp; bytte
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Virksomhed">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">
              Virksomhed
            </h2>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/info/om-os"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  Om os
                </Link>
              </li>
              <li>
                <Link
                  href="/info/handelsbetingelser"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  Handelsbetingelser
                </Link>
              </li>
              <li>
                <Link
                  href="/info/privatlivspolitik"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  Privatlivspolitik
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom row — trust signals + copyright */}
        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3">
            <TrustBadges variant="footer" />
            <PaymentMethodsRow size="small" showPrefix />
          </div>
          <p className="shrink-0">© {brand.footer.copyrightYear} {brand.storeName}</p>
        </div>

        {/* AI-first PR-signaler — Built with Claude + offentlig MCP/tool-katalog */}
        <div className="mt-6 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center text-xs text-white/60 sm:flex-row sm:justify-between sm:text-left">
          <p>
            🤖 Built with Claude · drevet af{" "}
            <Link
              href="/manifest"
              className="font-bold text-white/80 underline-offset-4 transition hover:text-sol-sun hover:underline"
            >
              AI-first
            </Link>
            -arkitektur
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link
              href="/changelog"
              className="font-bold text-white/80 underline-offset-4 transition hover:text-sol-sun hover:underline"
            >
              Audit-feed
            </Link>
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
