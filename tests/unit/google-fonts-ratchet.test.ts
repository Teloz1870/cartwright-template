import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * FONT1 ratchet: `next/font/google` may only SHRINK in the engine.
 *
 * Every `next/font/google` call fetches from Google on a cold build, and that
 * fetch fails builds at random (three red builds on 2026-10-03, two more in the
 * FONT1-a gate run). Families move to self-hosted modules in app/fonts/ a slice
 * at a time; this list is what is still left. A NEW importer goes red (self-host
 * the family instead: scripts/fonts/fetch.mjs + app/fonts/<family>/font.ts), and
 * so does a listed file that no longer imports it — strike it here, so the list
 * only ever gets shorter, down to empty.
 *
 * Engine-only (the repo-hygiene probe): a customer scaffold prunes packs, and a
 * customer may load any Google font they like (the blank pack's guide says how).
 */
const ROOT = path.resolve(__dirname, "../..");
const isEngineCheckout = existsSync(path.join(ROOT, ".github", "sync-excludes.txt"));

const STILL_ON_GOOGLE = [
  "designs/aerospace/chrome.tsx",
  "designs/crema/fonts.ts",
  "designs/drive/chrome.tsx",
  "designs/editorial-ink/chrome.tsx",
  "designs/editorial-ink/homepage.tsx",
  "designs/ember/chrome.tsx",
  "designs/ember/sections/EmberHero.tsx",
  "designs/engineered/chrome.tsx",
  "designs/engineered/homepage.tsx",
  "designs/fable/chrome.tsx",
  "designs/fable/sections/FableHero.tsx",
  "designs/fable/sections/FableMetamorphosis.tsx",
  "designs/flux/chrome.tsx",
  "designs/halo/chrome.tsx",
  "designs/meridian/chrome.tsx",
  "designs/meridian/homepage.tsx",
  "designs/nocturne/chrome.tsx",
  "designs/nocturne/homepage.tsx",
  "designs/stillwater/chrome.tsx",
  "designs/stillwater/sections/StillwaterHero.tsx",
  "designs/stillwater/sections/StillwaterMetrics.tsx",
  "designs/stillwater/sections/StillwaterNight.tsx",
  "designs/stillwater/sections/StillwaterPanels.tsx",
  "designs/stillwater/sections/StillwaterTestimonials.tsx",
];

/** Source files under the shipped roots (and the repo root), repo-relative. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || (dir === ROOT && e.name.startsWith("."))) continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (e.isDirectory()) {
        if (rel === "app/generated") continue; // gitignored Prisma output
        if (dir !== ROOT || /^(app|components|designs|hooks|i18n|lib|plugins|types|verticals|scripts)$/.test(e.name)) walk(full);
      } else if (/\.(tsx?|mjs|js)$/.test(e.name)) out.push(rel);
    }
  };
  walk(ROOT);
  return out;
}

describe.skipIf(!isEngineCheckout)("next/font/google only shrinks (FONT1)", () => {
  const importers = sources()
    .filter((f) => /from\s+["']next\/font\/google["']/.test(readFileSync(path.join(ROOT, f), "utf8")))
    .sort();

  it("no file outside the list imports next/font/google", () => {
    expect(importers.filter((f) => !STILL_ON_GOOGLE.includes(f))).toEqual([]);
  });

  it("every listed file still imports it — strike converted files from the list", () => {
    expect(STILL_ON_GOOGLE.filter((f) => !importers.includes(f))).toEqual([]);
  });
});
