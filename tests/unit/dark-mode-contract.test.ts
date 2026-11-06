import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Dark-mode contract — guards the unification shipped in fix/dark-mode-unify.
 *
 * Pre-unification the codebase had TWO independent dark systems that disagreed:
 *   1. next-themes toggled the `.dark` CLASS on <html>, which the sol-token
 *      overrides in themes/generic.css follow (`:root.dark { --color-sol-* }`).
 *   2. Tailwind v4's DEFAULT `dark:` variant follows the OS media query
 *      (prefers-color-scheme) — so all `dark:` utilities flipped on OS-dark
 *      while the tokens did not (light background, near-white text), and the
 *      class toggle flipped tokens but not utilities.
 *
 * The contract enforced here:
 *   A. globals.css re-keys `dark:` to the `.dark` class via @custom-variant —
 *      ONE switch, owned by the class. Removing the line silently reverts the
 *      split-brain (Tailwind falls back to the media query without erroring).
 *   B. The root ThemeProvider keeps enableSystem={false} so the OS preference
 *      never sets the class by itself.
 *   C. Admin is decoupled and ALWAYS light: [data-admin-skin] pins
 *      color-scheme: light, themes/admin.css has no `.dark`-scoped overrides,
 *      no admin file carries `dark:` utilities, and the admin chrome does not
 *      mount ThemeToggle (the global `.dark` class themes the CUSTOMER
 *      storefront — admin must never flip it).
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("dark-mode contract", () => {
  it("globals.css re-keys the dark: variant to the .dark class (single switch)", () => {
    const css = read("app/globals.css");
    expect(css).toContain("@custom-variant dark (&:where(.dark, .dark *));");
  });

  it("globals.css sets color-scheme per theme (light default, dark under .dark)", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/:root\s*\{\s*color-scheme:\s*light;\s*\}/);
    expect(css).toMatch(/:root\.dark\s*\{\s*color-scheme:\s*dark;\s*\}/);
  });

  it("root ThemeProvider keeps enableSystem={false} (OS dark never flips the class)", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("enableSystem={false}");
  });

  it("storefront token overrides stay keyed to the same .dark class", () => {
    const generic = read("themes/generic.css");
    expect(generic).toContain(":root.dark");
  });

  describe("admin is decoupled and always light", () => {
    it("[data-admin-skin] pins color-scheme: light", () => {
      const admin = read("themes/admin.css");
      expect(admin).toMatch(/\[data-admin-skin\]\s*\{[^}]*color-scheme:\s*light;/);
    });

    it("themes/admin.css has no .dark-scoped overrides", () => {
      // No selector may key admin tokens off the storefront theme class —
      // strip comments, then assert `.dark` appears in no remaining selector.
      const admin = read("themes/admin.css").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(admin).not.toContain(".dark");
    });

    it("no admin file carries dark: utilities (dead after the decoupling)", () => {
      const offenders: string[] = [];
      const DARK_UTILITY = /[\s"'`{]dark:[a-z[]/;
      const walk = (dir: string) => {
        for (const entry of readdirSync(join(root, dir))) {
          const rel = join(dir, entry);
          if (statSync(join(root, rel)).isDirectory()) {
            walk(rel);
          } else if (/\.(tsx|ts)$/.test(entry) && DARK_UTILITY.test(read(rel))) {
            offenders.push(rel);
          }
        }
      };
      walk("app/admin");
      walk("components/admin");
      expect(offenders).toEqual([]);
    });

    it("admin chrome does not mount ThemeToggle (admin must not theme the storefront)", () => {
      const topbar = read("components/admin/AdminTopBar.tsx");
      expect(topbar).not.toMatch(/<ThemeToggle/);
      const adminLayout = read("app/admin/layout.tsx");
      expect(adminLayout).not.toMatch(/<ThemeToggle/);
    });
  });
});
