import { listZones } from "./actions";
import { ShippingManager } from "./ShippingManager";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const zones = await listZones();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Fragt-zoner</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Definér zoner (lande) + rater (pris, fri-fragt-grænse, leveringstid).
          Aktivér <strong>Shipping-zoner</strong> under Funktioner for at bruge dem
          ved checkout; ellers gælder den flade fragt.
        </p>
      </header>
      <ShippingManager zones={zones} />
    </div>
  );
}
