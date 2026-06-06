import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { getBrand } from "@/lib/brand";
import { getGoogleConnectionStatus } from "@/lib/google/oauth";
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
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Google Docs-import</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Importér et Google Doc som et draft blogindlæg eller en CMS-side. Kun
          dokumentets strukturerede tekst importeres: overskrifter, afsnit,
          lister, fed/kursiv og sikre links.
        </p>
      </header>

      <DocsImportForm
        connected={google.connected}
        accountEmail={google.accountEmail}
      />
    </div>
  );
}
