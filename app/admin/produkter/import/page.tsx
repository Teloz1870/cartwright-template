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
        title="Product import (CSV)"
        breadcrumb={[{ label: "Products", href: "/admin/produkter" }]}
        subtitle={
          <>
            <span className="block max-w-2xl">
              Upsert by <code className="rounded bg-sol-ink/5 px-1">slug</code>. Category
              looked up via <code className="rounded bg-sol-ink/5 px-1">categorySlug</code>{" "}
              (not created automatically). Prices in <strong>kroner</strong>.{" "}
              <Link href="/admin/produkter/export" className="underline">Export current</Link>{" "}
              to get the right format.
            </span>
            <span className="mt-2 block text-xs">
              Columns: <code className="rounded bg-sol-ink/5 px-1">{CSV_COLUMNS.join(", ")}</code>
            </span>
          </>
        }
      />
      <ImportForm />
    </div>
  );
}
