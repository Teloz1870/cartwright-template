import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Marketing tools (`lib/tools/marketing.ts`) — the AI-invokable `marketing.create_campaign`
 * composite. ONE tool call fans out into THREE side effects: TWO audited DB mutations (the
 * discount upsert + the announcement update) plus a preview-mail file write (step 3, NOT
 * audited). There is deliberately NO atomic rollback across the steps (see the module comment),
 * and each of the two DB mutations is audited separately (neither is in audit.revert's supported
 * set — the description must not promise otherwise). This suite pins the composite's load-bearing contract:
 *   - Step 0 (DRØM134-a): a code that exists and is switched off is REFUSED before any write —
 *     `marketing:write` alone must never switch a discount back on;
 *   - Step 1 (discount) upserts a `DiscountCode` keyed on the NORMALISED code (trim + UPPERCASE)
 *     AND `active: true` (a code switched off mid-call makes the upsert return null, which is
 *     refused inside step 1 before the banner/preview), with the exact create/update
 *     payloads (`validUntil` string→Date or null; `active: true` on create only)
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
      findUnique: vi.fn(),
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
  // `outcome` is what the real wrapper would log: a throw inside fn is a failed
  // audit row, a resolved fn a successful one.
  calls: [] as Array<{ meta: Record<string, unknown>; before: unknown; outcome?: "ok" | "error" }>,
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
// apiDiscountBounds off: this suite pins the unbounded path (the bounded one
// lives in discount-api-key-bounds.test.ts), and the real getBrand would read
// the same mocked brandingSettings row the steps below consume in order.
vi.mock("@/lib/brand", () => ({
  getFeatureGateState: async () => ({ available: true, features: { apiDiscountBounds: false } }),
}));
vi.mock("@/lib/tools/marketing-helpers", () => ({
  writePreviewFile: mocks.writePreviewFile,
}));

const ctx = {
  actor: "apikey:mk1",
  ip: "10.0.0.42",
  userAgent: "agent/2.0",
} as never;

async function loadTools() {
  return import("@/lib/tools/marketing");
}

/** Step 1's conditional write: the code, still on, and not expired at the write's own clock. */
function liveWhere(code: string) {
  return {
    code,
    active: true,
    OR: [{ validUntil: null }, { validUntil: { gte: expect.any(Date) } }],
  };
}

/** A seeded, well-formed campaign input (percent) that both steps accept. */
function seedHappyPath() {
  mocks.prisma.discountCode.upsert.mockResolvedValue({
    id: "camp1",
    code: "SUMMER20",
  });
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
  // Default: the code does not exist yet (step 0 passes).
  mocks.prisma.discountCode.findUnique.mockReset().mockResolvedValue(null);
  mocks.prisma.brandingSettings.findUnique.mockReset();
  mocks.prisma.brandingSettings.update.mockReset();
  mocks.writePreviewFile.mockReset();
  mocks.calls = [];
  // withAudit stand-in: record meta + the resolved before-snapshot (the real withAudit resolves
  // before() BEFORE the try/catch, on success AND failure), then run fn — propagating rejections.
  mocks.withAudit.mockReset().mockImplementation(
    async (
      meta: Record<string, unknown> & {
        before?: () => Promise<unknown> | unknown;
      },
      fn: () => Promise<unknown>,
    ) => {
      const before = meta.before ? await meta.before() : undefined;
      const call: (typeof mocks.calls)[number] = { meta, before };
      mocks.calls.push(call);
      try {
        const result = await fn();
        call.outcome = "ok";
        return result;
      } catch (e) {
        call.outcome = "error";
        throw e;
      }
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
    // Keyed on the trimmed+uppercased code — the case-insensitive identity checkout relies on —
    // and only on a row that is still live (on, and not expired) at the write.
    expect(call.where).toEqual(liveWhere("SUMMER20"));
    expect(call.create).toEqual({
      code: "SUMMER20",
      type: "percent",
      value: 20,
      validUntil: new Date("2026-08-31T23:59:59.000Z"),
      active: true,
    });
    // The UPDATE branch re-prices an ACTIVE code; it never touches `active` (it only matches
    // active rows) nor rewrites `code` (that's the where-key).
    expect(call.update).toEqual({
      type: "percent",
      value: 20,
      validUntil: new Date("2026-08-31T23:59:59.000Z"),
    });
    expect(call.select).toEqual({ id: true, code: true });
  });

  it("omitted validUntil: a new code never expires, an existing one keeps its date", async () => {
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
    // Writing null here would make a dated code endless (CAMPAIGN-EXPIRED-REVIVE).
    expect(call.update).not.toHaveProperty("validUntil");
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

describe("marketing.create_campaign — step 0 (a switched-off code stays off, DRØM134-a)", () => {
  const input = {
    discountCode: " oldcode ",
    discountType: "percent",
    discountValue: 30,
    announcement: "Bring back the old code",
    previewEmail: "owner@example.com",
  };

  it("refuses an existing, switched-off code before any write, audit, banner or preview", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();
    mocks.prisma.discountCode.findUnique
      .mockReset()
      .mockResolvedValue({ active: false });

    await expect(
      createCampaign.handler(createCampaign.input.parse(input), ctx),
    ).rejects.toThrow(/OLDCODE exists and is switched off/);
    expect(mocks.prisma.discountCode.findUnique).toHaveBeenCalledWith({
      where: { code: "OLDCODE" },
      select: { active: true, validUntil: true },
    });
    expect(mocks.prisma.discountCode.upsert).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
    expect(mocks.writePreviewFile).not.toHaveBeenCalled();
  });

  it("still updates an existing ACTIVE code (running a campaign again)", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();
    mocks.prisma.discountCode.findUnique
      .mockReset()
      .mockResolvedValue({ active: true });

    const result = await createCampaign.handler(
      createCampaign.input.parse(input),
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(mocks.prisma.discountCode.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.discountCode.upsert.mock.calls[0][0].where).toEqual(liveWhere("OLDCODE"));
  });

  it("fails closed when the code is switched off between the check and the write", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();
    // Step 0 saw it active; by the upsert the row no longer matches `active: true`. Prisma 7 +
    // libSQL runs ONE native `INSERT … ON CONFLICT (code) DO UPDATE … WHERE active`, which then
    // returns null — it does not throw (measured on #777 with the real client). The null must
    // become the same refusal inside step 1, before the banner and the preview.
    mocks.prisma.discountCode.findUnique
      .mockReset()
      .mockResolvedValueOnce({ active: true }) // step 0
      .mockResolvedValueOnce({ active: false }); // the re-read that picks the refusal
    mocks.prisma.discountCode.upsert.mockReset().mockResolvedValue(null);

    await expect(
      createCampaign.handler(createCampaign.input.parse(input), ctx),
    ).rejects.toThrow(/OLDCODE exists and is switched off/);
    expect(mocks.prisma.discountCode.upsert).toHaveBeenCalledTimes(1);
    // The refusal is thrown INSIDE step 1's audited function, so step 2 never starts and step 1's
    // audit row is a failure. Counting calls alone stays green if the null-check moves after
    // withAudit (step 1 would then log a success for a write that never happened).
    expect(mocks.calls.map((c) => [c.meta.tool, c.outcome])).toEqual([
      ["marketing.create_campaign:discount", "error"],
    ]);
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
    expect(mocks.writePreviewFile).not.toHaveBeenCalled();
  });

  // CAMPAIGN-EXPIRED-REVIVE: an active code whose validUntil has passed is refused before any
  // write — with or without a new validUntil — so a campaign never revives it.
  it.each([
    ["without validUntil", {}],
    ["with a new validUntil", { validUntil: new Date(Date.now() + 86_400_000).toISOString() }],
  ])("refuses an existing, EXPIRED code %s: 409 discount_code_expired, nothing written", async (_label, extra) => {
    const { createCampaign } = await loadTools();
    seedHappyPath();
    mocks.prisma.discountCode.findUnique
      .mockReset()
      .mockResolvedValue({ active: true, validUntil: new Date(Date.now() - 60_000) });

    await expect(
      createCampaign.handler(createCampaign.input.parse({ ...input, ...extra }), ctx),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ToolRefusal",
        code: "discount_code_expired",
        status: 409,
        message: expect.stringMatching(/^Discount code OLDCODE exists and has expired/),
      }),
    );
    expect(mocks.prisma.discountCode.upsert).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
    expect(mocks.writePreviewFile).not.toHaveBeenCalled();
  });

  it("an active code that has not expired yet is updated and keeps its date", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();
    mocks.prisma.discountCode.findUnique
      .mockReset()
      .mockResolvedValue({ active: true, validUntil: new Date(Date.now() + 86_400_000) });

    await createCampaign.handler(createCampaign.input.parse(input), ctx);
    expect(mocks.prisma.discountCode.upsert.mock.calls[0][0].update).toEqual({
      type: "percent",
      value: 30,
    });
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
    expect(mocks.prisma.brandingSettings.findUnique.mock.calls[1][0]).toEqual({
      where: { id: 1 },
    });

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
    mocks.prisma.discountCode.upsert.mockResolvedValue({
      id: "c2",
      code: "GHOST",
    });
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
    mocks.prisma.discountCode.upsert.mockResolvedValue({
      id: "c3",
      code: "PARTIAL",
    });
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
    // compensates for it (no rollback delete). Each step is audited separately, but none is in
    // audit.revert's supported set: cleanup is manual (discounts.toggle, settings.update_branding).
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
    mocks.writePreviewFile.mockResolvedValue(
      "/repo/.mail-previews/campaign-summer20-123.html",
    );

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
    expect(result.previewPath).toBe(
      "/repo/.mail-previews/campaign-summer20-123.html",
    );
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
    mocks.prisma.discountCode.upsert.mockResolvedValue({
      id: "c4",
      code: "FLAT50",
    });
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
      { ...base, discountValue: 101 }, // percent above 100 — same ceiling as discounts.create
      { ...base, discountValue: 5000 }, // a fixed-øre amount sent as percent
      { ...base, discountCode: "A".repeat(65) }, // > 64: a refusal echoes the code
    ];
    for (const input of bad) {
      expect(
        () => createCampaign.input.parse(input),
        JSON.stringify(input),
      ).toThrow();
    }
    // The happy base parses cleanly, 100 % is the ceiling, and a fixed value is in øre (no ceiling).
    expect(() => createCampaign.input.parse(base)).not.toThrow();
    // 64 is the cap, measured after the trim like the minimum.
    expect(() =>
      createCampaign.input.parse({ ...base, discountCode: ` ${"A".repeat(64)} ` }),
    ).not.toThrow();
    expect(() =>
      createCampaign.input.parse({ ...base, discountValue: 100 }),
    ).not.toThrow();
    expect(() =>
      createCampaign.input.parse({
        ...base,
        discountType: "fixed",
        discountValue: 50000,
      }),
    ).not.toThrow();
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

describe("marketing.create_campaign — DISCOUNT-FU-NITS", () => {
  const base = {
    discountType: "percent",
    discountValue: 10,
    announcement: "A valid announcement",
  };

  // (1) The cap binds on the STORED form. Upper-casing lengthens "ß" (⇒ "SS") and "ΐ"
  // (⇒ three code points), so a 64-character input could be stored up to 3× longer.
  it("(1) caps the code as stored (after upper-casing), not as typed", async () => {
    const { createCampaign } = await loadTools();
    const parse = (discountCode: string) => createCampaign.input.safeParse({ ...base, discountCode });
    for (const unit of ["ß", "ΐ", "ﬀ", "a"]) {
      for (let n = 1; n <= 64; n++) {
        const r = parse(unit.repeat(n));
        if (r.success) expect(r.data.discountCode.length, `${unit} × ${n}`).toBeLessThanOrEqual(64);
      }
    }
    // The edges: 32 × "ß" is stored as 64 characters, 33 × "ß" would be 66.
    const ok = parse("ß".repeat(32));
    expect(ok.success && ok.data.discountCode).toBe("SS".repeat(32));
    const over = parse("ß".repeat(33));
    expect(over.success).toBe(false);
    // The message is a literal: it names the cap and never carries the code.
    expect(JSON.stringify(over.error)).toContain("at most 64 characters once upper-cased");
    expect(JSON.stringify(over.error)).not.toMatch(/ß|SS/);
  });

  // (2) The expiry is checked by the write itself, on a clock read at the write.
  it("(2) the write's expiry bound is read at the write, not at step 0", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { createCampaign } = await loadTools();
      seedHappyPath();
      const t0 = new Date("2026-11-27T12:00:00.000Z");
      const atWrite = new Date("2026-11-27T12:00:05.000Z");
      vi.setSystemTime(t0);
      // Step 0 sees a live code (step 0 runs at t0) ...
      mocks.prisma.discountCode.findUnique
        .mockReset()
        .mockResolvedValueOnce({ active: true, validUntil: new Date(t0.getTime() + 2_000) });
      // ... and step 1 starts later, when that code has expired.
      mocks.withAudit.mockImplementationOnce(async (_meta: unknown, fn: () => Promise<unknown>) => {
        vi.setSystemTime(atWrite);
        return fn();
      });

      await createCampaign.handler(
        createCampaign.input.parse({ ...base, discountCode: "RACE", validUntil: "2027-01-31T00:00:00.000Z" }),
        ctx,
      );
      const where = mocks.prisma.discountCode.upsert.mock.calls[0][0].where;
      // Bound to the write's clock: in SQL this row (validUntil t0+2s) no longer matches.
      expect(where.OR).toEqual([{ validUntil: null }, { validUntil: { gte: atWrite } }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["P2002 (the emulated INSERT hit the unique code)", "P2002"],
    ["P2025 (the emulated UPDATE matched nothing)", "P2025"],
  ])("(2) a write that no longer matches — %s — is refused by what the row is now", async (_l, prismaCode) => {
    const { createCampaign } = await loadTools();
    seedHappyPath();
    const raw = Object.assign(new Error("libsql://shop-secret.turso.io"), { code: prismaCode });
    const input = createCampaign.input.parse({ ...base, discountCode: "RACE" });
    const cases: Array<[object | null, string]> = [
      [{ active: true, validUntil: new Date(Date.now() - 1_000) }, "discount_code_expired"],
      [{ active: false, validUntil: null }, "discount_code_switched_off"],
      [null, "discount_code_switched_off"],
      [{ active: true, validUntil: null }, "discount_code_exists"],
    ];
    for (const [now, code] of cases) {
      mocks.prisma.discountCode.findUnique.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(now);
      mocks.prisma.discountCode.upsert.mockReset().mockRejectedValue(raw);
      const err = await createCampaign.handler(input, ctx).catch((e: unknown) => e);
      expect(err, JSON.stringify(now)).toMatchObject({ name: "ToolRefusal", code, status: 409 });
      expect(String((err as Error).message)).not.toContain("turso.io");
    }
    expect(mocks.prisma.brandingSettings.update).not.toHaveBeenCalled();
  });

  it("(2) any other write error is left alone (stays a 500)", async () => {
    const { createCampaign } = await loadTools();
    seedHappyPath();
    const raw = Object.assign(new Error("SQLITE_BUSY"), { code: "P1008" });
    mocks.prisma.discountCode.upsert.mockReset().mockRejectedValue(raw);
    await expect(
      createCampaign.handler(createCampaign.input.parse({ ...base, discountCode: "RACE" }), ctx),
    ).rejects.toBe(raw);
  });

  // (3) Documented, not exempted: exempting would mean reading (and echoing in a 409) an
  // unbounded string before knowing it exists, and a new code over the cap could no longer
  // be the 422 #795 promised.
  it("(3) an existing code over 64 characters (made in /admin) cannot be re-run, and the description says so", async () => {
    const { createCampaign } = await loadTools();
    mocks.prisma.discountCode.findUnique.mockReset().mockResolvedValue({ active: true, validUntil: null });
    expect(createCampaign.input.safeParse({ ...base, discountCode: "A".repeat(65) }).success).toBe(false);
    expect(createCampaign.description).toMatch(
      /at most 64 characters once upper-cased, also for an existing code: a longer code made in \/admin cannot be re-run as a campaign/,
    );
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

  it("does not promise an audit.revert that does not exist", async () => {
    const { createCampaign } = await loadTools();
    const { readFileSync } = await import("node:fs");
    // audit.revert's supported set (lib/tools/audit.ts) has no marketing step.
    const auditSrc = readFileSync("lib/tools/audit.ts", "utf8");
    const start = auditSrc.indexOf("SUPPORTED_REVERTS = [");
    const end = auditSrc.indexOf("] as const", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const supported = auditSrc.slice(start, end);
    expect(supported).toMatch(/products\.delete/); // the slice really is the list
    expect(supported).not.toMatch(/marketing/);
    expect(createCampaign.description).not.toMatch(/audit\.revert can/);
    expect(createCampaign.description).toMatch(
      /none can be undone with audit\.revert/,
    );
    expect(createCampaign.description).toMatch(/switched off or has expired is refused/);
    expect(createCampaign.description).toMatch(/keeps its expiry unless validUntil is given/);
    // The value rules name the real input keys, not discounts.create's `type`/`value`.
    expect(createCampaign.description).toMatch(
      /discountType='percent' takes discountValue 1-100/,
    );
    // The MCP instructions no longer call the campaign "governed", and promise no undo for it.
    // The only revert they may name is the destructive-operations rule; the rest of the
    // instructions block must not mention revert/undo/rollback at all (one sentence or two).
    const mcpSrc = readFileSync("app/api/mcp/route.ts", "utf8");
    expect(mcpSrc).not.toMatch(/governed campaign/);
    const blockStart = mcpSrc.indexOf("instructions:");
    const blockEnd = mcpSrc.indexOf("maxToolInputElements", blockStart);
    expect(blockStart).toBeGreaterThanOrEqual(0);
    expect(blockEnd).toBeGreaterThan(blockStart);
    const block = mcpSrc.slice(blockStart, blockEnd);
    expect(block).toMatch(/Use marketing\.create_campaign/); // the slice really holds the sentence
    const destructive = "(*.delete, audit.revert) require explicit confirm:true";
    expect(block).toContain(destructive);
    expect(block.replace(destructive, "")).not.toMatch(/revert|undo|undone|roll\s*back|reversible/i);
  });

  it("exports exactly the one registered tool", async () => {
    const { marketingTools } = await loadTools();
    expect(marketingTools.map((t) => t.name)).toEqual([
      "marketing.create_campaign",
    ]);
  });
});
