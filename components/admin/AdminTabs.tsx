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
 * Generisk pille-tab-shell til admin-hub-sider (Integrationer, Indstillinger).
 *
 * Tab-state er client-side useState — det er bevidst: alle de forms vi hoster
 * (branding/tema/designs/logo) gemmer via server-action/fetch + router.refresh(),
 * som re-renderer server-komponenterne UDEN at unmounte client-træet, så den
 * aktive tab overlever en save. `initialTab` lader os dyb-linke (fx redirect fra
 * /admin/designs → /admin/indstillinger?tab=designs lander på Designs-tabben).
 */
export default function AdminTabs({ tabs, initialTab }: Props) {
  const fallback = tabs[0]?.id ?? "";
  const [active, setActive] = useState<string>(
    initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : fallback,
  );

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="inline-flex w-fit flex-wrap rounded-pill border border-sol-ink/10 bg-sol-sand p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`rounded-pill px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
              active === tab.id
                ? "bg-sol-accent text-white"
                : "text-sol-muted hover:bg-sol-cream hover:text-sol-ink"
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
