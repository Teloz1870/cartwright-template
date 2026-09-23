import type { ComponentType } from "react";
import Link from "next/link";
import type { DesignProduct } from "@/designs/types";
import { getFeatures } from "@/lib/brand";
import { isAnnotateEditEnabled } from "@/lib/annotate/server";
import { ProductCard } from "./ProductCard";
import RevealOnScroll from "./RevealOnScroll";

type Props = {
  // Structural (B3): a Prisma Product[] satisfies this — and so can any
  // profile-portable product source. Same contract as the design layer.
  products: DesignProduct[];
  /**
   * Task E: hint hvor mange første cards der er above-fold (eager-load + priority).
   * Default 0 = ingen priority. Sæt fx 4 på katalogside hvor de første 4 kort er
   * synlige ved page-load — det giver browseren et fingerpeg om LCP-kandidater.
   */
  prioritizeAboveFold?: number;
  /**
   * Design-owned product card (DesignPack.webshop.productCard). When the active
   * design provides one, the PLP/category pages pass it here and the grid renders
   * it in place of the default ProductCard — so a super-pro design owns the shop
   * cards too. Unset → the default ProductCard (byte-identical for every existing
   * caller, which never passes this).
   */
  card?: ComponentType<{ product: DesignProduct }>;
  /**
   * Current locale — when set, the empty state shows a "Browse all products"
   * recovery link (locale-prefixed). The PLP/category pages pass it; callers
   * that render a fixed product set (homepage featured, related products) leave
   * it unset and the empty state degrades to copy only.
   */
  locale?: string;
  /**
   * Active free-text search term (PLP `q`). When set, an empty result echoes it —
   * `No products match "<q>"` — so a shopper who searched for something we don't
   * carry sees their term confirmed, not a generic miss. Only the PLP searches by
   * free text; category/related-products callers leave it unset and the heading
   * stays the generic "No products found" (byte-identical for them).
   */
  query?: string;
};

export async function ProductGrid({
  products,
  prioritizeAboveFold = 0,
  card: Card,
  locale,
  query,
}: Props) {
  if (products.length === 0) {
    // Echo the searched term when present (trim + cap length, and break-words on
    // the heading so even a 60-char unbroken token wraps instead of overflowing;
    // React escapes the interpolation → XSS-safe).
    const searched = query?.trim();
    const heading = searched
      ? `No products match "${searched.slice(0, 60)}"`
      : "No products found";
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-12 w-12 text-sol-muted/60"
        >
          <path d="M3 6.5 12 3l9 3.5v11L12 21l-9-3.5z" />
          <path d="m3 6.5 9 3.5 9-3.5M12 10v11" />
        </svg>
        <div>
          <p className="text-lg font-bold text-sol-ink break-words">{heading}</p>
          <p className="mt-1 text-sm text-sol-muted">
            {locale
              ? "Try adjusting your filters, or browse the full catalogue."
              : "Check back soon — new products are on the way."}
          </p>
        </div>
        {locale ? (
          <Link
            href={`/${locale}/produkter`}
            className="mt-1 inline-flex items-center rounded-full bg-sol-ink px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-accent"
          >
            Browse all products
          </Link>
        ) : null}
      </div>
    );
  }

  // Resolve de runtime-toggleable Phase B-flags ÉN gang her (getFeatures er
  // cached) og send dem som props til hvert kort. ProductCard er en server-
  // komponent og kan derfor ikke selv bruge FeaturesProvider-context'en —
  // grid'et er det naturlige aggregeringspunkt.
  const features = await getFeatures();
  // In-place editing: ProductGrid er aggregeringspunktet (ProductCard er en
  // server-komponent), så vi resolver edit-mode her én gang for alle kort.
  const editEnabled = await isAnnotateEditEnabled();

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product, index) => (
        // Phase 8 Task A: subtle scroll-reveal — stagger 60ms pr kort,
        // begrænset til de første 8 kort så grid'er med mange produkter ikke
        // får 2-sek total stagger-tid. Cards over index 7 reveal'er med 0ms
        // delay (de er sandsynligvis allerede off-screen ved load).
        <RevealOnScroll
          key={product.id}
          delay={index < 8 ? index * 60 : 0}
        >
          {Card ? (
            <Card product={product} />
          ) : (
            <ProductCard
              product={product}
              priority={index < prioritizeAboveFold}
              containerQueries={features.containerQueries}
              viewTransitions={features.viewTransitions}
              wishlist={features.wishlist}
              editEnabled={editEnabled}
              // Thread the route locale to the wishlist heart's aria-label.
              // ProductGrid.locale is the free-form route locale; the card +
              // WishlistButton only distinguish en vs. da, so narrow here.
              // Unset / any non-"en" locale → "da" = byte-identical legacy
              // render (every existing da caller, and the homepage/related
              // grids that pass no locale).
              locale={locale === "en" ? "en" : "da"}
              routeLocale={locale}
            />
          )}
        </RevealOnScroll>
      ))}
    </div>
  );
}
