"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  importGoogleDocAction,
  type DocsImportActionResult,
} from "./actions";

const inputClass =
  "w-full rounded-lg border-2 border-sol-ink/10 bg-white px-3 py-2 text-sm text-sol-ink";

export function DocsImportForm({
  connected,
  accountEmail,
}: {
  connected: boolean;
  accountEmail: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [documentId, setDocumentId] = useState("");
  const [target, setTarget] = useState<"post" | "page">("post");
  const [result, setResult] = useState<DocsImportActionResult | null>(null);

  function submit() {
    setResult(null);
    startTransition(async () => {
      const next = await importGoogleDocAction({
        documentId: documentId.trim(),
        target,
      });
      setResult(next);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="rounded-lg border border-sol-ink/10 bg-sol-sand p-4 text-sm text-sol-ink">
        {connected ? (
          <p>
            Google er forbundet
            {accountEmail ? (
              <>
                {" "}
                som <span className="font-bold">{accountEmail}</span>
              </>
            ) : null}
            .
          </p>
        ) : (
          <p>
            Google OAuth er ikke forbundet. Forbind Google under{" "}
            <Link href="/admin/integrations" className="font-bold underline">
              Integrationer
            </Link>{" "}
            før import.
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm font-bold text-sol-ink">
        Google Doc id eller URL
        <input
          className={inputClass}
          placeholder="https://docs.google.com/document/d/..."
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold text-sol-ink">
        Importér som
        <select
          className={inputClass}
          value={target}
          onChange={(event) => setTarget(event.target.value as "post" | "page")}
        >
          <option value="post">Blogindlæg (draft)</option>
          <option value="page">Side (/info/slug)</option>
        </select>
      </label>

      <button
        type="button"
        disabled={pending || !documentId.trim()}
        onClick={submit}
        className="self-start rounded-lg bg-sol-accent px-5 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
      >
        {pending ? "Importerer..." : "Importér Google Doc"}
      </button>

      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-emerald-600/20 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-bold">Importeret: {result.title}</p>
            <p className="mt-1">
              Slug: <code>{result.slug}</code>
            </p>
            <Link href={result.adminUrl} className="mt-3 inline-block font-bold underline">
              Åbn i admin
            </Link>
          </div>
        ) : (
          <p className="text-sm font-semibold text-red-600">{result.error}</p>
        )
      ) : null}
    </div>
  );
}
