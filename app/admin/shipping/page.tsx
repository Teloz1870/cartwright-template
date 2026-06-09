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
            Definér zoner (lande) + rater (pris, fri-fragt-grænse, leveringstid).
            Aktivér <strong>Shipping-zoner</strong> under Funktioner for at bruge dem
            ved checkout; ellers gælder den flade fragt.
          </>
        }
      />
      <ShippingManager zones={zones} />
    </div>
  );
}
