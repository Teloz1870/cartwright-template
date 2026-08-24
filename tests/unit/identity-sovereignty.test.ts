import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `identitySovereignty` — who owns storeName + ecommerceEnabled.
 *
 * Cartwright grew up assuming the admin panel is the source of truth; a site
 * built by an AI assumes the code is. Where they disagreed, the database won
 * silently — a downstream fork toggled an unrelated feature flag and its live
 * site renamed itself to "Cartwright" in the header, the footer and `llms.txt`.
 *
 * A guard existed ("Phase H") but was tied to `mode === "website"` — the wrong
 * axis. What decides ownership is where the configuration lives, not what kind
 * of site it is. `lib/identity.ts` makes that explicit with three policies.
 *
 * The whole point of the default is that it changes nothing, so the matrix
 * below asserts `"auto"` against a CONTAMINATED row in both modes: those four
 * assertions are the byte-identical claim, in executable form. The `"db"` block
 * exists because an untested escape hatch is speculation, not an escape hatch.
 */

const mocks = vi.hoisted(() => ({
  mode: "webshop" as "website" | "webshop",
  policy: "auto" as string | undefined,
}));

vi.mock("@/brand.config", () => ({
  brand: {
    storeName: "config-shop.dk",
    ecommerceEnabled: false,
    get mode() {
      return mocks.mode;
    },
    get identitySovereignty() {
      return mocks.policy;
    },
  },
}));

/** A row that disagrees with config on every sovereign field. */
const CONTAMINATED = { storeName: "kontaminerede-shop.dk", ecommerceEnabled: true };

async function identity() {
  vi.resetModules();
  return import("@/lib/identity");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = "webshop";
  mocks.policy = "auto";
});

describe('policy "auto" — the legacy contract, unchanged', () => {
  it("webshop mode: the DB still overrides identity (this is what shipped)", async () => {
    const { sovereignStoreName, sovereignEcommerce } = await identity();

    expect(sovereignStoreName(CONTAMINATED.storeName)).toBe("kontaminerede-shop.dk");
    expect(sovereignEcommerce(CONTAMINATED.ecommerceEnabled)).toBe(true);
  });

  it("website mode: config wins (the Phase H lock)", async () => {
    mocks.mode = "website";
    const { sovereignStoreName, sovereignEcommerce } = await identity();

    expect(sovereignStoreName(CONTAMINATED.storeName)).toBe("config-shop.dk");
    expect(sovereignEcommerce(CONTAMINATED.ecommerceEnabled)).toBe(false);
  });

  it("website mode forces ecommerce FALSE even for an incoherent config", async () => {
    // `mode: "website"` with `ecommerceEnabled: true` is incoherent, and the
    // Phase G/H guarantee was a hard `false` rather than a config read. Keeping
    // that distinction is why the "auto" branch is not simplified.
    mocks.mode = "website";
    const { sovereignEcommerce } = await identity();

    expect(sovereignEcommerce(true)).toBe(false);
  });

  it("a silent column still falls back to config", async () => {
    const { sovereignStoreName, sovereignEcommerce } = await identity();

    expect(sovereignStoreName(null)).toBe("config-shop.dk");
    expect(sovereignStoreName("")).toBe("config-shop.dk");
    expect(sovereignEcommerce(null)).toBe(false);
  });
});

describe('policy "config" — the fix for code-configured forks', () => {
  beforeEach(() => {
    mocks.policy = "config";
  });

  it("webshop mode: a contaminated row can no longer rename the site", async () => {
    const { sovereignStoreName, sovereignEcommerce } = await identity();

    expect(sovereignStoreName(CONTAMINATED.storeName)).toBe("config-shop.dk");
    expect(sovereignEcommerce(CONTAMINATED.ecommerceEnabled)).toBe(false);
  });

  it("website mode behaves the same — mode is no longer the axis", async () => {
    mocks.mode = "website";
    const { sovereignStoreName } = await identity();

    expect(sovereignStoreName(CONTAMINATED.storeName)).toBe("config-shop.dk");
  });
});

describe('policy "db" — the multi-tenant escape hatch', () => {
  beforeEach(() => {
    mocks.policy = "db";
  });

  it("website mode: the DB wins, which no other policy allows", async () => {
    mocks.mode = "website";
    const { sovereignStoreName, sovereignEcommerce } = await identity();

    expect(sovereignStoreName(CONTAMINATED.storeName)).toBe("kontaminerede-shop.dk");
    expect(sovereignEcommerce(CONTAMINATED.ecommerceEnabled)).toBe(true);
  });
});

describe("policy resolution", () => {
  it("an unset or unknown value degrades to auto (forks on an older config)", async () => {
    for (const raw of [undefined, "", "nonsense", "CONFIG"]) {
      mocks.policy = raw;
      const { identityPolicy } = await identity();
      expect(identityPolicy(), `raw=${String(raw)}`).toBe("auto");
    }
  });

  it("isIdentityLocked reflects the policy, not just the mode", async () => {
    const { isIdentityLocked } = await identity();
    expect(isIdentityLocked("config")).toBe(true);
    expect(isIdentityLocked("db")).toBe(false);
    expect(isIdentityLocked("auto")).toBe(false); // webshop
    mocks.mode = "website";
    const again = await identity();
    expect(again.isIdentityLocked("auto")).toBe(true);
  });
});

describe("applyIdentitySovereignty — the seam", () => {
  it("normalises the row so raw-row readers cannot route around the policy", async () => {
    // Header, Footer and llms.txt read the row, not the merged brand. That is
    // why the original lock leaked despite passing its own unit tests.
    mocks.policy = "config";
    const { applyIdentitySovereignty } = await identity();

    const out = applyIdentitySovereignty({ ...CONTAMINATED, tagline: "kept" });

    expect(out).toMatchObject({
      storeName: "config-shop.dk",
      ecommerceEnabled: false,
      tagline: "kept",
    });
  });

  it("leaves cosmetics alone — the sovereign set is deliberately narrow", async () => {
    mocks.policy = "config";
    const { applyIdentitySovereignty } = await identity();

    const out = applyIdentitySovereignty({
      ...CONTAMINATED,
      domain: "operator-domain.dk",
      emailFrom: "ops@operator-domain.dk",
      logoImageUrl: "https://cdn.test/logo.png",
      industryTemplate: "coffee",
    });

    // Domain/email follow the operator (sitemap, canonicals, verified sending
    // domain); industryTemplate only drives design inference.
    expect(out).toMatchObject({
      domain: "operator-domain.dk",
      emailFrom: "ops@operator-domain.dk",
      logoImageUrl: "https://cdn.test/logo.png",
      industryTemplate: "coffee",
    });
  });

  it("passes null through (an unseeded shop has no row to normalise)", async () => {
    const { applyIdentitySovereignty } = await identity();
    expect(applyIdentitySovereignty(null)).toBeNull();
  });
});

/**
 * The WRITE side.
 *
 * Reading was only half the finding. The other half is an admin field that
 * accepts input, reports "Settings saved!" and changes nothing — because the
 * value is stored and then replaced on the way out. The operator has no way to
 * tell that apart from "my change hasn't propagated yet", so they go looking in
 * the storefront for a bug that is in the ownership model.
 *
 * Note the asymmetry with `isIdentityLocked`: the write lock is the NARROWER
 * predicate, `"config"` only. Under `"auto"` a website-mode shop's stored name
 * is already inert at render, but changing what the admin *persists* would be
 * observable on every existing website-mode shop — and `"auto"` means nothing
 * changes. That distinction is the whole reason both predicates exist.
 */
describe("withoutLockedIdentity — what the admin is allowed to persist", () => {
  const WRITE = { storeName: "Tastet ind i admin", ecommerceEnabled: true };

  it('"config" strips both sovereign fields and names them', async () => {
    mocks.policy = "config";
    const { withoutLockedIdentity } = await identity();

    const { data, ignored } = withoutLockedIdentity({ ...WRITE });

    expect(data).toEqual({});
    expect(ignored).toEqual(["Store name", "Webshop functionality"]);
  });

  it("only reports fields the caller actually tried to write", async () => {
    // The settings tool writes storeName but has no ecommerceEnabled input;
    // reporting a field nobody submitted would be a different kind of lie.
    mocks.policy = "config";
    const { withoutLockedIdentity } = await identity();

    expect(withoutLockedIdentity({ storeName: "x" }).ignored).toEqual(["Store name"]);
  });

  it('"auto" is a pure passthrough — in BOTH modes', async () => {
    for (const mode of ["webshop", "website"] as const) {
      mocks.mode = mode;
      mocks.policy = "auto";
      const { withoutLockedIdentity } = await identity();

      const { data, ignored } = withoutLockedIdentity({ ...WRITE });

      expect(data, mode).toEqual(WRITE);
      expect(ignored, mode).toEqual([]);
    }
  });

  it('"db" is a passthrough too — the DB is meant to win there', async () => {
    mocks.policy = "db";
    const { withoutLockedIdentity } = await identity();

    expect(withoutLockedIdentity({ ...WRITE }).ignored).toEqual([]);
  });

  it("the lock notice appears exactly when writes are locked", async () => {
    mocks.policy = "config";
    expect((await identity()).identityLockNotice()).toContain("brand.config.ts");

    mocks.mode = "website";
    mocks.policy = "auto";
    expect((await identity()).identityLockNotice()).toBeNull();
  });
});

/**
 * The tool surface — where an AI agent configures a shop.
 *
 * If the admin form is told a field is locked and `settings.update_branding`
 * writes it anyway, the lock is decoration. This test exists because the first
 * implementation had exactly that bug: it filtered the field into a new object
 * and then spread `...args` alongside it, putting the raw value straight back.
 * A source-level assertion would not have caught it; only calling the handler
 * and inspecting the payload does.
 */
describe("settings.update_branding honours the policy", () => {
  const ARGS = {
    storeName: "Skrevet af en agent",
    heroImage: "https://example.com/hero.jpg",
    announcement: "Hej",
  };

  async function callTool() {
    vi.resetModules();
    const upsert = vi.fn().mockResolvedValue({ id: 1 });
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: { brandingSettings: { findUnique: async () => null, upsert } },
    }));
    vi.doMock("@/lib/audit", () => ({
      withAudit: async (_meta: unknown, fn: () => Promise<unknown>) => fn(),
    }));

    const { updateBrandingSettings } = await import("@/lib/tools/settings");
    const result = await updateBrandingSettings.handler(ARGS, {} as never);

    vi.doUnmock("@/lib/audit");
    vi.doUnmock("@/lib/db");
    vi.doUnmock("server-only");
    return { payload: upsert.mock.calls[0][0], result };
  }

  it('"config": the stored name is the CONFIG one, not the agent\'s', async () => {
    mocks.policy = "config";
    const { payload, result } = await callTool();

    expect(payload.update).not.toHaveProperty("storeName");
    expect(payload.create.storeName).toBe("config-shop.dk");
    // The agent is told, rather than reading back its own input as success.
    expect((result as { ignored?: string[] }).ignored).toEqual(["Store name"]);
  });

  it('"auto": byte-identical — the agent\'s name is written as before', async () => {
    mocks.policy = "auto"; // webshop
    const { payload, result } = await callTool();

    expect(payload.update.storeName).toBe(ARGS.storeName);
    expect(payload.create.storeName).toBe(ARGS.storeName);
    expect(result).not.toHaveProperty("ignored");
  });
});

/**
 * The admin Server Action — the surface the finding is literally about.
 *
 * The form disables the locked fields, but a Server Action is a public
 * endpoint: the client is not the gate. And a partial save must not report a
 * plain success, so the action returns what it dropped and the form says so.
 */
describe("updateBrandingSettings (admin form) honours the policy", () => {
  async function save() {
    vi.resetModules();
    const update = vi.fn().mockResolvedValue({ id: 1 });
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/admin", () => ({ requireAdmin: async () => ({ id: "u1" }) }));
    vi.doMock("@/lib/db", () => ({ prisma: { brandingSettings: { update } } }));
    vi.doMock("@/lib/brand", () => ({ invalidateBrandCache: () => {} }));
    vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));

    const { updateBrandingSettings } = await import(
      "@/app/admin/indstillinger/actions"
    );
    const res = await updateBrandingSettings("Tastet ind", true, null, null, "da");

    for (const m of ["next/cache", "@/lib/brand", "@/lib/db", "@/lib/admin", "server-only"]) {
      vi.doUnmock(m);
    }
    return { data: update.mock.calls[0]?.[0]?.data, res };
  }

  it('"config": identity is not written, and the reply says which fields', async () => {
    mocks.policy = "config";
    const { data, res } = await save();

    expect(data).not.toHaveProperty("storeName");
    expect(data).not.toHaveProperty("ecommerceEnabled");
    // Cosmetics in the same form are still saved — refusing the whole write
    // would punish fields nobody claimed ownership of.
    expect(data).toHaveProperty("heroCta");
    expect(res).toEqual({
      ok: true,
      ignored: ["Store name", "Webshop functionality"],
    });
  });

  it('"auto": byte-identical — identity is written and no notice is added', async () => {
    mocks.policy = "auto"; // webshop
    const { data, res } = await save();

    expect(data.storeName).toBe("Tastet ind");
    expect(data.ecommerceEnabled).toBe(true);
    expect(res).toEqual({ ok: true });
  });
});

/**
 * The seam itself — and the reason this block exists.
 *
 * When I mutation-tested the block above, removing the normalisation from
 * `fetchBrandingSettings()` broke NOTHING: every assertion passed against the
 * pure helper while the actual seam handed callers a raw row again. That is
 * precisely the failure this finding is about — the original lock passed its own
 * unit tests while `Header`, `Footer` and `llms.txt` leaked around it. A test of
 * the helper is not a test of the seam.
 */
describe("fetchBrandingSettings applies the policy (not just the helper)", () => {
  it("returns a normalised row under 'config'", async () => {
    mocks.policy = "config";
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        brandingSettings: {
          findFirst: async () => ({ id: 1, ...CONTAMINATED, tagline: "kept" }),
        },
      },
    }));

    const { fetchBrandingSettings } = await import("@/lib/data-source/brand");
    const row = await fetchBrandingSettings();

    expect(row).toMatchObject({
      storeName: "config-shop.dk",
      ecommerceEnabled: false,
      tagline: "kept",
    });

    vi.doUnmock("@/lib/db");
    vi.doUnmock("server-only");
  });

  it("hands back the stored row unchanged under the legacy default", async () => {
    mocks.policy = "auto"; // webshop
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        brandingSettings: {
          findFirst: async () => ({ id: 1, ...CONTAMINATED }),
        },
      },
    }));

    const { fetchBrandingSettings } = await import("@/lib/data-source/brand");

    expect(await fetchBrandingSettings()).toMatchObject({
      storeName: "kontaminerede-shop.dk",
      ecommerceEnabled: true,
    });

    vi.doUnmock("@/lib/db");
    vi.doUnmock("server-only");
  });
});
