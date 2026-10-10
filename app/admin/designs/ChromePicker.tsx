"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChromeMeta } from "@/lib/builder/chrome-catalog";
import { setChromeAction } from "./actions";

type Props = {
  /** Selectable options for this shop: mixable chromes + the active design's own. */
  headers: ChromeMeta[];
  footers: ChromeMeta[];
  /** Current persisted selection (validated server-side), "" = design default. */
  activeHeaderKey: string;
  activeFooterKey: string;
};

/**
 * Mixer 2.0 Phase 1 — Header/Footer part picker (chrome registry).
 *
 * Two selects (header × footer) following the DesignSelector interaction
 * pattern: change → setChromeAction server action → refresh + inline status.
 * The option lists are computed server-side in DesignsPanel (mixable chromes
 * + the active design's own locked chrome), so nothing unselectable shows.
 */
export default function ChromePicker({
  headers,
  footers,
  activeHeaderKey,
  activeFooterKey,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [headerKey, setHeaderKey] = useState(activeHeaderKey);
  const [footerKey, setFooterKey] = useState(activeFooterKey);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save(nextHeader: string, nextFooter: string) {
    setError(null);
    setSaved(false);
    startTransition(() => {
      void (async () => {
        const result = await setChromeAction(nextHeader, nextFooter);
        if (result.ok) {
          setSaved(true);
          router.refresh();
        } else {
          setError(result.error);
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✓ Chrome updated.{" "}
          <a href="/" className="underline hover:no-underline" target="_blank" rel="noreferrer">
            Open the homepage
          </a>{" "}
          to see the change.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <ChromeSelect
          id="chrome-header-select"
          label="Header"
          value={headerKey}
          options={headers}
          pending={pending}
          onChange={(value) => {
            setHeaderKey(value);
            save(value, footerKey);
          }}
        />
        <ChromeSelect
          id="chrome-footer-select"
          label="Footer"
          value={footerKey}
          options={footers}
          pending={pending}
          onChange={(value) => {
            setFooterKey(value);
            save(headerKey, value);
          }}
        />
      </div>
    </div>
  );
}

function ChromeSelect({
  id,
  label,
  value,
  options,
  pending,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: ChromeMeta[];
  pending: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wider text-sol-muted">
        {label}
      </span>
      <select
        id={id}
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border-2 border-sol-ink/10 bg-white px-3 text-sm font-medium text-sol-ink transition-colors hover:border-sol-ink/30 focus:border-sol-accent focus:outline-none disabled:opacity-60"
      >
        <option value="">Design default</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
            {option.designSlug ? ` — ${option.designSlug}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
