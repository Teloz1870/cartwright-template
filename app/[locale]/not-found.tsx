import { getLocale } from "next-intl/server";
import { Button } from "@/components/Button";
import { brand } from "@/brand.config";
import { getActiveDesign } from "@/lib/theme";
import Link from "next/link";
import { profileCapabilities } from "@/lib/profile-capabilities";

export default async function NotFound() {
  // Design-owned 404 (DesignPack.pages.notFound) — renders inside the design's
  // Shell + chrome. Unset → the default below (byte-identical).
  const [locale, design] = await Promise.all([
    getLocale().catch(() => brand.defaultLocale),
    getActiveDesign().catch(() => null),
  ]);
  const NotFoundTemplate = design?.pages?.notFound;
  if (NotFoundTemplate) return <NotFoundTemplate locale={locale} />;

  return (
    <div className="bg-sol-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-sol-ink font-black text-5xl sm:text-6xl leading-tight tracking-tight">
          Page not found
        </h1>
        <p className="text-sol-muted text-lg sm:text-xl font-medium mt-5">
          We could not find the page you are looking for.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button href="/" variant="primary">
            Go to homepage
          </Button>
          {brand.ecommerceEnabled ? <Button href={`/${locale}/produkter`} variant="dark">{brand.uiLabels.notFoundProductsLink}</Button> : null}
        </div>
        <nav aria-label="Recovery links" className="mt-8">
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm underline">
            <li><a href="/sitemap.xml">Sitemap</a></li>
            <li><a href="/llms.txt">llms.txt</a></li>
            {brand.ecommerceEnabled ? <li><Link href={`/${locale}/produkter`}>Product catalogue</Link></li> : null}
            {profileCapabilities.agentApi ? <li><Link href={`/${locale}/developers`}>Developer documentation</Link></li> : null}
          </ul>
        </nav>
      </div>
    </div>
  );
}
