import { readFileSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Money and dates get formatted through ONE path, with the reading locale.
 *
 * Measured 2026-08-28, four formatters had grown up outside `lib/format.ts`,
 * each with a hardcoded language:
 *   - the Stripe pay button forced `da-DK`, so an English shopper saw Danish
 *     digit grouping on the one number that matters most;
 *   - the §8 price-before-payment line forced `en-US` and glued on a literal
 *     " DKK", so a EUR shop announced euros as kroner;
 *   - the studio configurator forced `en-US`;
 *   - and the two pages of the ACCOUNT section disagreed with each other —
 *     orders formatted every date `en-US` (so /da read "August 28, 2026")
 *     while subscriptions formatted every date `da-DK` (so /en read
 *     "28. august 2026").
 *
 * A hardcoded locale tag in a storefront file is the defect; this catches the
 * next one. The admin is exempt — it is English-only by design and has no
 * request locale to read.
 */

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** A literal language tag passed to an Intl formatter or toLocaleString. */
const HARDCODED_TAG =
  /(?:Intl\.(?:NumberFormat|DateTimeFormat)|toLocaleString|toLocaleDateString|toLocaleTimeString)\(\s*"[a-z]{2}(?:-[A-Z]{2})?"/;

function storefrontFiles(): string[] {
  return [
    ...globSync("app/[locale]/**/*.{ts,tsx}", { cwd: repoRoot }),
    ...globSync("components/**/*.{ts,tsx}", { cwd: repoRoot }),
    ...globSync("designs/**/*.{ts,tsx}", { cwd: repoRoot }),
  ].filter((f) => !f.includes("/admin/"));
}

describe("no hand-rolled locale-hardcoded formatters", () => {
  const files = storefrontFiles();

  it("found storefront files to scan", () => {
    // An empty glob would make the assertion below vacuously true.
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("components/StripePaymentPanel.tsx");
  });

  it.each(files)("%s", (file) => {
    const src = readFileSync(`${repoRoot}${file}`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const offenders = src
      .split("\n")
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter((l) => HARDCODED_TAG.test(l.text));
    expect(
      offenders.map((o) => `:${o.line} ${o.text.trim().slice(0, 90)}`),
      `${file} hardcodes a locale tag — read it from the request ` +
        "(getLocale/useLocale) or go through lib/format.ts",
    ).toEqual([]);
  });
});
