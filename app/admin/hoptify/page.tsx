import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { brand } from "@/brand.config";
import { HopMigrate } from "./HopMigrate";

export const dynamic = "force-dynamic";

export default async function HoptifyPage() {
  await requireAdmin();
  if (!(brand.features as { hoptify?: boolean }).hoptify) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Hop off Shopify 🐸</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Tag dine produkter og dit look med fra Shopify til Cartwright på ~2 minutter.
          Vi anvender Hoptify-designet og — med en gyldig URL + Firecrawl-key — henter
          vi faktisk din palette (design-import) og dine produkter (scraper). Ellers
          ren parodi-demo. Et kærligt los til huslejen.
        </p>
      </header>
      <HopMigrate />
    </div>
  );
}
