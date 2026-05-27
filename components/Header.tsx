import { prisma } from "@/lib/db";
import { getCartCount } from "@/lib/cart";
import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
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
  const [categories, cartCount, session, brand, settings, t] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    getCartCount(),
    auth(),
    getBrand(),
    prisma.brandingSettings.findFirst(),
    getTranslations("Header"),
  ]);

  const ecommerceEnabled = settings?.ecommerceEnabled ?? brand.ecommerceEnabled;
  const industryTemplate = settings?.industryTemplate ?? brand.industryTemplate;

  // Website Mode: hent sider markeret til navigation i stedet for kategorier
  const navPages = ecommerceEnabled
    ? []
    : await prisma.page.findMany({
        where: { showInNav: true },
        orderBy: { navOrder: "asc" },
        select: { slug: true, title: true },
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
      logo={brand.logo}
    />
  );
}
