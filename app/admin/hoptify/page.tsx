import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { brand } from "@/brand.config";
import { HopMigrate } from "./HopMigrate";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function HoptifyPage() {
  await requireAdmin();
  if (!(brand.features as { hoptify?: boolean }).hoptify) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Hop off Shopify 🐸"
        subtitle="Tag dine produkter og dit look med fra Shopify til Cartwright på ~2 minutter. Vi anvender Hoptify-designet og — med en gyldig URL + Firecrawl-key — henter vi faktisk din palette (design-import) og dine produkter (scraper). Ellers ren parodi-demo. Et kærligt los til huslejen."
      />
      <HopMigrate />
    </div>
  );
}
