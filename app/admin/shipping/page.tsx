import { AdminPageHeader } from "@/components/admin/ui";
import { listZones } from "./actions";
import { ShippingManager } from "./ShippingManager";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const zones = await listZones();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Fragt-zoner"
        subtitle={
          <>
            Define zones (countries) + rates (price, free-shipping threshold, delivery time).
            Enable <strong>Shipping zones</strong> under Features to use them
            at checkout; otherwise the flat shipping rate applies.
          </>
        }
      />
      <ShippingManager zones={zones} />
    </div>
  );
}
