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
            · en coverage {coverage(items)}
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
                  {i.hasEn ? "en ✓" : "missing en"}
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
        title="Translations"
        subtitle="Edit da → en per product, category, page, service and blog post. Click a name to translate (with AI auto-translate). Saved in the entity's translations field."
      />
      <List title="Products" type="product" items={status.products} />
      <List title="Categories" type="category" items={status.categories} />
      <List title="Pages" type="page" items={status.pages} />
      <List title="Services" type="service" items={status.services} />
      <List title="Blog posts" type="post" items={status.posts} />
    </div>
  );
}
