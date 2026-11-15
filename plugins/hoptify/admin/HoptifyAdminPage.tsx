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
        subtitle="Bring your products and your look from Shopify to Cartwright in ~2 minutes. We apply the Hoptify design and — with a valid URL + Firecrawl key — we actually pull your palette (design-import) and your products (scraper). Otherwise it's a pure parody demo. A loving kick toward the rent."
      />
      <HopMigrate />
    </div>
  );
}
