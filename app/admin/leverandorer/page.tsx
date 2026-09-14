import { AdminPageHeader } from "@/components/admin/ui";
import { listSuppliers } from "./actions";
import { SupplierManager } from "./SupplierManager";

export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const suppliers = await listSuppliers();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Suppliers (dropshipping)"
        subtitle={
          <>
            Link a supplier to products (Product.supplierId). On a paid order,
            each item&apos;s lines route to its supplier. <strong>Manual</strong> =
            admin handles it; <strong>email</strong> = the supplier gets a packing slip
            + confirm link.
          </>
        }
      />
      <SupplierManager suppliers={suppliers} />
    </div>
  );
}
