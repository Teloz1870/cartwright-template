import { requireAdmin } from "@/lib/admin";
import { notFound } from "next/navigation";
import { getFeatures } from "@/lib/brand";
import { DesignImportForm } from "./DesignImportForm";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function DesignImportPage() {
  await requireAdmin();
  // Gate mirrors the nav entry's flag exactly (registry-stats precedent):
  // the plugin's own runtime flag — flag-off ⇒ nav gone AND direct URL 404s.
  const features = await getFeatures();
  if (!features.designImport) notFound();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Design-import"
        subtitle="Pull a color palette from another site into your shop in ~2 minutes. Firecrawl fetches the page, AI derives a Cartwright palette, and you apply it as a theme. Design vibe only (colors/typography/tone) — not layout."
      />
      <DesignImportForm />
    </div>
  );
}
