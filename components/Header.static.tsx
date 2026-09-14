import { fetchBrandingSettings } from "@/lib/data-source/brand";
import { fetchNavCategories, fetchNavPages } from "@/lib/data-source/nav";
import { getBrand } from "@/lib/brand";
import { getActiveDesign } from "@/lib/theme";
import HeaderClient from "@/components/HeaderClient";
import { getTranslations } from "next-intl/server";

/**
 * B3 static seam variant — the `site`-profile shared header (site-profile
 * program). The materializer copies this file over `components/Header.tsx`
 * when the db module is not in the profile; NOTHING imports it in the
 * shipped engine (byte-identical until then).
 *
 * Identical delegation to HeaderClient as the db variant, with the two
 * excluded-module reads at their no-data values: no cart (webshop absent →
 * cartCount 0, exactly the empty-cart render) and no session (auth absent →
 * signed-out chrome). Brand/nav/design still resolve through the same seams
 * (static sources → brand.config + design pack).
 */
export default async function Header() {
  const [categories, brand, settings, t, design] = await Promise.all([
    fetchNavCategories().catch(() => []),
    getBrand(),
    fetchBrandingSettings().catch(() => null),
    getTranslations("Header"),
    getActiveDesign().catch(() => null),
  ]);

  const ecommerceEnabled = settings?.ecommerceEnabled ?? brand.ecommerceEnabled;
  const industryTemplate = settings?.industryTemplate ?? brand.industryTemplate;
  const darkChrome = design?.chrome === "dark";

  const firstRunBrand =
    !!brand.features.firstRunWelcome &&
    !settings?.setupComplete &&
    !brand.designSlug &&
    !settings?.designSlug;

  const navPages = ecommerceEnabled ? [] : await fetchNavPages().catch(() => []);

  return (
    <HeaderClient
      categories={categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
      }))}
      navPages={navPages}
      cartCount={0}
      signedIn={false}
      isAdmin={false}
      storeName={settings?.storeName ?? brand.storeName}
      allProductsLabel={t("allProducts")}
      ecommerceEnabled={ecommerceEnabled}
      industryTemplate={industryTemplate}
      darkChrome={darkChrome}
      firstRunBrand={firstRunBrand}
      logo={brand.logo}
    />
  );
}
