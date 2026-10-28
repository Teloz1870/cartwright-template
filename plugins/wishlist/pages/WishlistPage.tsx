import { redirect, notFound } from "next/navigation";
import { getFeatures } from "@/lib/brand";
import Link from "next/link";
import { localeHref } from "@/lib/urls";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { listWishlistProducts } from "@/plugins/wishlist/lib/wishlist";
import { ProductCard } from "@/components/ProductCard";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  // Resolved: this page is the DESTINATION of a button the PDP renders on the
  // merged value. Reading the compile-time flag here meant a customer could
  // save a product and then meet a 404 on the page that lists it.
  if (!(await getFeatures()).wishlist) notFound();
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user?.id) redirect(localeHref("/account/login", locale));

  const products = await listWishlistProducts(session.user.id);
  // Hard-coded Danish until now — an English shop's wishlist was the one
  // account page in Danish. Danish renders exactly as before.
  const t = await getTranslations({ locale, namespace: "Account" });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-4xl font-black text-sol-ink">{t("wishlist_title")}</h1>
        <Link href={localeHref("/account", locale)} className="text-sm font-bold text-sol-accent hover:underline">
          {t("wishlist_backToAccount")}
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="text-sol-muted">{t("wishlist_empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
