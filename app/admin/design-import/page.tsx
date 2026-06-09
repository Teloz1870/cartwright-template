import { requireAdmin } from "@/lib/admin";
import { DesignImportForm } from "./DesignImportForm";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function DesignImportPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Design-import"
        subtitle="Træk en farvepalette fra en anden side ind i din shop på ~2 minutter. Firecrawl henter siden, AI udleder en Cartwright-palette, og du anvender den som tema. Kun design-vibe (farver/typografi/tone) — ikke layout."
      />
      <DesignImportForm />
    </div>
  );
}
