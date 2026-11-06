import { brand } from "@/brand.config";
import { AdminPageHeader } from "@/components/admin/ui";
import { getDescriptor } from "@/lib/feature-flags/manifest";
import { formatPriceDkk } from "@/lib/format";
import { listZones } from "./actions";
import { ShippingManager } from "./ShippingManager";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const zones = await listZones();
  // Zones reach checkout only once the manifest says the flag is wired
  // (SHIP0-b). Until then every order pays the flat rate — the same
  // brand.policies values lib/pricing.calcShipping reads — and this page says
  // so instead of letting a merchant believe the rates below are charged.
  const zonesCharged = getDescriptor("shippingZones")?.implemented === true;
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Fragt-zoner"
        subtitle="Define zones (countries) + rates (price, free-shipping threshold, delivery time)."
      />
      {!zonesCharged && (
        <div
          role="note"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-semibold">Checkout charges the flat rate for now.</p>
          <p className="mt-1">
            Zones and rates you set up here are saved, but cart and checkout don&apos;t use
            them yet. Every order pays a flat{" "}
            {formatPriceDkk(brand.policies.shippingDefaultDkk)} for shipping (free on orders
            from {formatPriceDkk(brand.policies.shippingFreeThresholdDkk)}), set in{" "}
            <code>policies</code> in brand.config.ts.
          </p>
        </div>
      )}
      <ShippingManager zones={zones} />
    </div>
  );
}
