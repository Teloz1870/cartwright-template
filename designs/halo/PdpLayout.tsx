/**
 * Halo — PDP frame (DesignPack.webshop.pdpLayout). Wraps the default product-
 * detail tree so the shop's product page wears the Halo paper canvas + a clean
 * breadcrumb, while the functional body (gallery, variants, add-to-cart) stays
 * untouched inside `children`. Rendered inside the HaloShell (.halo theme).
 *
 * Signature per WebshopOverrides.pdpLayout: { product, children }.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import type { DesignProduct } from "../types";

export function HaloPdpLayout({
  product,
  children,
}: {
  product: DesignProduct;
  children: ReactNode;
}) {
  return (
    <div className="bg-[color:var(--cream,#f5f5f7)]">
      <div className="mx-auto max-w-7xl px-6 pt-8">
        <nav
          aria-label="Breadcrumb"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted,#6e6e73)]"
        >
          <Link href="/produkter" className="transition-colors hover:text-[color:var(--ink,#1d1d1f)]">
            Shop
          </Link>
          <span className="px-2 opacity-50">/</span>
          <span className="text-[color:var(--ink,#1d1d1f)]">{product.name}</span>
        </nav>
      </div>
      {children}
    </div>
  );
}
