import { describe, it, expect, vi, beforeEach } from "vitest";
import { DESIGN_OPTIONS, MIXABLE_DESIGN_SLUGS } from "@/designs/options";

/**
 * The two chrome WRITE paths must report a refusal through
 * `explainChromeRejection`, not a sentence of their own.
 *
 * Both used to interpolate `meta.designSlug` into "only renders on the …
 * design". For a NEUTRAL Part (components/chrome-parts/ — mixable, owned by no
 * design) refused because the ACTIVE design is locked-theme, that produced
 * `only renders on the "undefined" design … Pick a mixable chrome`: a design
 * that does not exist, and the single remedy that cannot work, since the caller
 * already picked a mixable chrome. `chrome.set` is the agent-facing surface, so
 * an AI driving it retries the other mixable Parts and fails identically each
 * time.
 *
 * Reverting either call site to its old inline message left the whole suite
 * green — the message generator can be pinned as a pure function
 * (chrome-registry.test.ts) without anything proving the surfaces CALL it.
 * These are the two cases where the difference is what a human or an agent
 * reads. The composition validator, the third surface, needs no mocks and is
 * pinned in compositions.test.ts.
 *
 * Mock surface follows chrome-render-path.test.ts: `@/lib/theme` is mocked
 * rather than imported, because the real module pulls the design barrel (the
 * leaf-modules lesson).
 *
 * KNOWN OVERLAP (both merged 2026-08-07): tests/unit/chrome-write-paths.test.ts
 * builds a near-duplicate mock surface for these same two write paths (its
 * needles were retargeted at the reason-specific wording when the two branches
 * landed). Backlog holds a consolidation item to fold the two files into one.
 *
 * SCOPE, honestly: these drive `setChromeTool.handler` / `setChromeAction`
 * directly, so they pin the HANDLER level only. The zod input schema, the
 * `settings:write` scope check and the dispatcher's confirm gate are not
 * exercised here (they are pinned in compose-tools.test.ts), and the mocked
 * `requireAdmin` means the action's authz gate is not pinned either. The
 * message under test is built before any of those boundaries, so none of it can
 * hide the defect — but "the write paths are pinned" means pinned for wording.
 */

const h = vi.hoisted(() => ({
  getActiveDesign: vi.fn(),
  invalidateThemeCache: vi.fn(),
  upsert: vi.fn(async (_args: unknown) => undefined),
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
  prisma: { brandingSettings: { upsert: h.upsert, findUnique: h.findUnique } },
}));

vi.mock("@/lib/audit", () => ({
  withAudit: async (meta: { before?: () => Promise<unknown> }, run: () => Promise<unknown>) => {
    await meta.before?.();
    return run();
  },
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));

/** Mixable, owned by no design — the shape the old message mangled. */
const NEUTRAL_FOOTER = "mega-footer";
/** Locked-theme chrome: only its own design ("halo") may wear it. */
const LOCKED_HEADER = "halo-header";
/**
 * A REGISTERED design that refuses foreign chrome by the slug-set answer —
 * DERIVED rather than named: a pruned scaffold (light keeps a curated design
 * set) need not ship any particular locked design, and a hardcoded "nocturne"
 * turned these cases red in the light release-scaffold-gate (2026-08-07).
 * No such design in this profile ⇒ the cases that need one SKIP (reported
 * honestly, never silently passed).
 */
const LOCKED_DESIGN = DESIGN_OPTIONS.find((d) => !MIXABLE_DESIGN_SLUGS.has(d.slug))?.slug;

const activePack = (slug: string, mixable?: boolean) => ({ slug, mixable });

/**
 * Await a call that MUST reject and hand back its message. A resolving SUT
 * fails here and now — unlike a `.rejects.not.toThrow(…)` chain, whose
 * "resolved instead of rejecting" surfaces as an unhandled rejection outside
 * the test that should have caught it.
 */
async function messageOf(p: Promise<unknown>): Promise<string> {
  let resolved: unknown;
  let rejection: unknown;
  let didReject = false;
  try {
    resolved = await p;
  } catch (e) {
    didReject = true;
    rejection = e;
  }
  expect(didReject, `expected a refusal, got: ${JSON.stringify(resolved)}`).toBe(true);
  return rejection instanceof Error ? rejection.message : String(rejection);
}

beforeEach(() => {
  vi.resetAllMocks();
  h.upsert.mockResolvedValue(undefined);
  h.findUnique.mockResolvedValue(null);
  h.requireAdmin.mockResolvedValue(undefined);
});

describe("fixture floor", () => {
  it("the fixture slugs sit where these cases need them", () => {
    // LOCKED_DESIGN is derived (registered ∧ outside the slug set), so its two
    // old assertions hold by construction; what still needs pinning is the
    // mixable side — without it, the "is refused with …" cases below could
    // pass by never running.
    expect(MIXABLE_DESIGN_SLUGS.has("aurora-site")).toBe(true);
    expect(DESIGN_OPTIONS.some((d) => d.slug === "aurora-site")).toBe(true);
  });
});

describe("chrome.set — what the build agent is told when a Part is refused", () => {
  const setChrome = async (args: { headerKey?: string; footerKey?: string }) => {
    const { setChromeTool } = await import("@/lib/tools/compose");
    return setChromeTool.handler({ ...args, confirm: true } as never, {
      actor: "system:test",
      requestId: "test-chrome-rejection",
    });
  };

  it.skipIf(!LOCKED_DESIGN)(
    "blames the locked-theme DESIGN for a mixable Part — no 'undefined'",
    async () => {
      h.getActiveDesign.mockResolvedValue(activePack(LOCKED_DESIGN!));

      // Capture ONCE and assert on the string. Measured in this repo (vitest
      // 4.1.10): an AWAITED `.rejects.not.toThrow(…)` on a resolving promise does
      // fail the test properly — only the un-awaited form escapes as an unhandled
      // rejection. So this is not a correctness fix; it is that one call + three
      // string assertions beats three calls to the same SUT, and `messageOf`
      // reports the resolved VALUE when the gate wrongly opens.
      const message = await messageOf(setChrome({ footerKey: NEUTRAL_FOOTER }));
      expect(message).toContain(
        `is a mixable chrome, but the active design "${LOCKED_DESIGN}" does not accept chrome from other packs`,
      );
      // The exact regression: the old sentence named a design that does not exist
      // and told the agent to do the one thing that cannot help.
      expect(message).not.toContain("undefined");
      expect(message).toContain("picking a different chrome will not help");
      // Both remedies, because this branch also catches Blank Canvas and bespoke
      // packs, for whom "switch design" is the wrong advice.
      expect(message).toContain("Switch to a mixable design");
      expect(message).toContain("declare it mixable");
      expect(h.upsert).not.toHaveBeenCalled();
    },
  );

  it("still blames the CHROME when it is genuinely locked to another design", async () => {
    h.getActiveDesign.mockResolvedValue(activePack("aurora-site"));

    expect(await messageOf(setChrome({ headerKey: LOCKED_HEADER }))).toMatch(
      /"halo-header" is a locked-theme chrome that only renders on the "halo" design/,
    );
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("says there is no design when none is active", async () => {
    h.getActiveDesign.mockResolvedValue(null);

    expect(await messageOf(setChrome({ footerKey: NEUTRAL_FOOTER }))).toMatch(
      /there is no active design to render it on\. Choose a design first\./,
    );
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("a selectable Part is still written (the gate is not stuck closed)", async () => {
    h.getActiveDesign.mockResolvedValue(activePack("aurora-site"));

    await expect(setChrome({ footerKey: NEUTRAL_FOOTER })).resolves.toMatchObject({
      footerKey: NEUTRAL_FOOTER,
    });
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("setChromeAction — what the human in /admin/designs is told", () => {
  const save = async (headerKey: string, footerKey: string) => {
    const { setChromeAction } = await import("@/app/admin/designs/actions");
    return setChromeAction(headerKey, footerKey);
  };
  /** The action answers `{ ok:false, error }` rather than throwing. */
  const errorOf = (r: { ok: true } | { ok: false; error: string }): string => {
    expect(r.ok).toBe(false);
    return r.ok ? "" : r.error;
  };

  it.skipIf(!LOCKED_DESIGN)(
    "blames the locked-theme DESIGN for a mixable Part — no 'undefined'",
    async () => {
      h.getActiveDesign.mockResolvedValue(activePack(LOCKED_DESIGN!));

      const message = errorOf(await save("", NEUTRAL_FOOTER));
      expect(message).not.toContain("undefined");
      expect(message).toContain(`the active design "${LOCKED_DESIGN}"`);
      expect(message).toContain("Switch to a mixable design");
      expect(h.upsert).not.toHaveBeenCalled();
    },
  );

  it("still blames the CHROME when it is genuinely locked to another design", async () => {
    h.getActiveDesign.mockResolvedValue(activePack("aurora-site"));

    expect(errorOf(await save(LOCKED_HEADER, ""))).toContain(
      'only renders on the "halo" design',
    );
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("a selectable Part is still saved (the gate is not stuck closed)", async () => {
    h.getActiveDesign.mockResolvedValue(activePack("aurora-site"));

    await expect(save("", NEUTRAL_FOOTER)).resolves.toEqual({ ok: true });
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });
});
