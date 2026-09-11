"use client";

import { useState, type ReactNode } from "react";

export type AdminTab = {
  id: string;
  label: string;
  content: ReactNode;
};

type Props = {
  tabs: AdminTab[];
  /** Initial active tab (e.g. from a `?tab=` search param). Falls back to first. */
  initialTab?: string;
};

/**
 * Generic pill-tab shell for admin hub pages (Integrations, Settings).
 *
 * Tab state is client-side useState — deliberately so: all the forms we host
 * (branding/theme/designs/logo) save via a server action/fetch + router.refresh(),
 * which re-renders the server components WITHOUT unmounting the client tree, so the
 * active tab survives a save. `initialTab` lets us deep-link (e.g. a redirect from
 * /admin/designs → /admin/indstillinger?tab=designs lands on the Designs tab).
 */
export default function AdminTabs({ tabs, initialTab }: Props) {
  const fallback = tabs[0]?.id ?? "";
  const [active, setActive] = useState<string>(
    initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : fallback,
  );

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-1 border-b border-sol-glass-border-dark">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active === tab.id
                ? "border-sol-accent text-sol-accent"
                : "border-transparent text-sol-muted hover:text-sol-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {current?.content}
    </div>
  );
}
