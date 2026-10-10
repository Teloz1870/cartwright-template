"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { savePost, deletePost, type BlogFormData } from "./actions";

type Initial = Partial<BlogFormData> & { id?: string };

const input =
  "w-full rounded-lg border-2 border-sol-ink/10 bg-white px-3 py-2 text-sm text-sol-ink";
const label = "text-xs font-bold uppercase tracking-wide text-sol-muted";

export function BlogPostForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [f, setF] = useState<BlogFormData>({
    id: initial.id,
    title: initial.title ?? "",
    slug: initial.slug ?? "",
    excerpt: initial.excerpt ?? "",
    body: initial.body ?? "",
    coverImage: initial.coverImage ?? "",
    author: initial.author ?? "",
    status: (initial.status as "draft" | "published") ?? "draft",
    tags: initial.tags ?? "",
    metaTitle: initial.metaTitle ?? "",
    metaDescription: initial.metaDescription ?? "",
  });

  function set<K extends keyof BlogFormData>(key: K, value: BlogFormData[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await savePost(f);
      if (res.ok) {
        setMsg({ ok: true, text: "Gemt." });
        router.push("/admin/blog");
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className={label}>Titel</span>
        <input className={input} value={f.title} onChange={(e) => set("title", e.target.value)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={label}>Slug (tom = auto)</span>
          <input className={input} value={f.slug} onChange={(e) => set("slug", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Forfatter</span>
          <input className={input} value={f.author} onChange={(e) => set("author", e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={label}>Resumé (excerpt)</span>
        <input className={input} value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Indhold (## overskrift · &gt; citat · **fed**)</span>
        <textarea
          className={`${input} min-h-[300px] font-mono`}
          value={f.body}
          onChange={(e) => set("body", e.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={label}>Cover-billede (URL)</span>
          <input className={input} value={f.coverImage} onChange={(e) => set("coverImage", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Tags (komma-separeret)</span>
          <input className={input} value={f.tags} onChange={(e) => set("tags", e.target.value)} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={label}>Meta-titel (SEO)</span>
          <input className={input} value={f.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Meta-beskrivelse (SEO)</span>
          <input
            className={input}
            value={f.metaDescription}
            onChange={(e) => set("metaDescription", e.target.value)}
          />
        </label>
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={f.status === "published"}
          onChange={(e) => set("status", e.target.checked ? "published" : "draft")}
          className="h-5 w-5"
        />
        <span className="text-sm font-bold text-sol-ink">Publiceret</span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-sol-accent px-5 py-2 text-sm font-bold text-white transition hover:bg-sol-accent-deep disabled:opacity-60"
        >
          {pending ? "Gemmer…" : "Gem"}
        </button>
        {f.id && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!f.id) return;
                await deletePost(f.id);
                router.push("/admin/blog");
                router.refresh();
              })
            }
            className="rounded-lg border-2 border-red-300 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            Slet
          </button>
        )}
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
