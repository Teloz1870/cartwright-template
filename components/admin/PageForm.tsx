"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPage, updatePage } from "@/app/admin/actions";

type PageFormPage = {
  id: string;
  slug: string;
  title: string;
  body: string;
};

type PageFormProps = {
  page?: PageFormPage;
};

const inputClass =
  "w-full rounded-lg border border-sol-ink/15 bg-white px-3 py-2 text-sm font-semibold text-sol-ink placeholder:text-sol-muted/70 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25";

const labelClass = "mb-1 block text-xs font-black uppercase text-sol-muted";

export default function PageForm({ page }: PageFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void (async () => {
        const result = page
          ? await updatePage(page.id, formData)
          : await createPage(formData);

        if (result.ok) {
          router.push("/admin/sider");
          return;
        }

        setError(result.error);
      })();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-4xl rounded-2xl border border-sol-ink/10 bg-white p-5 shadow-sm"
    >
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="slug" className={labelClass}>
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            defaultValue={page?.slug ?? ""}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="title" className={labelClass}>
            Titel
          </label>
          <input
            id="title"
            name="title"
            type="text"
            defaultValue={page?.title ?? ""}
            className={inputClass}
            required
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="body" className={labelClass}>
            Indhold
          </label>
          <textarea
            id="body"
            name="body"
            rows={16}
            defaultValue={page?.body ?? ""}
            className={inputClass}
            required
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-sol-accent px-5 py-2.5 text-sm font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Gemmer…" : "Gem side"}
        </button>
      </div>
    </form>
  );
}
