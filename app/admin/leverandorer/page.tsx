import { listSuppliers } from "./actions";
import { SupplierManager } from "./SupplierManager";

export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const suppliers = await listSuppliers();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Leverandører (dropshipping)</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Knyt en leverandør til produkter (Product.supplierId). Ved en betalt ordre
          routes hver vares linjer til sin leverandør. <strong>Manuel</strong> =
          admin håndterer; <strong>email</strong> = leverandøren får en pakkeseddel
          + bekræft-link.
        </p>
      </header>
      <SupplierManager suppliers={suppliers} />
    </div>
  );
}
