import Link from "next/link";

import { getPostsForAdmin } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const posts = await getPostsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-sol-ink">Blog</h1>
          <p className="mt-1 text-sm text-sol-muted">
            Tænd bloggen under{" "}
            <a href="/admin/features" className="underline">Funktioner</a>. Posts vises på{" "}
            <code className="rounded bg-sol-ink/5 px-1">/blog</code>.
          </p>
        </div>
        <Link
          href="/admin/blog/nyt"
          className="shrink-0 rounded-lg bg-sol-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep"
        >
          Nyt indlæg
        </Link>
      </header>

      {posts.length === 0 ? (
        <p className="text-sol-muted">Ingen indlæg endnu.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-sol-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-sol-sand text-xs uppercase tracking-wide text-sol-muted">
              <tr>
                <th className="px-3 py-2">Titel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Opdateret</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-t border-sol-ink/10">
                  <td className="px-3 py-2">
                    <Link href={`/admin/blog/${p.id}`} className="font-bold text-sol-ink hover:text-sol-accent">
                      {p.title}
                    </Link>
                    <code className="ml-2 text-[11px] text-sol-muted">/blog/{p.slug}</code>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        p.status === "published"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-sol-ink/10 text-sol-muted"
                      }`}
                    >
                      {p.status === "published" ? "publiceret" : "kladde"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sol-muted">
                    {new Date(p.updatedAt).toLocaleDateString("da-DK")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
