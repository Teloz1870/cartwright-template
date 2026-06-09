import { AdminPageHeader } from "@/components/admin/ui";
import { listSuppliers } from "./actions";
import { SupplierManager } from "./SupplierManager";

export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const suppliers = await listSuppliers();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Leverandører (dropshipping)"
        subtitle={
          <>
            Knyt en leverandør til produkter (Product.supplierId). Ved en betalt ordre
            routes hver vares linjer til sin leverandør. <strong>Manuel</strong> =
            admin håndterer; <strong>email</strong> = leverandøren får en pakkeseddel
            + bekræft-link.
          </>
        }
      />
      <SupplierManager suppliers={suppliers} />
    </div>
  );
}
