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
  // (SHIP0-b, now done): before, this page said every order paid the flat
  // rate; now it says how the rates below are charged.
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
      {zonesCharged && (
        <div role="note" className="rounded-lg border border-sol-ink/15 px-4 py-3 text-sm text-sol-ink">
          <p className="font-semibold">How checkout uses these rates</p>
          <p className="mt-1">
            With <code>shippingZones</code> on in Features, an order pays the cheapest rate of the zone for{" "}
            <code>{brand.policies.country}</code> that fits the parcel&apos;s weight. With no zone for{" "}
            <code>{brand.policies.country}</code>, or the flag off, it pays the flat{" "}
            {formatPriceDkk(brand.policies.shippingDefaultDkk)} (free from{" "}
            {formatPriceDkk(brand.policies.shippingFreeThresholdDkk)}). A parcel no weight band holds pays the next
            heavier band, or the heaviest band when it is heavier than all of them: add a band without an upper
            limit to set that price. Customers can&apos;t choose between rates yet.
          </p>
        </div>
      )}
      <ShippingManager zones={zones} />
    </div>
  );
}
