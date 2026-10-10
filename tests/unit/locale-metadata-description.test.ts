import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The `<meta name="description">` must be in the language of the page.
 *
 * The root layout writes it from `brand.metadata.description` — one string —
 * and it sits ABOVE the `[locale]` segment, so it cannot know which language
 * it is describing. Measured on the eyewear canary: /en served a fully Danish
 * description while every visible word around it was English. That tag is the
 * one piece of copy on the page written FOR search engines and shopping
 * agents, which makes it the worst place to leave the wrong language.
 *
 * Source-level because the behaviour is Next.js metadata MERGING, which a unit
 * test cannot exercise without a running app: what has to stay true is that
 * the locale layout overrides the description, and only the description.
 */
const LAYOUT = readFileSync(
  join(process.cwd(), "app/[locale]/layout.tsx"),
  "utf8",
);
const ROOT = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the locale layout localises the meta description", () => {
  it("exports generateMetadata at all", () => {
    expect(LAYOUT).toMatch(/export async function generateMetadata/);
  });

  it("runs the description through the localiser, with the page's locale", () => {
    expect(LAYOUT).toMatch(/localizedBrandCopy\(\s*"metadata\.description"/);
    expect(LAYOUT).toMatch(/resolved\.metadata\.description,\s*locale,/);
  });

  it("covers all three places the root layout writes it", () => {
    // description, openGraph.description, twitter.description — miss one and
    // an agent reading the social card still gets the wrong language.
    const emitted = LAYOUT.slice(LAYOUT.indexOf("export async function generateMetadata"));
    const body = emitted.slice(0, emitted.indexOf("export default"));
    expect(body).toMatch(/^\s+description,$/m);
    expect(body).toMatch(/openGraph:\s*\{\s*description\s*\}/);
    expect(body).toMatch(/twitter:\s*\{\s*description\s*\}/);
  });

  it("does NOT restate the root's other metadata", () => {
    // Re-declaring the base URL or the card type here would silently drop the
    // root's social image on every page. Inheritance is the point.
    //
    // Comments stripped first: the docblock NAMES the fields it deliberately
    // leaves alone, and a guard that trips on its own explanation teaches
    // people to delete the explanation.
    const emitted = LAYOUT.slice(LAYOUT.indexOf("export async function generateMetadata"));
    const body = stripComments(emitted.slice(0, emitted.indexOf("export default")));
    expect(body).not.toContain("metadataBase");
    expect(body).not.toContain("card:");
    expect(body).not.toContain("siteName");
  });

  it("the root still writes all three (else this test guards nothing)", () => {
    // Anti-vacuity: if the root stopped emitting them, the override above
    // would be pointless and this file would pass while proving nothing.
    expect(ROOT).toMatch(/description: resolved\.metadata\.description/);
    expect((ROOT.match(/resolved\.metadata\.description/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
