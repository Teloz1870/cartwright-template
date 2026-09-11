import { BlogPostForm } from "./BlogPostForm";
import { AdminPageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default function NewPostPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="New blog post"
        breadcrumb={[{ label: "Blog", href: "/admin/blog" }]}
      />
      <BlogPostForm initial={{}} />
    </div>
  );
}
