import { prisma } from "@/lib/db";
import { getCartCount } from "@/lib/cart";
import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { getActiveDesign } from "@/lib/theme";
import HeaderClient from "@/components/HeaderClient";
import { getTranslations } from "next-intl/server";

/**
 * Phase 7 Task A — async server-component der henter categories + cartCount +
 * session og delegerer rendering til client-wrapper for scroll-state-tracking.
 *
 * Prisma + auth-calls forbliver server-side; HeaderClient modtager kun de
 * minimale plain-data-props den behøver (ingen Session-objekt eller Prisma-
 * objekt sendes til klienten — kun et bool signedIn-flag).
 */
export default async function Header() {
  // UL8.1: getBrand() i Promise.all så DB-overrides (storeName via wizard)
  // reflekteres uden code-deploy. brand.config er fortsat fallback.
  //
  // Phase-E hotfix (2026-05-27): wrap Prisma-calls i .catch() så DB-fejl
  // (schema-drift, connection-timeout) IKKE tager hele sitet ned. Header
  // rendres på hver request på hver side; throw her = 500 globalt. Same
  // mønster anvendt på Footer.tsx + lib/brand.ts.
  const [categories, cartCount, session, brand, settings, t, design] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }).catch((err) => {
      console.error("[Header] category.findMany failed, falling back to []:", err);
      return [];
    }),
    getCartCount(),
    auth(),
    getBrand(),
    prisma.brandingSettings.findFirst().catch((err) => {
      console.error("[Header] brandingSettings.findFirst failed, falling back to null:", err);
      return null;
    }),
    getTranslations("Header"),
    getActiveDesign(),
  ]);

  const ecommerceEnabled = settings?.ecommerceEnabled ?? brand.ecommerceEnabled;
  const industryTemplate = settings?.industryTemplate ?? brand.industryTemplate;
  // Dark chrome follows the active design's `chrome` hint (saas-dark / stack),
  // not the old saas heuristic, so the light Aurora default gets a light header.
  // Null design (DB error) → light, matching the inferred Aurora homepage.
  const darkChrome = design?.chrome === "dark";

  // Website Mode: hent sider markeret til navigation i stedet for kategorier
  const navPages = ecommerceEnabled
    ? []
    : await prisma.page.findMany({
        where: { showInNav: true },
        orderBy: { navOrder: "asc" },
        select: { slug: true, title: true },
      }).catch((err) => {
        console.error("[Header] page.findMany failed, falling back to []:", err);
        return [];
      });

  return (
    <HeaderClient
      categories={categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
      }))}
      navPages={navPages}
      cartCount={cartCount}
      signedIn={Boolean(session)}
      isAdmin={session?.user?.role === "admin"}
      storeName={settings?.storeName ?? brand.storeName}
      allProductsLabel={t("allProducts")}
      ecommerceEnabled={ecommerceEnabled}
      industryTemplate={industryTemplate}
      darkChrome={darkChrome}
      logo={brand.logo}
    />
  );
}
