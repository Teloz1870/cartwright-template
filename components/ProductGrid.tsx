import type { Product } from "@prisma/client";
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
};

export function ProductGrid({ products, prioritizeAboveFold = 0 }: Props) {
  if (products.length === 0) {
    return (
      <p className="text-sol-muted text-center py-16">
        Ingen produkter fundet.
      </p>
    );
  }

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
          <ProductCard
            product={product}
            priority={index < prioritizeAboveFold}
          />
        </RevealOnScroll>
      ))}
    </div>
  );
}
