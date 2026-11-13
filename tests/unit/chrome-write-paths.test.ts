import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The two chrome WRITE paths — `chrome.set` (the build agent / MCP) and
 * `setChromeAction` (the human in /admin/designs). Both validate a requested
 * Part against the ACTIVE design before persisting it, and both were wired to
 * pass the active PACK's own `mixable` field into `isChromeSelectable` so a
 * pack a customer writes can opt in (or a built-in pack can opt out) instead of
 * the built-in slug set being the only answer.
 *
 * Why this file exists: that wiring was assertion, not test. Deleting the third
 * argument in either surface left the whole suite green — the render path
 * (chrome-render-path.test.ts) was the only one of the five wired surfaces with
 * anything hanging off it. These are the two where dropping it has a
 * user-visible consequence: a valid selection comes back as an ERROR ("only
 * renders on the … design") rather than silently not rendering.
 *
 * The third wired surface, the mixer-preview page, is pinned in the sibling
 * chrome-preview-path.test.ts. That leaves ONE of the five: the /admin/designs
 * picker (DesignsPanel.tsx). It is scope, not impossibility — the panel is an
 * async Server Component that `renderToStaticMarkup` can drive the same way
 * (mixer-locked-look-notice.test.tsx does exactly that for the preview page) —
 * but it reaches prisma, `resolveStoreIdentity` and five child components of
 * its own, so it needs its own mock surface rather than a case in this file.
 *
 * Do NOT read that as "cosmetic". The panel threads the field into TWO call
 * sites, and the second is not a list: `DesignsPanel.tsx:80`
 * `parseChromeConfig(chromeRow?.chromeJson, activeSlug, activePackMixable)`
 * feeds ChromePicker's `activeHeaderKey`/`activeFooterKey` (:151-152), and
 * ChromePicker saves BOTH slots on every change (`ChromePicker.tsx:80,91` →
 * `save(value, footerKey)` / `save(headerKey, value)` → `setChromeAction`).
 * So if that leg regressed, a customer's saved Part would show as "Design
 * default" and their next unrelated edit would silently WIPE it — an empty
 * string is a legitimate reset, so the write path pinned below waves it
 * through by design. Data-losing, not mild. Filed as a follow-up with that
 * severity rather than smuggled in here.
 *
 * Mocks, not fixtures: the answer only moves for a pack whose `mixable`
 * DIFFERS from the slug set, and no shipped pack does that (pinned by the
 * engine-only invariant in chrome-registry.test.ts). Without a fabricated pack
 * there is nothing to observe. `@/lib/theme` is mocked rather than imported for
 * the same reason chrome-render-path.test.ts mocks `@/designs` — the real
 * module pulls the design barrel (~2 s of module load; the leaf-modules
 * lesson).
 */

/** Only the field the assertions read — enough to type `mock.calls[0][0]`. */
type UpsertArgs = { update: { chromeJson: string | null } };

const h = vi.hoisted(() => ({
  getActiveDesign: vi.fn(),
  invalidateThemeCache: vi.fn(),
  upsert: vi.fn(async (_args: UpsertArgs) => undefined),
  findUnique: vi.fn(async (_args: unknown) => null),
  requireAdmin: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/theme", () => ({
  getActiveDesign: h.getActiveDesign,
  invalidateThemeCache: h.invalidateThemeCache,
  // exported for lib/compositions/export.ts, which compose.ts imports
  parseThemeJson: () => null,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    brandingSettings: { upsert: h.upsert, findUnique: h.findUnique },
  },
}));

// Order-faithful only — this file is about the selectability gate, not audit
// semantics (those are pinned in the audit tests). The point is that the write
// runs at all, i.e. the gate let the selection through. `before()` IS invoked,
// the way lib/audit.ts:59 does, so `chrome.set`'s before-capture closure (and
// therefore the findUnique stub) is live wiring rather than decoration.
vi.mock("@/lib/audit", () => ({
  withAudit: async (
    meta: { before?: () => Promise<unknown> },
    run: () => Promise<unknown>,
  ) => {
    await meta.before?.();
    return run();
  },
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));

const CUSTOM = "acme-bespoke"; // not in DESIGN_OPTIONS, not in MIXABLE_DESIGN_SLUGS
// Mixable Parts: their paint reads the palette-adaptive cw-* token chains, so
// they render correctly on any pack whose tokens track the palette. (That is
// the TOKEN family — no chrome KEY carries a cw- prefix.) Owned by no design.
const NEUTRAL_FOOTER = "mega-footer";
const NEUTRAL_HEADER = "minimal-header"; // ditto, header slot

/** What `getActiveDesign()` hands the write paths — they read slug + mixable. */
const activePack = (slug: string, mixable?: boolean) => ({ slug, mixable });

beforeEach(() => {
  // reset, not clear — the rule chrome-render-path.test.ts documents:
  // clearAllMocks keeps implementations, so a stale mockResolvedValue would
  // leak into a case that forgot to set its own. No case here is currently
  // stateful enough for that to bite (every one sets getActiveDesign itself);
  // this is consistency with the sibling, not a live hazard. Every stubbed
  // implementation is re-armed below so `reset` never leaves one bare.
  vi.resetAllMocks();
  h.upsert.mockResolvedValue(undefined);
  h.findUnique.mockResolvedValue(null);
  h.requireAdmin.mockResolvedValue(undefined);
});

/**
 * Non-vacuity floor, mirroring chrome-preview-path.test.ts. The opt-IN cases
 * only mean something if CUSTOM is a slug the built-in set REFUSES, and the
 * opt-OUT case only if "aurora-site" is one it ACCEPTS. `profile-light.ts`
 * demonstrably rewrites that Set when scaffolding, so assert it rather than
 * trusting a comment — a future prune list touching these would otherwise
 * surface as an unexplained "expected reject, got resolve".
 */
describe("fixture floor", () => {
  it("the fixture slugs sit where the cases need them in the built-in set", async () => {
    const { MIXABLE_DESIGN_SLUGS } = await import("@/designs/options");
    expect(MIXABLE_DESIGN_SLUGS.has(CUSTOM)).toBe(false);
    expect(MIXABLE_DESIGN_SLUGS.has("aurora-site")).toBe(true);
  });
});

describe("chrome.set — the active pack decides which Parts an agent may select", () => {
  const setChrome = async (footerKey: string) => {
    const { setChromeTool } = await import("@/lib/tools/compose");
    return setChromeTool.handler(
      { footerKey, confirm: true } as never,
      { actor: "system:test", requestId: "test-chrome-write" },
    );
  };
  const setHeader = async (headerKey: string) => {
    const { setChromeTool } = await import("@/lib/tools/compose");
    return setChromeTool.handler(
      { headerKey, confirm: true } as never,
      { actor: "system:test", requestId: "test-chrome-write" },
    );
  };

  // Both slots go through the same `check()` — pinned so a regression that
  // only drops the header leg cannot hide behind the footer cases.
  it("gates the HEADER slot by the same rule", async () => {
    h.getActiveDesign.mockResolvedValue(activePack(CUSTOM, true));
    await expect(setHeader(NEUTRAL_HEADER)).resolves.toMatchObject({
      headerKey: NEUTRAL_HEADER,
    });
    expect((h.upsert.mock.calls[0]![0] as UpsertArgs).update.chromeJson).toBe(
      JSON.stringify({ headerKey: NEUTRAL_HEADER }),
    );

    h.upsert.mockClear();
    h.getActiveDesign.mockResolvedValue(activePack(CUSTOM, undefined));
    await expect(setHeader(NEUTRAL_HEADER)).rejects.toThrow(/not a registered design/);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("accepts a neutral Part on a CUSTOM pack that declares mixable: true", async () => {
    h.getActiveDesign.mockResolvedValue(activePack(CUSTOM, true));

    await expect(setChrome(NEUTRAL_FOOTER)).resolves.toMatchObject({
      footerKey: NEUTRAL_FOOTER,
    });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect((h.upsert.mock.calls[0]![0] as UpsertArgs).update.chromeJson).toBe(
      JSON.stringify({ footerKey: NEUTRAL_FOOTER }),
    );
  });

  it("rejects the same Part when that pack declares nothing (slug-set answer)", async () => {
    h.getActiveDesign.mockResolvedValue(activePack(CUSTOM, undefined));

    // CUSTOM is deliberately absent from DESIGN_OPTIONS, so the refusal names
    // the missing registration — not the old blame-the-chrome sentence.
    await expect(setChrome(NEUTRAL_FOOTER)).rejects.toThrow(/not a registered design/);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("rejects it on a BUILT-IN mixable pack that opts out with mixable: false", async () => {
    h.getActiveDesign.mockResolvedValue(activePack("aurora-site", false));

    // A registered design that refuses foreign chrome: the DESIGN is named as
    // the constraint, and the message must not offer "pick a mixable chrome".
    await expect(setChrome(NEUTRAL_FOOTER)).rejects.toThrow(
      /does not accept chrome from other packs/,
    );
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("is unchanged for a shipped pack that declares nothing", async () => {
    h.getActiveDesign.mockResolvedValue(activePack("aurora-site", undefined));

    await expect(setChrome(NEUTRAL_FOOTER)).resolves.toMatchObject({
      footerKey: NEUTRAL_FOOTER,
    });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect((h.upsert.mock.calls[0]![0] as UpsertArgs).update.chromeJson).toBe(
      JSON.stringify({ footerKey: NEUTRAL_FOOTER }),
    );
  });
});

/**
 * The action answers `{ ok: false, error }` rather than throwing, so a plain
 * `ok === false` would also pass if the refusal came from the WRONG guard (an
 * unregistered key, say). The docblock justifies picking these two surfaces by
 * the message the caller reads — so pin the message.
 */
function expectRefused(
  r: { ok: true } | { ok: false; error: string },
  needle: RegExp,
): void {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(needle);
}

describe("setChromeAction — the same rule for the human in /admin/designs", () => {
  const setChrome = async (footerKey: string) => {
    const { setChromeAction } = await import("@/app/admin/designs/actions");
    return setChromeAction("", footerKey);
  };

  // Same reason as the tool's header case: the action loops over both slots.
  it("gates the HEADER slot by the same rule", async () => {
    h.getActiveDesign.mockResolvedValue(activePack(CUSTOM, true));
    const { setChromeAction } = await import("@/app/admin/designs/actions");
    expect(await setChromeAction(NEUTRAL_HEADER, "")).toEqual({ ok: true });
    expect((h.upsert.mock.calls[0]![0] as UpsertArgs).update.chromeJson).toBe(
      JSON.stringify({ headerKey: NEUTRAL_HEADER }),
    );

    h.upsert.mockClear();
    h.getActiveDesign.mockResolvedValue(activePack(CUSTOM, undefined));
    expectRefused(await setChromeAction(NEUTRAL_HEADER, ""), /not a registered design/);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("accepts a neutral Part on a CUSTOM pack that declares mixable: true", async () => {
    h.getActiveDesign.mockResolvedValue(activePack(CUSTOM, true));

    expect(await setChrome(NEUTRAL_FOOTER)).toEqual({ ok: true });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect((h.upsert.mock.calls[0]![0] as UpsertArgs).update.chromeJson).toBe(
      JSON.stringify({ footerKey: NEUTRAL_FOOTER }),
    );
  });

  it("rejects the same Part when that pack declares nothing (slug-set answer)", async () => {
    h.getActiveDesign.mockResolvedValue(activePack(CUSTOM, undefined));

    expectRefused(await setChrome(NEUTRAL_FOOTER), /not a registered design/);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("rejects it on a BUILT-IN mixable pack that opts out with mixable: false", async () => {
    h.getActiveDesign.mockResolvedValue(activePack("aurora-site", false));

    expectRefused(await setChrome(NEUTRAL_FOOTER), /does not accept chrome from other packs/);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("is unchanged for a shipped pack that declares nothing", async () => {
    h.getActiveDesign.mockResolvedValue(activePack("aurora-site", undefined));

    expect(await setChrome(NEUTRAL_FOOTER)).toEqual({ ok: true });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect((h.upsert.mock.calls[0]![0] as UpsertArgs).update.chromeJson).toBe(
      JSON.stringify({ footerKey: NEUTRAL_FOOTER }),
    );
  });
});
