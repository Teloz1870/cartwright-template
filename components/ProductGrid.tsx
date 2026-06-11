import type { ComponentType } from "react";
import type { Product } from "@/app/generated/prisma/client";
import type { DesignProduct } from "@/designs/types";
import { getFeatures } from "@/lib/brand";
import { isAnnotateEditEnabled } from "@/lib/annotate/server";
import { ProductCard } from "./ProductCard";
import RevealOnScroll from "./RevealOnScroll";

type Props = {
  products: Product[];
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
};

export async function ProductGrid({ products, prioritizeAboveFold = 0, card: Card }: Props) {
  if (products.length === 0) {
    return (
      <p className="text-sol-muted text-center py-16">
        No products found.
      </p>
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
              editEnabled={editEnabled}
            />
          )}
        </RevealOnScroll>
      ))}
    </div>
  );
}
