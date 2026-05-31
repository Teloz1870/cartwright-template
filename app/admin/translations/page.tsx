import Link from "next/link";

import { getStatus } from "./actions";

export const dynamic = "force-dynamic";

function coverage(items: { hasEn: boolean }[]): string {
  if (items.length === 0) return "—";
  const n = items.filter((i) => i.hasEn).length;
  return `${Math.round((n / items.length) * 100)}% (${n}/${items.length})`;
}

function List({
  title,
  type,
  items,
}: {
  title: string;
  type: "product" | "category";
  items: { id: string; name: string; hasEn: boolean }[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-black text-sol-ink">
        {title} <span className="text-sm font-medium text-sol-muted">· en-dækning {coverage(items)}</span>
      </h2>
      <div className="overflow-x-auto rounded-xl border-2 border-sol-ink/10">
        <table className="w-full text-left text-sm">
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-sol-ink/10 first:border-t-0">
                <td className="px-3 py-2">
                  <Link href={`/admin/translations/${type}/${i.id}`} className="font-bold text-sol-ink hover:text-sol-accent">
                    {i.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                      i.hasEn ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {i.hasEn ? "en ✓" : "mangler en"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AdminTranslationsPage() {
  const status = await getStatus();
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Oversættelser</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Redigér da → en pr. produkt/kategori. Klik et navn for at oversætte (med
          AI-auto-oversæt). Gemmes i entitetens <code className="rounded bg-sol-ink/5 px-1">translations</code>-felt.
        </p>
      </header>
      <List title="Produkter" type="product" items={status.products} />
      <List title="Kategorier" type="category" items={status.categories} />
    </div>
  );
}
