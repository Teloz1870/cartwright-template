import { redirect, notFound } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { brand } from "@/brand.config";
import { listWishlistProducts } from "@/lib/wishlist";
import { ProductCard } from "@/components/ProductCard";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  if (!brand.features.wishlist) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/account/login");

  const products = await listWishlistProducts(session.user.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-4xl font-black text-sol-ink">Min ønskeliste</h1>
        <Link href="/account" className="text-sm font-bold text-sol-accent hover:underline">
          ← Min konto
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="text-sol-muted">
          Din ønskeliste er tom. Tryk på hjertet på et produkt for at gemme det her.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
