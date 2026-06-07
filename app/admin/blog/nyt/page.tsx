import { BlogPostForm } from "../BlogPostForm";

export const dynamic = "force-dynamic";

export default function NewPostPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black text-sol-ink">Nyt blogindlæg</h1>
      <BlogPostForm initial={{}} />
    </div>
  );
}
