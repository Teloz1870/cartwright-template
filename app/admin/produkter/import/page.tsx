import { requireAdmin } from "@/lib/admin";
import { CSV_COLUMNS } from "@/lib/products-csv";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/ui";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function ProductImportPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Produkt-import (CSV)"
        breadcrumb={[{ label: "Produkter", href: "/admin/produkter" }]}
        subtitle={
          <>
            <span className="block max-w-2xl">
              Upsert pr. <code className="rounded bg-sol-ink/5 px-1">slug</code>. Kategori
              opslås via <code className="rounded bg-sol-ink/5 px-1">categorySlug</code>{" "}
              (oprettes ikke automatisk). Priser i <strong>kroner</strong>.{" "}
              <Link href="/admin/produkter/export" className="underline">Eksportér nuværende</Link>{" "}
              for at få det rigtige format.
            </span>
            <span className="mt-2 block text-xs">
              Kolonner: <code className="rounded bg-sol-ink/5 px-1">{CSV_COLUMNS.join(", ")}</code>
            </span>
          </>
        }
      />
      <ImportForm />
    </div>
  );
}
