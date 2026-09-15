import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Settings singleton tools (`lib/tools/settings.ts`) — the admin/agent surface
 * that edits the two typed `id=1` singletons (ShippingSettings, BrandingSettings)
 * that drive checkout pricing and the front-page hero. All four are AI-invokable
 * over REST/MCP, so their write payloads + audit wiring are load-bearing:
 *   - `settings.get` reads either singleton and throws a specific message when the
 *     row is unseeded; it is a read tool and NEVER audits,
 *   - `settings.update_shipping` / `settings.update_branding` upsert `id=1` with
 *     the EXACT create/update payload (shipping affects checkout on a 30s cache),
 *   - `settings.update_copy` does a single-column `{[field]: value}` update that
 *     leaves sibling columns untouched, and short-circuits (throws) BEFORE the
 *     update when the singleton is unseeded,
 *   - the audit contract: every write captures the prior row via the `before`
 *     closure and threads actor/tool/args/ip/ua through withAudit — even a copy
 *     edit that is REJECTED for an unseeded row is still audited,
 *   - the input schemas enforce the øre bounds, the hero-image URL, the copy
 *     field enum + confirm gate, and the get-type enum.
 *
 * Mocks: `@/lib/db` (prisma) + `@/lib/audit` (withAudit). No real DB. The withAudit
 * stand-in resolves `before()` on BOTH success and failure — exactly like the real
 * wrapper (lib/audit.ts `captureBefore(meta.before)` runs before the try/catch).
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    shippingSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    brandingSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
  withAudit: vi.fn(),
  // capture the meta + resolved `before()` snapshot the tool hands to withAudit.
  captured: { meta: null as null | Record<string, unknown>, before: undefined as unknown },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const ctx = {
  actor: "apikey:k1",
  ip: "10.0.0.9",
  userAgent: "agent/1.0",
} as never;

beforeEach(() => {
  vi.resetModules();
  mocks.prisma.shippingSettings.findUnique.mockReset();
  mocks.prisma.shippingSettings.upsert.mockReset();
  mocks.prisma.brandingSettings.findUnique.mockReset();
  mocks.prisma.brandingSettings.upsert.mockReset();
  mocks.prisma.brandingSettings.update.mockReset();
  mocks.captured.meta = null;
  mocks.captured.before = undefined;
  // Faithful withAudit stand-in: capture meta, resolve the before-snapshot
  // (the real withAudit does this on BOTH success and failure), then run fn —
  // rethrowing exactly as the real wrapper does.
  mocks.withAudit
    .mockReset()
    .mockImplementation(
      async (
        meta: Record<string, unknown> & { before?: () => Promise<unknown> | unknown },
        fn: () => Promise<unknown>,
      ) => {
        mocks.captured.meta = meta;
        if (meta.before) mocks.captured.before = await meta.before();
        return fn();
      },
    );
});

describe("settings.get — read either singleton", () => {
  it("returns the shipping singleton tagged with its type", async () => {
    const row = { id: 1, shippingFeeOere: 4900, freeShippingThresholdOere: 49900 };
    mocks.prisma.shippingSettings.findUnique.mockResolvedValue(row);
    const { getSettings } = await import("@/lib/tools/settings");

    const r = await getSettings.handler({ type: "shipping" }, ctx);

    expect(r).toEqual({ type: "shipping", ...row });
    expect(mocks.prisma.shippingSettings.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    // read tool: the branding singleton is never touched, and nothing is audited
    expect(mocks.prisma.brandingSettings.findUnique).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });

  it("returns the branding singleton tagged with its type", async () => {
    const row = {
      id: 1,
      storeName: "Cartwright",
      heroImage: "https://x/hero.jpg",
      announcement: "Hi",
      websiteHeadline: "H",
      tagline: "T",
    };
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(row);
    const { getSettings } = await import("@/lib/tools/settings");

    const r = await getSettings.handler({ type: "branding" }, ctx);

    expect(r).toEqual({ type: "branding", ...row });
    expect(mocks.prisma.brandingSettings.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mocks.prisma.shippingSettings.findUnique).not.toHaveBeenCalled();
  });

  it("throws a specific message when the shipping singleton is unseeded", async () => {
    mocks.prisma.shippingSettings.findUnique.mockResolvedValue(null);
    const { getSettings } = await import("@/lib/tools/settings");

    await expect(getSettings.handler({ type: "shipping" }, ctx)).rejects.toThrow(
      "ShippingSettings not seeded (id=1 missing)",
    );
  });

  it("throws a specific message when the branding singleton is unseeded", async () => {
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(null);
    const { getSettings } = await import("@/lib/tools/settings");

    await expect(getSettings.handler({ type: "branding" }, ctx)).rejects.toThrow(
      "BrandingSettings not seeded (id=1 missing)",
    );
  });

  it("is a scoped read tool that does not audit", async () => {
    const { getSettings } = await import("@/lib/tools/settings");
    expect(getSettings.name).toBe("settings.get");
    expect(getSettings.scope).toBe("settings:read");
    expect(getSettings.skipAudit).toBe(true);
  });
});

describe("settings.update_shipping — upsert id=1", () => {
  it("upserts id=1 with the exact create/update payload and returns the row", async () => {
    const args = { shippingFeeOere: 3900, freeShippingThresholdOere: 39900 };
    const updated = { id: 1, ...args };
    mocks.prisma.shippingSettings.findUnique.mockResolvedValue(null);
    mocks.prisma.shippingSettings.upsert.mockResolvedValue(updated);
    const { updateShippingSettings } = await import("@/lib/tools/settings");

    const r = await updateShippingSettings.handler(args, ctx);

    expect(r).toEqual(updated);
    expect(mocks.prisma.shippingSettings.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.shippingSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: args,
      // create must pin id:1 — an upsert without it would create an autoincrement
      // row and never own the id=1 singleton getShippingSettings() reads.
      create: { id: 1, ...args },
    });
  });

  it("snapshots the prior row via the audit before-closure + threads actor/tool/args/ip/ua", async () => {
    const prior = { id: 1, shippingFeeOere: 4900, freeShippingThresholdOere: 49900 };
    const args = { shippingFeeOere: 0, freeShippingThresholdOere: 0 };
    mocks.prisma.shippingSettings.findUnique.mockResolvedValue(prior);
    mocks.prisma.shippingSettings.upsert.mockResolvedValue({ id: 1, ...args });
    const { updateShippingSettings } = await import("@/lib/tools/settings");

    await updateShippingSettings.handler(args, ctx);

    expect(mocks.prisma.shippingSettings.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mocks.captured.before).toEqual(prior);
    const meta = mocks.captured.meta!;
    expect(meta.tool).toBe("settings.update_shipping");
    expect(meta.actor).toBe("apikey:k1");
    expect(meta.args).toEqual(args);
    expect(meta.ip).toBe("10.0.0.9");
    expect(meta.userAgent).toBe("agent/1.0");
  });

  it("is a scoped, audited write tool", async () => {
    const { updateShippingSettings } = await import("@/lib/tools/settings");
    expect(updateShippingSettings.name).toBe("settings.update_shipping");
    expect(updateShippingSettings.scope).toBe("settings:write");
    expect(updateShippingSettings.skipAudit).toBeUndefined();
  });
});

describe("settings.update_branding — upsert id=1", () => {
  /**
   * The engine ships `identitySovereignty: "config"`, so the store name is
   * owned by brand.config.ts and this tool does NOT write it: it drops the
   * field and reports it back, rather than persisting a value the seam would
   * replace on the way out (lib/identity.ts).
   *
   * This assertion moved with that default rather than being loosened — it
   * pins the payload the tool actually sends today. The `"auto"` contract, in
   * which the agent's store name IS written, lives in
   * tests/unit/identity-sovereignty.test.ts with the policy mocked, so both
   * behaviours stay covered and the pair reads as before/after.
   */
  it("writes the cosmetics, refuses the config-owned name, and says which", async () => {
    const { brand } = await import("@/brand.config");
    const args = {
      storeName: "Cartwright Coffee",
      heroImage: "https://example.com/hero.jpg",
      announcement: "Free shipping over 499 DKK!",
    };
    const cosmetics = { heroImage: args.heroImage, announcement: args.announcement };
    const updated = { id: 1, ...args };
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(null);
    mocks.prisma.brandingSettings.upsert.mockResolvedValue(updated);
    const { updateBrandingSettings } = await import("@/lib/tools/settings");

    const r = await updateBrandingSettings.handler(args, ctx);

    // The agent is told, instead of reading back its own input as success.
    expect(r).toEqual({ ...updated, ignored: ["Store name"] });
    expect(mocks.prisma.brandingSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: cosmetics,
      // A create still needs a name for the required column — the config one,
      // asserted through the import rather than as a literal so the assertion
      // cannot drift from the file it claims to follow.
      create: { id: 1, ...cosmetics, storeName: brand.storeName },
    });
  });

  it("snapshots the prior row via the audit before-closure + threads context", async () => {
    const prior = {
      id: 1,
      storeName: "Old",
      heroImage: "https://x/old.jpg",
      announcement: "",
    };
    const args = {
      storeName: "New",
      heroImage: "https://x/new.jpg",
      announcement: "Hi",
    };
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(prior);
    mocks.prisma.brandingSettings.upsert.mockResolvedValue({ id: 1, ...args });
    const { updateBrandingSettings } = await import("@/lib/tools/settings");

    await updateBrandingSettings.handler(args, ctx);

    expect(mocks.prisma.brandingSettings.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mocks.captured.before).toEqual(prior);
    const meta = mocks.captured.meta!;
    expect(meta.tool).toBe("settings.update_branding");
    expect(meta.actor).toBe("apikey:k1");
    expect(meta.args).toEqual(args);
    expect(meta.ip).toBe("10.0.0.9");
    expect(meta.userAgent).toBe("agent/1.0");
  });

  it("is a scoped, audited write tool", async () => {
    const { updateBrandingSettings } = await import("@/lib/tools/settings");
    expect(updateBrandingSettings.name).toBe("settings.update_branding");
    expect(updateBrandingSettings.scope).toBe("settings:write");
    expect(updateBrandingSettings.skipAudit).toBeUndefined();
  });
});

describe("settings.update_copy — single-column front-page copy edit", () => {
  it("updates ONLY the targeted column and returns the row", async () => {
    // Two distinct findUnique calls, modeled faithfully: the audit before-closure
    // (no select) returns the full prior row; the handler's own guard lookup
    // (`select:{id:true}`) returns just the id.
    const updated = { id: 1, websiteHeadline: "Coffee worth slowing down for.", tagline: "T" };
    mocks.prisma.brandingSettings.findUnique
      .mockResolvedValueOnce({ id: 1, websiteHeadline: "Old", tagline: "T" }) // audit before()
      .mockResolvedValueOnce({ id: 1 }); // handler guard (select id)
    mocks.prisma.brandingSettings.update.mockResolvedValue(updated);
    const { updateCopySettings } = await import("@/lib/tools/settings");

    const r = await updateCopySettings.handler(
      { field: "websiteHeadline", value: "Coffee worth slowing down for.", confirm: true },
      ctx,
    );

    expect(r).toEqual(updated);
    // single-column update keyed off id=1 — the computed key must be exactly the
    // requested field, so a sibling column is never overwritten.
    expect(mocks.prisma.brandingSettings.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.brandingSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { websiteHeadline: "Coffee worth slowing down for." },
    });
    // the handler's own guard lookup is the light `select:{id:true}` probe
    expect(mocks.prisma.brandingSettings.findUnique.mock.calls.at(-1)![0]).toEqual({
      where: { id: 1 },
      select: { id: true },
    });
  });

  it("targets the tagline column when that field is requested", async () => {
    mocks.prisma.brandingSettings.findUnique
      .mockResolvedValueOnce({ id: 1, websiteHeadline: "H", tagline: "old" })
      .mockResolvedValueOnce({ id: 1 });
    mocks.prisma.brandingSettings.update.mockResolvedValue({ id: 1, tagline: "new" });
    const { updateCopySettings } = await import("@/lib/tools/settings");

    await updateCopySettings.handler({ field: "tagline", value: "new", confirm: true }, ctx);

    expect(mocks.prisma.brandingSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { tagline: "new" },
    });
  });

  it("throws and never updates when the branding singleton is unseeded", async () => {
    // before() and the guard both see an unseeded row.
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(null);
    const { updateCopySettings } = await import("@/lib/tools/settings");

    await expect(
      updateCopySettings.handler({ field: "tagline", value: "x", confirm: true }, ctx),
    ).rejects.toThrow("BrandingSettings not seeded (id=1 missing)");
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
  });

  it("still captures the prior row for audit + threads context (even on the unseeded throw)", async () => {
    // The audit before-closure has no select, so it captures the full prior row;
    // here the singleton is unseeded so it snapshots null — and the write still
    // aborts. withAudit resolves before() regardless of the handler outcome.
    mocks.prisma.brandingSettings.findUnique.mockResolvedValue(null);
    const { updateCopySettings } = await import("@/lib/tools/settings");

    await expect(
      updateCopySettings.handler({ field: "websiteHeadline", value: "x", confirm: true }, ctx),
    ).rejects.toThrow(/not seeded/);
    expect(mocks.captured.before).toBeNull();
    const meta = mocks.captured.meta!;
    expect(meta.tool).toBe("settings.update_copy");
    expect(meta.actor).toBe("apikey:k1");
    expect(meta.args).toEqual({ field: "websiteHeadline", value: "x", confirm: true });
    expect(meta.ip).toBe("10.0.0.9");
    expect(meta.userAgent).toBe("agent/1.0");
    // the before-closure fires the no-select lookup for the singleton
    expect(mocks.prisma.brandingSettings.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it("is a scoped, audited write tool", async () => {
    const { updateCopySettings } = await import("@/lib/tools/settings");
    expect(updateCopySettings.name).toBe("settings.update_copy");
    expect(updateCopySettings.scope).toBe("settings:write");
    expect(updateCopySettings.skipAudit).toBeUndefined();
  });
});

describe("input schemas", () => {
  it("update_shipping enforces integer øre within the fee/threshold bounds", async () => {
    const { updateShippingSettings } = await import("@/lib/tools/settings");
    const s = updateShippingSettings.input;
    expect(s.safeParse({ shippingFeeOere: 4900, freeShippingThresholdOere: 49900 }).success).toBe(
      true,
    );
    // fee: negative, over-max (50000), and non-integer are all rejected
    expect(s.safeParse({ shippingFeeOere: -1, freeShippingThresholdOere: 0 }).success).toBe(false);
    expect(s.safeParse({ shippingFeeOere: 50001, freeShippingThresholdOere: 0 }).success).toBe(
      false,
    );
    expect(s.safeParse({ shippingFeeOere: 49.5, freeShippingThresholdOere: 0 }).success).toBe(false);
    // threshold over its own max (1_000_000) is rejected
    expect(s.safeParse({ shippingFeeOere: 0, freeShippingThresholdOere: 1_000_001 }).success).toBe(
      false,
    );
    // a missing field is rejected (both are required)
    expect(s.safeParse({ shippingFeeOere: 4900 }).success).toBe(false);
  });

  it("update_branding requires a non-empty store name, a URL hero image, and a bounded announcement", async () => {
    const { updateBrandingSettings } = await import("@/lib/tools/settings");
    const s = updateBrandingSettings.input;
    expect(
      s.safeParse({
        storeName: "Shop",
        heroImage: "https://example.com/h.jpg",
        announcement: "Hi",
      }).success,
    ).toBe(true);
    // heroImage must be a URL
    expect(
      s.safeParse({ storeName: "Shop", heroImage: "not-a-url", announcement: "" }).success,
    ).toBe(false);
    // empty storeName rejected
    expect(
      s.safeParse({ storeName: "", heroImage: "https://x/h.jpg", announcement: "" }).success,
    ).toBe(false);
    // announcement over 200 chars rejected
    expect(
      s.safeParse({
        storeName: "Shop",
        heroImage: "https://x/h.jpg",
        announcement: "a".repeat(201),
      }).success,
    ).toBe(false);
  });

  it("update_copy restricts field to the two copy columns, bounds value, and requires confirm:true", async () => {
    const { updateCopySettings } = await import("@/lib/tools/settings");
    const s = updateCopySettings.input;
    expect(s.safeParse({ field: "websiteHeadline", value: "Hi", confirm: true }).success).toBe(true);
    expect(s.safeParse({ field: "tagline", value: "Hi", confirm: true }).success).toBe(true);
    // field outside the enum is rejected — the tool can only touch these two columns
    expect(s.safeParse({ field: "storeName", value: "Hi", confirm: true }).success).toBe(false);
    // empty value and over-200 value are rejected
    expect(s.safeParse({ field: "tagline", value: "", confirm: true }).success).toBe(false);
    expect(s.safeParse({ field: "tagline", value: "a".repeat(201), confirm: true }).success).toBe(
      false,
    );
    // confirm gate: absent or false is rejected
    expect(s.safeParse({ field: "tagline", value: "Hi" }).success).toBe(false);
    expect(s.safeParse({ field: "tagline", value: "Hi", confirm: false }).success).toBe(false);
  });

  it("get restricts type to the two singletons", async () => {
    const { getSettings } = await import("@/lib/tools/settings");
    const s = getSettings.input;
    expect(s.safeParse({ type: "shipping" }).success).toBe(true);
    expect(s.safeParse({ type: "branding" }).success).toBe(true);
    expect(s.safeParse({ type: "products" }).success).toBe(false);
  });
});
