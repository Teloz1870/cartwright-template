"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCategory } from "@/app/admin/actions";

type DeleteCategoryButtonProps = {
  id: string;
};

export default function DeleteCategoryButton({ id }: DeleteCategoryButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Slet denne kategori?")) {
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await deleteCategory(id);

        if (!result.ok) {
          alert(result.error);
          return;
        }

        router.refresh();
      })();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Slet
    </button>
  );
}
