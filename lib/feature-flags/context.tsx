"use client";

import { createContext, useContext, type ReactNode } from "react";

import { brand } from "@/brand.config";

/**
 * Klient-side resolved feature-flags. Mounted i app/[locale]/layout.tsx med
 * initial-værdi fra getBrand() (samme request) — derfor matcher SSR-markup og
 * post-hydration context-værdi præcis, og der er INGEN hydrerings-mismatch.
 *
 * HYDRERINGS-REGEL: læs flag-tilstand fra useFeatures()/useFeature() (request-
 * resolved, hydration-stabil). Browser-CAPABILITY-checks (supportsDialog(),
 * supportsViewTransitions() fra lib/features.ts) skal blive i post-mount-
 * effekter som hidtil — bland dem ikke ind i SSR-flag-læsningen. Mønster:
 *   const popoverApi = useFeature("popoverApi");
 *   ... if (popoverApi && supportsDialog()) { ... }   // capability i effekt
 *
 * Storefront har ikke brug for en setter — feature-toggles sker i /admin/features
 * (server-action) og slår igennem ved næste server-render (≤30s, getBrand-cache).
 */

export type FeatureFlags = { [K in keyof typeof brand.features]: boolean };

const FeaturesContext = createContext<FeatureFlags | null>(null);

export function FeaturesProvider({
  initial,
  children,
}: {
  initial: FeatureFlags;
  children: ReactNode;
}) {
  return (
    <FeaturesContext.Provider value={initial}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures(): FeatureFlags {
  const ctx = useContext(FeaturesContext);
  if (!ctx) {
    // Defensiv fallback for komponenter renderet uden for provideren (fx
    // isolerede tests/snapshots) — brug compile-time defaults fra brand.config.
    return brand.features as FeatureFlags;
  }
  return ctx;
}

export function useFeature(key: keyof FeatureFlags): boolean {
  return useFeatures()[key];
}
