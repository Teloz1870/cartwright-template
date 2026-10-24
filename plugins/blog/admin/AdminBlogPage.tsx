import Link from "next/link";

import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  AdminBadge,
  EmptyState,
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
} from "@/components/admin/ui";
import { getPostsForAdmin } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const posts = await getPostsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Blog"
        subtitle={
          <>
            Enable the blog under{" "}
            <Link href="/admin/features" className="underline">Features</Link>. Posts appear at{" "}
            <code className="rounded bg-sol-ink/5 px-1">/blog</code>.
          </>
        }
        primaryAction={
          <AdminButton href="/admin/blog/nyt" variant="primary">
            New post
          </AdminButton>
        }
      />

      {posts.length === 0 ? (
        <EmptyState title="No posts yet." />
      ) : (
        <AdminCard padding="none">
          <AdminTable>
            <AdminThead>
              <tr>
                <AdminTh>Title</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Updated</AdminTh>
              </tr>
            </AdminThead>
            <AdminTbody>
              {posts.map((p) => (
                <AdminTr key={p.id}>
                  <AdminTd>
                    <Link href={`/admin/blog/${p.id}`} className="font-bold text-sol-ink hover:text-sol-accent">
                      {p.title}
                    </Link>
                    <code className="ml-2 text-[11px] text-sol-muted">/blog/{p.slug}</code>
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge tone={p.status === "published" ? "success" : "neutral"}>
                      {p.status === "published" ? "published" : "draft"}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd className="text-sol-muted">
                    {new Date(p.updatedAt).toLocaleDateString("da-DK")}
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTbody>
          </AdminTable>
        </AdminCard>
      )}
    </div>
  );
}
