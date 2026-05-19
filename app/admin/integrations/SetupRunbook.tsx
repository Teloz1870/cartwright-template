"use client";

import { useMemo, useState, useTransition } from "react";
import { toggleManualChecklistItemAction } from "./actions";
import type { SetupItem, SetupItemCategory, SetupItemStatus } from "@/lib/setup-status";

type Props = {
  items: SetupItem[];
  totalRequired: number;
  okCount: number;
  pctComplete: number;
};

const categoryLabels = {
  payment: "Betaling",
  email: "Email og AI",
  monitoring: "Monitoring",
  cron: "Cron",
  legal: "Legal og GDPR",
  trust: "Trust",
} satisfies Record<SetupItemCategory, string>;

const categoryOrder: SetupItemCategory[] = [
  "payment",
  "email",
  "monitoring",
  "cron",
  "legal",
  "trust",
];

const statusLabel = {
  ok: "Klar",
  missing: "Mangler",
  warning: "Advarsel",
} satisfies Record<SetupItemStatus, string>;

const statusClasses = {
  ok: "bg-green-50 text-green-800 ring-green-200",
  missing: "bg-amber-50 text-amber-900 ring-amber-200",
  warning: "bg-orange-50 text-orange-900 ring-orange-200",
} satisfies Record<SetupItemStatus, string>;

export default function SetupRunbook({
  items,
  totalRequired,
  okCount,
  pctComplete,
}: Props) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(
    () =>
      categoryOrder
        .map((category) => ({
          category,
          items: localItems.filter((item) => item.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [localItems],
  );

  function toggleManualItem(item: SetupItem, done: boolean) {
    setPendingId(item.id);
    setLocalItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, status: done ? "ok" : "missing" }
          : candidate,
      ),
    );

    startTransition(async () => {
      const result = await toggleManualChecklistItemAction(item.id, done);
      if (!result.ok) {
        setLocalItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, status: item.status }
              : candidate,
          ),
        );
      }
      setPendingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-sol-ink">Setup-guide</h2>
            <p className="mt-1 text-sm text-sol-muted">
              {okCount}/{totalRequired} påkrævede opgaver er klar.
            </p>
          </div>
          <div className="text-3xl font-black text-sol-accent">
            {pctComplete}%
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-pill bg-sol-cream">
          <div
            className="h-full rounded-pill bg-sol-accent transition-all"
            style={{ width: `${pctComplete}%` }}
          />
        </div>
      </section>

      <div className="space-y-4">
        {groups.map((group) => {
          const groupOk = group.items.filter((item) => item.status === "ok").length;
          const defaultOpen = group.items.some((item) => item.status === "missing");

          return (
            <details
              key={group.category}
              className="overflow-hidden sol-card-elevated"
              open={defaultOpen}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
                <span className="text-base font-black text-sol-ink">
                  {categoryLabels[group.category]}
                </span>
                <span className="text-sm font-bold text-sol-muted">
                  {groupOk}/{group.items.length}
                </span>
              </summary>

              <div className="divide-y divide-sol-ink/10 border-t border-sol-ink/10">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="flex min-w-0 gap-3">
                      {item.manual ? (
                        <input
                          type="checkbox"
                          checked={item.status === "ok"}
                          disabled={isPending && pendingId === item.id}
                          onChange={(event) =>
                            toggleManualItem(item, event.currentTarget.checked)
                          }
                          className="mt-1 h-4 w-4 rounded border-sol-ink/20 accent-sol-accent"
                        />
                      ) : (
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                            item.status === "ok"
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {item.status === "ok" ? "✓" : "!"}
                        </span>
                      )}

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black text-sol-ink">{item.label}</h3>
                          <span
                            className={`inline-flex rounded-pill px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${statusClasses[item.status]}`}
                          >
                            {statusLabel[item.status]}
                          </span>
                          {item.manual && (
                            <span className="text-[10px] font-black uppercase tracking-wide text-sol-muted">
                              Manuel
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-1 text-sm leading-6 text-sol-muted">
                            {item.description}
                          </p>
                        )}
                        {item.copyableValue && (
                          <code className="mt-2 block overflow-x-auto rounded-lg bg-sol-cream px-3 py-2 text-xs text-sol-ink">
                            {item.copyableValue}
                          </code>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 md:justify-end">
                      {item.setupHref && (
                        <a
                          href={item.setupHref}
                          className="inline-flex rounded-pill bg-sol-accent px-3 py-2 text-xs font-black uppercase tracking-wide text-white transition hover:brightness-95"
                        >
                          Konfigurér
                        </a>
                      )}
                      {item.helpUrl && (
                        <a
                          href={item.helpUrl}
                          target={item.helpUrl.startsWith("http") ? "_blank" : undefined}
                          rel={item.helpUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                          className="inline-flex rounded-pill border border-sol-ink/15 px-3 py-2 text-xs font-black uppercase tracking-wide text-sol-muted transition hover:bg-sol-cream hover:text-sol-ink"
                        >
                          Hjælp
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
