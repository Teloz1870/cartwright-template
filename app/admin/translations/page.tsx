import Link from "next/link";

import { getStatus } from "./actions";
import {
  AdminPageHeader,
  AdminCard,
  AdminBadge,
  AdminTable,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";

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
  type: "product" | "category" | "page" | "service" | "post";
  items: { id: string; name: string; hasEn: boolean }[];
}) {
  return (
    <AdminCard
      padding="none"
      title={
        <>
          {title}{" "}
          <span className="text-sm font-medium text-sol-muted">
            · en-dækning {coverage(items)}
          </span>
        </>
      }
    >
      <AdminTable>
        <AdminTbody>
          {items.map((i) => (
            <AdminTr key={i.id}>
              <AdminTd>
                <Link
                  href={`/admin/translations/${type}/${i.id}`}
                  className="font-bold text-sol-ink hover:text-sol-accent"
                >
                  {i.name}
                </Link>
              </AdminTd>
              <AdminTd align="right">
                <AdminBadge tone={i.hasEn ? "success" : "attention"}>
                  {i.hasEn ? "en ✓" : "mangler en"}
                </AdminBadge>
              </AdminTd>
            </AdminTr>
          ))}
        </AdminTbody>
      </AdminTable>
    </AdminCard>
  );
}

export default async function AdminTranslationsPage() {
  const status = await getStatus();
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Oversættelser"
        subtitle="Redigér da → en pr. produkt, kategori, side, service og blogindlæg. Klik et navn for at oversætte (med AI-auto-oversæt). Gemmes i entitetens translations-felt."
      />
      <List title="Produkter" type="product" items={status.products} />
      <List title="Kategorier" type="category" items={status.categories} />
      <List title="Sider" type="page" items={status.pages} />
      <List title="Services" type="service" items={status.services} />
      <List title="Blogindlæg" type="post" items={status.posts} />
    </div>
  );
}
