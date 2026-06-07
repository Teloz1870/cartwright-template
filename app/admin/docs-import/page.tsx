import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { getBrand } from "@/lib/brand";
import { getGoogleConnectionStatus } from "@/lib/google/oauth";
import { AdminPageHeader } from "@/components/admin/ui";
import { DocsImportForm } from "./DocsImportForm";

export const dynamic = "force-dynamic";

export default async function DocsImportPage() {
  await requireAdmin();

  const [brand, google] = await Promise.all([
    getBrand(),
    getGoogleConnectionStatus(),
  ]);

  if (!(brand.features as { docsImport?: boolean }).docsImport) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Google Docs-import"
        breadcrumb={[{ label: "Integrationer", href: "/admin/integrations" }]}
        subtitle="Importér et Google Doc som et draft blogindlæg eller en CMS-side. Kun dokumentets strukturerede tekst importeres: overskrifter, afsnit, lister, fed/kursiv og sikre links."
      />

      <DocsImportForm
        connected={google.connected}
        accountEmail={google.accountEmail}
      />
    </div>
  );
}
