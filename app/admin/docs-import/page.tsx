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
        breadcrumb={[{ label: "Integrations", href: "/admin/integrations" }]}
        subtitle="Import a Google Doc as a draft blog post or a CMS page. Only the document's structured text is imported: headings, paragraphs, lists, bold/italic and safe links."
      />

      <DocsImportForm
        connected={google.connected}
        accountEmail={google.accountEmail}
      />
    </div>
  );
}
