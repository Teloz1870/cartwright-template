import { requireAdmin } from "@/lib/admin";
import { CSV_COLUMNS } from "@/lib/products-csv";
import Link from "next/link";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function ProductImportPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Produkt-import (CSV)</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Upsert pr. <code className="rounded bg-sol-ink/5 px-1">slug</code>. Kategori
          opslås via <code className="rounded bg-sol-ink/5 px-1">categorySlug</code>{" "}
          (oprettes ikke automatisk). Priser i <strong>kroner</strong>.{" "}
          <Link href="/admin/produkter/export" className="underline">Eksportér nuværende</Link>{" "}
          for at få det rigtige format.
        </p>
        <p className="mt-2 text-xs text-sol-muted">
          Kolonner: <code className="rounded bg-sol-ink/5 px-1">{CSV_COLUMNS.join(", ")}</code>
        </p>
      </header>
      <ImportForm />
    </div>
  );
}
