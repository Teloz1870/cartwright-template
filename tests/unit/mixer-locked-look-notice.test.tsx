import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Mixer-preview Skin×Voice locked-look notice — page wiring.
 *
 * A Voice's palette only restyles packs whose rendering tracks the injected
 * sol-* / cw-* vars (paletteToFullThemeCss); a private-prefix pack never reads
 * them, so the preview would silently look like "the Voice did nothing". The
 * page must surface `LockedLookNotice` EXACTLY when a Voice is present AND
 * the previewed pack resolves `designTracksPalette` → false (sol-/cw-prefix,
 * `applyPaletteAsTheme` and mixable packs all track the palette; the pack's
 * own `mixable` override wins over the built-in slug set).
 *
 * Mock strategy: mock ONLY `@/designs` (the real registry pulls every pack,
 * incl. next/font side effects), `@/lib/brand` (server-only, prisma-backed
 * getFeatures) and `CHROME_REGISTRY` (fail-fasts at module init through the
 * mocked getDesign); `@/verticals` DELEGATES to the real registry (plus one
 * synthetic palette-less Voice — see the mock). Everything else runs REAL:
 * `designTracksPalette`, buildGenome, designToInlineCss/paletteToFullThemeCss
 * and the chrome catalog — so the assertions pin the page's actual wiring,
 * not a re-implementation.
 * (NODE_ENV is "test" ≠ "production", so the route's gate always allows here.)
 */

vi.mock("@/lib/brand", () => ({
  getFeatures: vi.fn(async () => ({ mixerPreviewEnabled: false })),
}));

// Delegate to the REAL verticals registry, plus one synthetic palette-less
// Voice: `VerticalPreset.palette` is optional (copy-/scene-only Voices), and
// no built-in preset omits it, so the "Voice without a palette" leg is only
// reachable through this stripped clone of the real cafe preset.
vi.mock("@/verticals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/verticals")>();
  return {
    ...actual,
    getVertical: (slug: string | null | undefined) => {
      if (slug === "no-palette-voice") {
        const base = actual.getVertical("cafe");
        return base ? { ...base, palette: undefined } : null;
      }
      return actual.getVertical(slug);
    },
  };
});

// CHROME_REGISTRY fail-fasts at module init by resolving every design chrome
// through getDesign() — which this file mocks. None of these cases pass
// ?header=/?footer=, so an empty registry is faithful (the page reads it only
// for valid chrome keys).
vi.mock("@/lib/builder/chrome-registry", () => ({ CHROME_REGISTRY: {} }));

vi.mock("@/designs", async () => {
  const { createElement } = await import("react");
  const mkPack = (
    slug: string,
    opts: { prefix?: string; mixable?: boolean; applyPaletteAsTheme?: boolean } = {},
  ) => ({
    slug,
    name: `Pack ${slug}`,
    description: "test pack",
    mode: "both",
    source: "design.md",
    mixable: opts.mixable,
    applyPaletteAsTheme: opts.applyPaletteAsTheme,
    tokens: {
      prefix: opts.prefix ?? "tst",
      palette: {
        accent: "#112233",
        accentDeep: "#001122",
        cream: "#fefefe",
        sand: "#eeeeee",
        ink: "#111111",
        muted: "#888888",
      },
    },
    homepage: ({ locale }: { locale: string }) =>
      createElement("div", { "data-home": slug, "data-locale": locale }),
  });
  const packs: Record<string, ReturnType<typeof mkPack>> = {
    // Private prefix, slug outside the mixable set, no overrides → locked.
    "locked-pack": mkPack("locked-pack"),
    // Slug INSIDE the built-in mixable set → tracks the palette.
    "aurora-site": mkPack("aurora-site"),
    // sol-prefix pack (webshop-classic class): NOT Parts-mixable, but the
    // palette lands on sol-* vars → tracks the palette → no notice.
    "sol-pack": mkPack("sol-pack", { prefix: "sol" }),
    // cw-prefix pack outside the mixable set (blank class) → tracks.
    "cw-pack": mkPack("cw-pack", { prefix: "cw" }),
    // applyPaletteAsTheme pack with a private prefix → tracks.
    "apt-pack": mkPack("apt-pack", { applyPaletteAsTheme: true }),
    // Slug INSIDE the set but pack opts out via mixable:false AND has a
    // private prefix → override wins → locked → notice.
    studio: mkPack("studio", { mixable: false }),
    // Private prefix but the pack declares itself cw-coherent → no notice.
    "custom-adaptive": mkPack("custom-adaptive", { mixable: true }),
  };
  return { getDesign: (slug: string) => packs[slug] ?? null };
});

async function renderPreview(sp: Record<string, string>): Promise<string> {
  const { default: MixerPreviewPage } = await import(
    "@/app/[locale]/mixer-preview/page"
  );
  const el = await MixerPreviewPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(sp),
  });
  return renderToStaticMarkup(el);
}

const NOTICE_MARKER = "keeps its own locked look";

describe("mixer-preview LockedLookNotice wiring", () => {
  it("shows the notice for Voice × locked-look skin (and still renders the homepage)", async () => {
    const html = await renderPreview({ design: "locked-pack", vertical: "cafe" });
    expect(html).toContain(NOTICE_MARKER);
    expect(html).toContain("Pack locked-pack");
    expect(html).toContain('aria-label="Dismiss notice"');
    expect(html).toContain('role="status"');
    // The preview itself must keep rendering under the notice.
    expect(html).toContain('data-home="locked-pack"');
  });

  it("no notice without a Voice, even on a locked-look skin", async () => {
    const html = await renderPreview({ design: "locked-pack" });
    expect(html).not.toContain(NOTICE_MARKER);
    expect(html).toContain('data-home="locked-pack"');
  });

  it("no notice for Voice × mixable skin", async () => {
    const html = await renderPreview({ design: "aurora-site", vertical: "cafe" });
    expect(html).not.toContain(NOTICE_MARKER);
    expect(html).toContain('data-home="aurora-site"');
  });

  it("no notice for a sol-prefix pack — palette-adaptive without being Parts-mixable", async () => {
    const html = await renderPreview({ design: "sol-pack", vertical: "cafe" });
    expect(html).not.toContain(NOTICE_MARKER);
    expect(html).toContain('data-home="sol-pack"');
  });

  it("no notice for a cw-prefix pack outside the mixable set (blank class)", async () => {
    const html = await renderPreview({ design: "cw-pack", vertical: "cafe" });
    expect(html).not.toContain(NOTICE_MARKER);
    expect(html).toContain('data-home="cw-pack"');
  });

  it("no notice for an applyPaletteAsTheme pack with a private prefix", async () => {
    const html = await renderPreview({ design: "apt-pack", vertical: "cafe" });
    expect(html).not.toContain(NOTICE_MARKER);
    expect(html).toContain('data-home="apt-pack"');
  });

  it("pack `mixable: false` + private prefix wins over the built-in set → notice", async () => {
    const html = await renderPreview({ design: "studio", vertical: "cafe" });
    expect(html).toContain(NOTICE_MARKER);
    expect(html).toContain("Pack studio");
  });

  it("pack `mixable: true` override wins for a private-prefix custom pack → no notice", async () => {
    const html = await renderPreview({ design: "custom-adaptive", vertical: "cafe" });
    expect(html).not.toContain(NOTICE_MARKER);
    expect(html).toContain('data-home="custom-adaptive"');
  });

  it("no notice for a palette-less Voice, even on a locked-look skin", async () => {
    const html = await renderPreview({
      design: "locked-pack",
      vertical: "no-palette-voice",
    });
    expect(html).not.toContain(NOTICE_MARKER);
    expect(html).toContain('data-home="locked-pack"');
  });

  it("unknown vertical slug means no Voice → no notice (fail-soft)", async () => {
    const html = await renderPreview({
      design: "locked-pack",
      vertical: "not-a-vertical",
    });
    expect(html).not.toContain(NOTICE_MARKER);
    expect(html).toContain('data-home="locked-pack"');
  });
});
