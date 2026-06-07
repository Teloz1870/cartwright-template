import { notFound } from "next/navigation";

import { getPostForAdmin } from "../actions";
import { BlogPostForm } from "../BlogPostForm";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function tagsToCsv(raw: string | null): string {
  if (!raw) return "";
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.join(", ") : "";
  } catch {
    return "";
  }
}

export default async function EditPostPage({ params }: Props) {
  const { id } = await params;
  const post = await getPostForAdmin(id);
  if (!post) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Rediger indlæg"
        breadcrumb={[{ label: "Blog", href: "/admin/blog" }]}
      />
      <BlogPostForm
        initial={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          body: post.body,
          coverImage: post.coverImage ?? "",
          author: post.author ?? "",
          status: post.status === "published" ? "published" : "draft",
          tags: tagsToCsv(post.tags),
          metaTitle: post.metaTitle ?? "",
          metaDescription: post.metaDescription ?? "",
        }}
      />
    </div>
  );
}
