import Link from "next/link";
import { formatPriceDkk } from "@/lib/format";

type OrderRow = {
  id: string;
  email: string;
  shippingName: string;
  status: string;
  totalDkk: number;
  itemCount: number;
  createdAt: string | Date;
};

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  shipped: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

/**
 * Inline tabel til orders.list tool-result i admin-chat.
 * Genbrug-friendly: kan også vises i /admin/audit explainer-flow.
 */
export default function OrderTableInline({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return (
      <p className="text-xs italic text-sol-muted">
        Ingen ordrer matcher filtrene.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-sol-ink/10 bg-white">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead className="bg-sol-sand text-[10px] uppercase tracking-wider text-sol-muted">
          <tr>
            <th className="px-3 py-2 font-black">Ordre</th>
            <th className="px-3 py-2 font-black">Kunde</th>
            <th className="px-3 py-2 font-black">Status</th>
            <th className="px-3 py-2 text-right font-black">Total</th>
            <th className="px-3 py-2 text-right font-black">Dato</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sol-ink/5">
          {orders.map((o) => {
            const created =
              typeof o.createdAt === "string"
                ? new Date(o.createdAt)
                : o.createdAt;
            return (
              <tr key={o.id} className="hover:bg-sol-cream">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/ordrer/${o.id}`}
                    className="font-bold text-sol-accent underline-offset-2 hover:underline"
                  >
                    {o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-sol-ink">
                  <span className="block font-bold">{o.shippingName}</span>
                  <span className="block text-[10px] text-sol-muted">
                    {o.email}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-black text-sol-ink">
                  {formatPriceDkk(o.totalDkk)}
                </td>
                <td className="px-3 py-2 text-right text-[10px] text-sol-muted">
                  {dateFormatter.format(created)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
