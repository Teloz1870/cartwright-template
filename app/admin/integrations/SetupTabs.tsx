"use client";

import { useState, type ReactNode } from "react";

type Props = {
  keys: ReactNode;
  runbook: ReactNode;
};

const tabs = [
  { id: "keys", label: "API-nøgler" },
  { id: "setup", label: "Setup-guide" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function SetupTabs({ keys, runbook }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("keys");

  return (
    <div className="flex flex-col gap-6">
      <div className="inline-flex w-fit rounded-pill border border-sol-ink/10 bg-white p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-pill px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
              activeTab === tab.id
                ? "bg-sol-accent text-white"
                : "text-sol-muted hover:bg-sol-cream hover:text-sol-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "keys" ? keys : runbook}
    </div>
  );
}
