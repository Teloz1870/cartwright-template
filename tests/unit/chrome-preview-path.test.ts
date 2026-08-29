import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The mixer-preview READ path — `?header=`/`?footer=` on
 * app/[locale]/mixer-preview/page.tsx, the surface the public + admin Mixer
 * iframes to show a Part on a Skin before anything is saved.
 *
 * Third of the five surfaces #422 wired to the ACTIVE pack's own `mixable`
 * field, and — like the two write paths in chrome-write-paths.test.ts — it had
 * nothing hanging off it: deleting the third argument at page.tsx:95 left every
 * chrome/mixer test file green. Its failure mode is quieter than the write
 * paths' (no error, the Part simply does not appear), which is exactly why it
 * needs a test rather than a reader's attention.
 *
 * Mock strategy copied from the sibling mixer-locked-look-notice.test.tsx: mock
 * only `@/designs` (the real barrel pulls every pack incl. next/font),
 * `@/lib/brand` (server-only, prisma-backed getFeatures) and CHROME_REGISTRY
 * (which fail-fasts at module init through the mocked getDesign). The chrome
 * catalog — `getChromeMeta` + `isChromeSelectable`, the thing under test — runs
 * REAL, so these assertions pin the page's actual wiring.
 */

vi.mock("@/lib/brand", () => ({
  getFeatures: vi.fn(async () => ({ mixerPreviewEnabled: true })),
}));

// Stand-ins with a recognisable marker each, so "did the Part render" is a
// substring check rather than a guess at the real chrome's markup.
vi.mock("@/lib/builder/chrome-registry", async () => {
  const { createElement } = await import("react");
  return {
    CHROME_REGISTRY: {
      "mega-footer": {
        Component: () => createElement("div", { "data-part": "mega-footer" }),
      },
      "minimal-header": {
        Component: () => createElement("div", { "data-part": "minimal-header" }),
      },
    },
  };
});

vi.mock("@/designs", async () => {
  const { createElement } = await import("react");
  const mkPack = (slug: string, mixable?: boolean) => ({
    slug,
    name: `Pack ${slug}`,
    description: "test pack",
    mode: "both",
    source: "design.md",
    mixable,
    tokens: {
      prefix: "tst",
      palette: {
        accent: "#112233",
        accentDeep: "#001122",
        cream: "#fefefe",
        sand: "#eeeeee",
        ink: "#111111",
        muted: "#888888",
      },
    },
    homepage: () => createElement("div", { "data-home": slug }),
  });
  const packs: Record<string, ReturnType<typeof mkPack>> = {
    // Outside MIXABLE_DESIGN_SLUGS — the custom-pack case, both ways.
    "acme-bespoke": mkPack("acme-bespoke"),
    "acme-optin": mkPack("acme-optin", true),
    // Inside the slug set — the built-in baseline, and the opt-OUT (a pack
    // the slug set says yes to, overriding itself to no).
    "aurora-site": mkPack("aurora-site"),
    "aurora-shop": mkPack("aurora-shop", false),
  };
  return { getDesign: (slug: string) => packs[slug] ?? null };
});

const FOOTER = "mega-footer";
const HEADER = "minimal-header";

async function renderPreview(sp: Record<string, string>): Promise<string> {
  const { default: MixerPreviewPage } = await import("@/app/[locale]/mixer-preview/page");
  const el = await MixerPreviewPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(sp),
  });
  return renderToStaticMarkup(el);
}

describe("mixer-preview — the previewed pack decides which Parts it may wear", () => {
  /**
   * Non-vacuity floor. Each case only means what it says if its fixture slug
   * sits on the right side of the built-in set: the opt-IN cases need a slug
   * the set REFUSES (so only the pack's field can say yes) and the opt-OUT
   * case needs one the set ACCEPTS (so only the pack's field can say no).
   * Asserted, not assumed — if the set changes, this fails first and names
   * the reason instead of letting a case pass for free.
   */
  it("the fixture slugs sit where the cases need them in the built-in set", async () => {
    const { MIXABLE_DESIGN_SLUGS } = await import("@/designs/options");
    expect(MIXABLE_DESIGN_SLUGS.has("acme-bespoke")).toBe(false);
    expect(MIXABLE_DESIGN_SLUGS.has("acme-optin")).toBe(false);
    expect(MIXABLE_DESIGN_SLUGS.has("aurora-site")).toBe(true);
    expect(MIXABLE_DESIGN_SLUGS.has("aurora-shop")).toBe(true);
  });

  it("renders a neutral Part on a CUSTOM pack that declares mixable: true", async () => {
    const html = await renderPreview({ design: "acme-optin", footer: FOOTER });
    expect(html).toContain('data-part="mega-footer"');
    expect(html).toContain('data-home="acme-optin"'); // the page still rendered
  });

  it("drops the same Part when that pack declares nothing (slug-set answer)", async () => {
    const html = await renderPreview({ design: "acme-bespoke", footer: FOOTER });
    expect(html).not.toContain('data-part="mega-footer"');
    expect(html).toContain('data-home="acme-bespoke"');
  });

  it("drops it on a BUILT-IN mixable pack that opts out with mixable: false", async () => {
    const html = await renderPreview({ design: "aurora-shop", footer: FOOTER });
    expect(html).not.toContain('data-part="mega-footer"');
    expect(html).toContain('data-home="aurora-shop"');
  });

  it("is unchanged for a shipped pack that declares nothing", async () => {
    const html = await renderPreview({ design: "aurora-site", footer: FOOTER });
    expect(html).toContain('data-part="mega-footer"');
  });

  /**
   * `validChromeKey` is three conjuncts — registered, right KIND, selectable —
   * and the cases above only exercise the third. Without this, naming a footer
   * in the header slot would render a footer where the header goes and nothing
   * would notice. Slot POSITION is asserted for the same reason: the two Parts
   * bracket the homepage, and a substring check alone cannot tell them apart.
   */
  it("ignores a Part named in the wrong slot, and puts each Part on its own side", async () => {
    const swapped = await renderPreview({ design: "acme-optin", header: FOOTER });
    expect(swapped).not.toContain('data-part="mega-footer"');
    expect(swapped).toContain('data-home="acme-optin"');

    const both = await renderPreview({ design: "acme-optin", header: HEADER, footer: FOOTER });
    expect(both.indexOf('data-part="minimal-header"')).toBeGreaterThan(-1);
    expect(both.indexOf('data-part="minimal-header"')).toBeLessThan(
      both.indexOf('data-home="acme-optin"'),
    );
    expect(both.indexOf('data-part="mega-footer"')).toBeGreaterThan(
      both.indexOf('data-home="acme-optin"'),
    );
  });

  it("gates the HEADER slot by the same rule", async () => {
    const optedIn = await renderPreview({ design: "acme-optin", header: HEADER });
    expect(optedIn).toContain('data-part="minimal-header"');

    const silent = await renderPreview({ design: "acme-bespoke", header: HEADER });
    expect(silent).not.toContain('data-part="minimal-header"');
  });
});
