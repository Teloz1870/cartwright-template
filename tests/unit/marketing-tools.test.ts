import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Marketing tools (`lib/tools/marketing.ts`) — the AI-invokable `marketing.create_campaign`
 * composite. ONE tool call fans out into THREE side effects: TWO audited DB mutations (the
 * discount upsert + the announcement update) plus a preview-mail file write (step 3, NOT
 * audited). There is deliberately NO atomic rollback across the steps (see the module comment),
 * and each of the two DB mutations is audited separately so `audit.revert` can unroll them
 * individually. This suite pins the composite's load-bearing contract:
 *   - Step 1 (discount) upserts a `DiscountCode` keyed on the NORMALISED code (trim + UPPERCASE)
 *     with the exact create/update payloads (`validUntil` string→Date or null, `active: true`)
 *     and a `{id, code}` projection, audited under `marketing.create_campaign:discount` with
 *     `{code,type,value}` args and NO before-snapshot (upsert has nothing to snapshot);
 *   - Step 2 (announcement) captures the prior banner via a narrow `before` closure
 *     (`select:{announcement}`), then does a SEPARATE full-row lookup, throws
 *     "BrandingSettings not seeded" when the row is missing, and otherwise updates row id:1 —
 *     audited under `marketing.create_campaign:announcement` with `{announcement}` args;
 *   - the NON-ATOMIC contract: when step 2 throws, step 1's discount upsert has ALREADY run
 *     (no rollback) — the exact behaviour the module comment warns about;
 *   - Step 3 (preview mail) is lazy: `writePreviewFile` is imported + called ONLY when
 *     `previewEmail` is supplied, with the normalised code, and its path surfaces on `previewPath`;
 *   - the return envelope (`ok`, `discount`, `announcement`, `previewPath`, `summary`) incl. the
 *     percent-vs-"ore" summary wording (the summary literal uses ASCII "ore" — see marketing.ts;
 *     marketing-helpers.ts, which this suite mocks away, renders the email amount in kroner);
 *   - the input-schema bounds (code min-3, type enum, value int/positive, announcement 5..200,
 *     previewEmail email) and the `marketing:write` scope / audited (skipAudit falsy) surface.
 *
 * Mocks: `@/lib/db` (prisma) + `@/lib/audit` (withAudit) + `@/lib/tools/marketing-helpers`
 * (writePreviewFile — so no preview file is written and its invocation is observable; because
 * vi.mock hoists the module, whether the SUT's `import()` is deferred is NOT observable here —
 * these tests pin that the helper is/ isn't CALLED, i.e. whether a preview file is written).
 * No real DB, no FS.
 * The withAudit stand-in resolves `before()` on both success and failure, matching the real
 * wrapper's ORDER (lib/audit.ts captures the before-snapshot before the try/catch); it models ONLY
 * that ordering, not the real wrapper's persistence / arg redaction / rejecting-before() swallow
 * (those belong to lib/audit.ts). Every withAudit call is captured (the composite makes two), so
 * step 1 and step 2's audit metas are asserted independently.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    discountCode: {
      upsert: vi.fn(),
      // present so a hypothetical compensating rollback would be a real spy (call it and the
      // non-atomic test fails) rather than a TypeError the generic .toThrow() would swallow.
      delete: vi.fn(),
    },
    brandingSettings: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  withAudit: vi.fn(),
  writePreviewFile: vi.fn(),
  // Every withAudit invocation, in order — the composite makes two (discount, announcement).
  calls: [] as Array<{ meta: Record<string, unknown>; before: unknown }>,
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/tools/marketing-helpers", () => ({ writePreviewFile: mocks.writePreviewFile }));

const ctx = {
  actor: "apikey:mk1",
  ip: "10.0.0.42",
  userAgent: "agent/2.0",
} as never;

async function loadTools() {
  return import("@/lib/tools/marketing");
}

/** A seeded, well-formed campaign input (percent) that both steps accept. */
function seedHappyPath() {
  mocks.prisma.discountCode.upsert.mockResolvedValue({ id: "camp1", code: "SUMMER20" });
  mocks.prisma.brandingSettings.findUnique
    .mockResolvedValueOnce({ announcement: "Old banner" }) // audit before() — narrow select
    .mockResolvedValueOnce({ id: 1, announcement: "Old banner" }); // handler full-row lookup
  mocks.prisma.brandingSettings.update.mockResolvedValue({
    announcement: "Summer Sale! Use SUMMER20 for 20% off.",
    updatedAt: new Date("2026-07-21T00:00:00.000Z"),
  });
}

beforeEach(() => {
  vi.resetModules();
  mocks.prisma.discountCode.upsert.mockReset();
  mocks.prisma.discountCode.delete.mockReset();
  mocks.prisma.brandingSettings.findUnique.mockReset();
  mocks.prisma.brandingSettings.update.mockReset();
  mocks.writePreviewFile.mockReset();
  mocks.calls = [];
  // withAudit stand-in: record meta + the resolved before-snapshot (the real withAudit resolves
  // before() BEFORE the try/catch, on success AND failure), then run fn — propagating rejections.
  mocks.withAudit
    .mockReset()
    .mockImplementation(
      async (
        meta: Record<string, unknown> & { before?: () => Promise<unknown> | unknown },
        fn: () => Promise<unknown>,
      ) => {
        const before = meta.before ? await meta.before() : undefined;
        mocks.calls.push({ meta, before });
        return fn();
      },
    );
});

describe("marketing.create_campaign — step 1 (discount)", () => {
  it("upserts the discount on the normalised code with the exact create/update payloads", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();

    await createCampaign.handler(
      createCampaign.input.parse({
        discountCode: "  summer20 ",
        discountType: "percent",
        discountValue: 20,
        validUntil: "2026-08-31T23:59:59.000Z",
        announcement: "Summer Sale is on!",
      }),
      ctx,
    );

    expect(mocks.prisma.discountCode.upsert).toHaveBeenCalledTimes(1);
    const call = mocks.prisma.discountCode.upsert.mock.calls[0][0];
    // Keyed on the trimmed+uppercased code — the case-insensitive identity checkout relies on.
    expect(call.where).toEqual({ code: "SUMMER20" });
    expect(call.create).toEqual({
      code: "SUMMER20",
      type: "percent",
      value: 20,
      validUntil: new Date("2026-08-31T23:59:59.000Z"),
      active: true,
    });
    // The UPDATE branch re-activates + re-prices but never rewrites `code` (that's the where-key).
    expect(call.update).toEqual({
      type: "percent",
      value: 20,
      validUntil: new Date("2026-08-31T23:59:59.000Z"),
      active: true,
    });
    expect(call.select).toEqual({ id: true, code: true });
  });

  it("passes validUntil as null when omitted", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();

    await createCampaign.handler(
      createCampaign.input.parse({
        discountCode: "NODATE",
        discountType: "fixed",
        discountValue: 5000,
        announcement: "Fixed-øre campaign",
      }),
      ctx,
    );

    const call = mocks.prisma.discountCode.upsert.mock.calls[0][0];
    expect(call.create.validUntil).toBeNull();
    expect(call.update.validUntil).toBeNull();
    // A `fixed` value is in øre — NOT bounded by the percent ceiling.
    expect(call.create.value).toBe(5000);
  });

  it("audits step 1 under :discount with {code,type,value} args and NO before-snapshot", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();

    await createCampaign.handler(
      createCampaign.input.parse({
        discountCode: "AUTUMN15",
        discountType: "percent",
        discountValue: 15,
        announcement: "Autumn arrivals",
      }),
      ctx,
    );

    const step1 = mocks.calls[0];
    expect(step1.meta).toMatchObject({
      actor: "apikey:mk1",
      tool: "marketing.create_campaign:discount",
      args: { code: "AUTUMN15", type: "percent", value: 15 },
      ip: "10.0.0.42",
      userAgent: "agent/2.0",
    });
    // upsert has nothing to snapshot — the discount step carries no before closure.
    expect(step1.meta.before).toBeUndefined();
    expect(step1.before).toBeUndefined();
  });
});

describe("marketing.create_campaign — step 2 (announcement)", () => {
  it("captures the prior banner via a narrow before() then updates row id:1", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();

    await createCampaign.handler(
      createCampaign.input.parse({
        discountCode: "SUMMER20",
        discountType: "percent",
        discountValue: 20,
        announcement: "Summer Sale! Use SUMMER20 for 20% off.",
      }),
      ctx,
    );

    // Two brandingSettings.findUnique calls: the audit before() (narrow select) THEN the
    // handler's full-row existence lookup. Model + assert them separately so the projection
    // is real, not an artefact of one mock answering both.
    expect(mocks.prisma.brandingSettings.findUnique).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.brandingSettings.findUnique.mock.calls[0][0]).toEqual({
      where: { id: 1 },
      select: { announcement: true },
    });
    expect(mocks.prisma.brandingSettings.findUnique.mock.calls[1][0]).toEqual({ where: { id: 1 } });

    expect(mocks.prisma.brandingSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { announcement: "Summer Sale! Use SUMMER20 for 20% off." },
      select: { announcement: true, updatedAt: true },
    });

    const step2 = mocks.calls[1];
    expect(step2.meta).toMatchObject({
      actor: "apikey:mk1",
      tool: "marketing.create_campaign:announcement",
      args: { announcement: "Summer Sale! Use SUMMER20 for 20% off." },
      ip: "10.0.0.42",
      userAgent: "agent/2.0",
    });
    // The before-snapshot is the prior banner from the narrow select.
    expect(step2.before).toEqual({ announcement: "Old banner" });
  });

  it("throws 'BrandingSettings not seeded' when row id:1 is missing, without updating", async () => {
    const { createCampaign } = await loadTools();
    mocks.prisma.discountCode.upsert.mockResolvedValue({ id: "c2", code: "GHOST" });
    // An unseeded row id:1 is null under BOTH the narrow before() select and the handler's
    // full-row lookup (both hit the same missing row).
    mocks.prisma.brandingSettings.findUnique
      .mockResolvedValueOnce(null) // before()
      .mockResolvedValueOnce(null); // handler full-row lookup → missing

    await expect(
      createCampaign.handler(
        createCampaign.input.parse({
          discountCode: "GHOST",
          discountType: "percent",
          discountValue: 10,
          announcement: "This will fail at step 2",
        }),
        ctx,
      ),
    ).rejects.toThrow("BrandingSettings not seeded");

    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
  });

  it("does NOT roll back step 1 when step 2 fails (documented non-atomic contract)", async () => {
    const { createCampaign } = await loadTools();
    mocks.prisma.discountCode.upsert.mockResolvedValue({ id: "c3", code: "PARTIAL" });
    mocks.prisma.brandingSettings.findUnique
      .mockResolvedValueOnce(null) // before()
      .mockResolvedValueOnce(null); // step 2's full-row lookup → missing → throws

    await expect(
      createCampaign.handler(
        createCampaign.input.parse({
          discountCode: "PARTIAL",
          discountType: "percent",
          discountValue: 10,
          announcement: "Half-applied campaign",
        }),
        ctx,
      ),
      // Assert the EXACT step-2 error, not a bare .toThrow(): if the handler ever added a
      // compensating `discountCode.delete(...)` rollback, that would surface a different error
      // (and `delete` is a real spy below), so this assertion + the delete check together fail
      // the moment a rollback is introduced — the non-atomic contract is genuinely pinned.
    ).rejects.toThrow("BrandingSettings not seeded");

    // The discount was already minted before the announcement step blew up — and nothing
    // compensates for it (no rollback delete). Each step is independently audited so
    // audit.revert can undo them one at a time.
    expect(mocks.prisma.discountCode.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.discountCode.delete).not.toHaveBeenCalled();
    expect(mocks.calls[0].meta.tool).toBe("marketing.create_campaign:discount");
  });
});

describe("marketing.create_campaign — step 3 (preview mail, lazy)", () => {
  it("skips writePreviewFile entirely and returns previewPath null when no previewEmail", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();

    const result = await createCampaign.handler(
      createCampaign.input.parse({
        discountCode: "NOMAIL",
        discountType: "percent",
        discountValue: 20,
        announcement: "No preview requested",
      }),
      ctx,
    );

    expect(mocks.writePreviewFile).not.toHaveBeenCalled();
    expect(result.previewPath).toBeNull();
  });

  it("writes a preview (normalised code) and surfaces the path when previewEmail is set", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();
    mocks.writePreviewFile.mockResolvedValue("/repo/.mail-previews/campaign-summer20-123.html");

    const result = await createCampaign.handler(
      createCampaign.input.parse({
        discountCode: "  summer20 ",
        discountType: "percent",
        discountValue: 20,
        announcement: "Preview me",
        previewEmail: "owner@example.com",
      }),
      ctx,
    );

    expect(mocks.writePreviewFile).toHaveBeenCalledTimes(1);
    expect(mocks.writePreviewFile).toHaveBeenCalledWith({
      to: "owner@example.com",
      code: "SUMMER20", // normalised, matching the minted discount
      type: "percent",
      value: 20,
      announcement: "Preview me",
    });
    expect(result.previewPath).toBe("/repo/.mail-previews/campaign-summer20-123.html");
  });
});

describe("marketing.create_campaign — return envelope + summary", () => {
  it("returns the composite result with a percent summary", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();

    const result = await createCampaign.handler(
      createCampaign.input.parse({
        discountCode: "SUMMER20",
        discountType: "percent",
        discountValue: 20,
        announcement: "Summer Sale! Use SUMMER20 for 20% off.",
      }),
      ctx,
    );

    expect(result).toMatchObject({
      ok: true,
      discount: { id: "camp1", code: "SUMMER20" },
      announcement: "Summer Sale! Use SUMMER20 for 20% off.",
      previewPath: null,
    });
    expect(result.summary).toBe(
      'Campaign running: SUMMER20 (20%), front page banner: "Summer Sale! Use SUMMER20 for 20% off.".',
    );
  });

  it("renders the øre summary branch for a fixed discount", async () => {
    const { createCampaign } = await loadTools();
    mocks.prisma.discountCode.upsert.mockResolvedValue({ id: "c4", code: "FLAT50" });
    mocks.prisma.brandingSettings.findUnique
      .mockResolvedValueOnce({ announcement: "old" })
      .mockResolvedValueOnce({ id: 1, announcement: "old" });
    mocks.prisma.brandingSettings.update.mockResolvedValue({
      announcement: "50 øre off",
      updatedAt: new Date(),
    });

    const result = await createCampaign.handler(
      createCampaign.input.parse({
        discountCode: "FLAT50",
        discountType: "fixed",
        discountValue: 50,
        announcement: "Flat fifty øre off everything",
      }),
      ctx,
    );

    expect(result.summary).toContain("FLAT50 (50 ore)");
  });
});

describe("marketing.create_campaign — input schema bounds", () => {
  it("rejects short codes, out-of-range announcements, bad values/types and non-email preview", async () => {
    const { createCampaign } = await loadTools();
    const base = {
      discountCode: "VALID",
      discountType: "percent",
      discountValue: 10,
      announcement: "A valid announcement",
    };
    const bad = [
      { ...base, discountCode: "ab" }, // < 3 chars
      { ...base, discountType: "bogus" }, // not in enum
      { ...base, discountValue: 0 }, // not positive
      { ...base, discountValue: -5 }, // negative
      { ...base, discountValue: 10.5 }, // not int
      { ...base, announcement: "hi" }, // < 5 chars
      { ...base, announcement: "x".repeat(201) }, // > 200 chars
      { ...base, validUntil: "next tuesday" }, // not ISO datetime
      { ...base, previewEmail: "not-an-email" }, // not an email
    ];
    for (const input of bad) {
      expect(() => createCampaign.input.parse(input), JSON.stringify(input)).toThrow();
    }
    // The happy base parses cleanly.
    expect(() => createCampaign.input.parse(base)).not.toThrow();
  });

  it("measures the length AFTER trimming: whitespace padding cannot buy past min(3)", async () => {
    const { createCampaign } = await loadTools();
    // Same chain order as lib/tools/discounts.ts: `.trim()` runs before `.min(3)`, so the
    // padding is stripped before the length is judged. It matters more here because the code
    // does not stop at the DB: with `previewEmail` set, step 3 renders it as the campaign's
    // headline code (lib/tools/marketing-helpers.ts:46).
    for (const discountCode of ["ab", "  ab  ", "   ", " a "]) {
      expect(
        () =>
          createCampaign.input.parse({
            discountCode,
            discountType: "percent",
            discountValue: 10,
            announcement: "short code check",
          }),
        JSON.stringify(discountCode),
      ).toThrow();
    }
    // Previously-valid codes normalise unchanged.
    expect(
      createCampaign.input.parse({
        discountCode: "  save20  ",
        discountType: "percent",
        discountValue: 10,
        announcement: "short code check",
      }).discountCode,
    ).toBe("SAVE20");
  });
});

describe("marketing — tool surface", () => {
  it("is a write-scoped, audited tool", async () => {
    const { createCampaign } = await loadTools();
    expect(createCampaign.name).toBe("marketing.create_campaign");
    expect(createCampaign.scope).toBe("marketing:write");
    // A composite that mints money + mutates the live banner must not opt out of auditing.
    expect(createCampaign.skipAudit).toBeFalsy();
  });

  it("exports exactly the one registered tool", async () => {
    const { marketingTools } = await loadTools();
    expect(marketingTools.map((t) => t.name)).toEqual(["marketing.create_campaign"]);
  });
});
