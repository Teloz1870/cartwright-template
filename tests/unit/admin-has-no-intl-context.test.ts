import { readFileSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `app/admin/` is NOT under `app/[locale]/`, so nothing in the admin tree is
 * wrapped in `NextIntlClientProvider` (the only one lives at
 * `app/[locale]/layout.tsx`). A next-intl hook called there throws
 * "context from NextIntlClientProvider was not found" AT RENDER — no type
 * error, no build error, just a broken admin page.
 *
 * Measured 2026-08-28: adding `useTranslations` to `components/shared/PlanCard`
 * (rendered by BOTH the storefront AI panel and the admin chat) would have
 * thrown in the admin the moment the AI returned any confirmation request. It
 * type-checked and built cleanly; only review caught it.
 *
 * The admin surface is English-only by design (the admin→English sweep), so
 * this costs nothing: admin copy is literals, and a component shared with the
 * storefront takes its localized strings as PROPS from each caller.
 */

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// ALLE seks klient-hooks next-intl eksporterer, ikke kun de tre man kommer i
// tanke om. Målt: useMessages, useNow og useTimeZone kaster lige så hårdt som
// useTranslations når de renderes uden provider, så en guard der kun kender de
// populære ville lade `const m = useMessages()` passere og brække siden.
const INTL_HOOK =
  /\b(useTranslations|useLocale|useFormatter|useMessages|useNow|useTimeZone|getTranslations)\s*\(/;

/** Comments are not code: a docblock naming a hook is not a hook call. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the admin tree never reaches for next-intl", () => {
  const adminFiles = [
    ...globSync("app/admin/**/*.{ts,tsx}", { cwd: repoRoot }),
    ...globSync("components/admin/**/*.{ts,tsx}", { cwd: repoRoot }),
    // Plugins render INSIDE app/admin through thin re-export mounts
    // (plugins/blog/admin/*, plugins/reviews/admin/*, …). They are in the same
    // no-provider tree and were outside the original globs.
    ...globSync("plugins/*/admin/**/*.{ts,tsx}", { cwd: repoRoot }),
  ];

  it("actually found admin files to scan", () => {
    // A glob matching nothing would make the assertion below vacuous.
    expect(adminFiles.length).toBeGreaterThan(20);
  });

  it.each(adminFiles)("%s", (file) => {
    const src = stripComments(readFileSync(`${repoRoot}${file}`, "utf8"));
    expect(
      INTL_HOOK.test(src),
      `${file} calls a next-intl hook, but app/admin has no NextIntlClientProvider — ` +
        "it will throw at render. Use a literal (the admin is English-only) or take " +
        "the string as a prop from a caller that has the context.",
    ).toBe(false);
  });

  it("nothing the ROOT layout renders reaches for next-intl either", () => {
    // app/layout.tsx is the non-locale root: it sits ABOVE
    // app/[locale]/layout.tsx, so its children render outside the
    // NextIntlClientProvider exactly like the admin does. ConsentBanner already
    // documents this in its own source and takes `locale` as a PROP for that
    // reason — and converting it to a hook was tried during this series and
    // would have thrown at render. Nothing in the source says which side of the
    // provider a component is on, so it is asserted here instead of remembered.
    const rootLayout = stripComments(
      readFileSync(`${repoRoot}app/layout.tsx`, "utf8"),
    );
    const imported = [...rootLayout.matchAll(/from "@\/(components\/[\w/.-]+)"/g)].map(
      (m) => m[1],
    );
    expect(imported.length, "root layout imports nothing? check the regex").toBeGreaterThan(
      2,
    );
    for (const rel of imported) {
      for (const candidate of [`${rel}.tsx`, `${rel}.ts`, `${rel}/index.tsx`]) {
        let src: string;
        try {
          src = stripComments(readFileSync(`${repoRoot}${candidate}`, "utf8"));
        } catch {
          continue;
        }
        expect(
          INTL_HOOK.test(src),
          `${candidate} is rendered by the ROOT layout, which is outside ` +
            "NextIntlClientProvider — a next-intl hook there throws. Take the " +
            "locale as a prop (the root layout has getLocale()).",
        ).toBe(false);
        break;
      }
    }
  });

  it("PlanCard stays context-free — it renders in BOTH trees", () => {
    // Comments stripped here too — the per-file leg above does it, and without
    // it a future docblock mentioning the hook would turn this red for nothing.
    const src = stripComments(
      readFileSync(`${repoRoot}components/shared/PlanCard.tsx`, "utf8"),
    );
    expect(INTL_HOOK.test(src)).toBe(false);
    // …and it must therefore be given its localized strings.
    expect(src).toContain("paymentLabels");
  });
});
