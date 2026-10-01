/**
 * Halo — bespoke product card (Apple-minimal). Wired via DesignPack.webshop
 * .productCard → ProductGrid renders this in place of the default card on the
 * PLP + category pages when halo is the active design, so the shop matches the
 * rest of the site. Renders inside the HaloShell (.halo theme + fonts).
 *
 * Reuses the shared product helpers (image resolution, currency-aware Price,
 * view-transition link) so it behaves like the default card — just in the clean,
 * generous Halo aesthetic. Server component.
 */
import Image from "next/image";
import { Price } from "@/components/Price";
import { TransitionLink } from "@/components/TransitionLink";
import { resolveProductImageUrls } from "@/lib/media/shim";
import type { DesignProduct } from "../types";

export function HaloProductCard({ product }: { product: DesignProduct }) {
  const images = resolveProductImageUrls(product);
  const firstImage = images[0] ?? null;

  return (
    <TransitionLink href={`/product/${product.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-[color:var(--surface-2,#f1f1f4)]">
        {firstImage ? (
          <Image
            src={firstImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-6 transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full" />
        )}
        {product.stock === 0 && (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/80 px-3 py-1 text-[11px] font-medium text-white">
            Sold out
          </span>
        )}
      </div>
      <div className="mt-4 px-1 text-center">
        <h3 className="text-base font-semibold tracking-tight text-[color:var(--ink,#1d1d1f)]">
          {product.name}
        </h3>
        <p className="mt-1 text-sm text-[color:var(--muted,#6e6e73)]">
          <Price oere={product.priceDkk} />
        </p>
      </div>
    </TransitionLink>
  );
}
