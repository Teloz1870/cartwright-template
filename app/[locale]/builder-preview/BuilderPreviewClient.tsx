"use client";

import { useMemo, useSyncExternalStore } from "react";
import { PageSections } from "@/components/builder/PageSections";
import { resolvePageLayout } from "@/lib/builder/page-layout";

/**
 * Live-preview-render af et Visual Builder draft-tree. Builder-vinduet skriver
 * draftet til sessionStorage (same-origin) og sender en postMessage pr. ændring.
 * Vi læser via useSyncExternalStore: getSnapshot returnerer den seneste rå tree-
 * JSON (fra postMessage, ellers sessionStorage på første load), og message-
 * listeneren er subscription'en. Render går gennem den SAMME `PageSections`/
 * section-registry som storefront → preview og live kan ikke divergere.
 */

const PREVIEW_STORAGE_KEY = "cw:builder:preview";
const PREVIEW_MESSAGE_TYPE = "cw-builder-preview";

// Seneste tree-JSON modtaget via postMessage. Module-level så getSnapshot kan
// returnere en stabil reference (kun ændret når et nyt draft ankommer).
let latestRaw: string | null = null;

function subscribe(onStoreChange: () => void): () => void {
  function onMessage(e: MessageEvent) {
    if (e.origin !== window.location.origin) return;
    const data = e.data as { type?: string; tree?: unknown };
    if (data?.type !== PREVIEW_MESSAGE_TYPE) return;
    latestRaw = JSON.stringify(data.tree ?? {});
    onStoreChange();
  }
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

function getSnapshot(): string {
  if (latestRaw !== null) return latestRaw;
  try {
    return sessionStorage.getItem(PREVIEW_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerSnapshot(): string {
  return "";
}

export default function BuilderPreviewClient() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const sections = useMemo(() => resolvePageLayout(raw || null), [raw]);

  if (sections.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center text-stone-400">
        Tilføj eller aktivér en sektion for at se den her.
      </div>
    );
  }

  return <PageSections sections={sections} />;
}
