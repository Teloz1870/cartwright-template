import { prisma } from "@/lib/db";
import { getCartCount } from "@/lib/cart";
import { auth } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import HeaderClient from "@/components/HeaderClient";

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
  const [categories, cartCount, session, brand] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    getCartCount(),
    auth(),
    getBrand(),
  ]);

  return (
    <HeaderClient
      categories={categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
      }))}
      cartCount={cartCount}
      signedIn={Boolean(session)}
      isAdmin={session?.user?.role === "admin"}
      storeName={brand.storeName}
      allProductsLabel={brand.uiLabels.allProductsLink}
    />
  );
}
