import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Discount-code tools (`lib/tools/discounts.ts`) — the admin/agent surface that
 * mints and disables the codes a shopper can redeem at checkout. Every one of
 * these is AI-invokable over REST/MCP, and each writes a row that directly moves
 * money off the order total, so the guards + normalisation + audit wiring are
 * load-bearing. This suite pins:
 *   - `code` normalisation (trim + UPPERCASE) — the case-insensitive identity the
 *     whole feature rests on; the toggle lookup MUST use the normalised form, or a
 *     lowercase argument silently misses the row,
 *   - the percent≤100 refine + int/positive bounds that stop a 500%-off code,
 *   - `discounts.create`'s exact create payload (`validUntil` string→Date or null,
 *     `usageLimit ?? null`, `active: true`) and its {id, code} projection,
 *   - `discounts.toggle`'s flip semantics (`args.active ?? !existing.active`), its
 *     update keyed off the loaded row's `id` (not the code), and the not-found
 *     throw that fires AFTER the audit before-snapshot is captured,
 *   - the audit contract: actor/tool/args/ip/userAgent threading on both write
 *     tools, and the `before` closure resolving on the REJECTED path too,
 *   - `discounts.list` is read-only (`skipAudit`), filters on `onlyActive`, and
 *     carries the limit default 50 / max 100,
 *   - the read/write scope split (`discounts:read` vs `discounts:write`).
 *
 * Mocks: `@/lib/db` (prisma) + `@/lib/audit` (withAudit). No real DB. The withAudit
 * stand-in resolves `before()` on BOTH success and failure, matching the real
 * wrapper's ORDER (lib/audit.ts:59 captures the before-snapshot before the
 * try/catch). It deliberately models only that ordering — not the real wrapper's
 * persistence, arg redaction (`redactSensitive`) or its `captureBefore` swallow of
 * a REJECTING `before()`; those belong to lib/audit.ts and are covered there. No
 * test here exercises a rejecting `before()`, so nothing passes for a wrong reason.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    discountCode: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  withAudit: vi.fn(),
  // capture the meta + resolved `before()` snapshot the tool hands to withAudit.
  captured: {
    meta: null as null | Record<string, unknown>,
    before: undefined as unknown,
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const ctx = {
  actor: "apikey:k1",
  ip: "10.0.0.9",
  userAgent: "agent/1.0",
} as never;

async function loadTools() {
  return import("@/lib/tools/discounts");
}

beforeEach(() => {
  vi.resetModules();
  mocks.prisma.discountCode.findMany.mockReset();
  mocks.prisma.discountCode.findUnique.mockReset();
  mocks.prisma.discountCode.create.mockReset();
  mocks.prisma.discountCode.update.mockReset();
  mocks.captured.meta = null;
  mocks.captured.before = undefined;
  // withAudit stand-in: capture meta, resolve the before-snapshot (the real
  // withAudit does this on BOTH success and failure, before the try/catch), then
  // run fn — propagating a handler rejection exactly as lib/audit.ts:90 does.
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

describe("discounts.create — minting a redeemable code", () => {
  it("threads the exact create payload and returns only the {id, code} projection", async () => {
    const { createDiscount } = await loadTools();
    mocks.prisma.discountCode.create.mockResolvedValue({
      id: "d1",
      code: "SUMMER10",
      type: "percent",
      value: 10,
      validUntil: null,
      usageLimit: null,
      usageCount: 0,
      active: true,
    });

    const result = await createDiscount.handler(
      createDiscount.input.parse({ code: "SUMMER10", type: "percent", value: 10 }),
      ctx,
    );

    expect(mocks.prisma.discountCode.create).toHaveBeenCalledWith({
      data: {
        code: "SUMMER10",
        type: "percent",
        value: 10,
        validUntil: null,
        usageLimit: null,
        active: true,
      },
    });
    // The tool deliberately narrows the row — a caller must not learn usageCount
    // or the active flag from the create ack.
    expect(result).toEqual({ id: "d1", code: "SUMMER10" });
  });

  it("converts an ISO validUntil string into a Date and passes usageLimit through", async () => {
    const { createDiscount } = await loadTools();
    mocks.prisma.discountCode.create.mockResolvedValue({ id: "d2", code: "BLACKFRIDAY" });

    await createDiscount.handler(
      createDiscount.input.parse({
        code: "BLACKFRIDAY",
        type: "fixed",
        value: 5000,
        validUntil: "2026-11-30T23:59:59.000Z",
        usageLimit: 100,
      }),
      ctx,
    );

    const data = mocks.prisma.discountCode.create.mock.calls.at(-1)?.[0].data;
    expect(data.validUntil).toBeInstanceOf(Date);
    expect(data.validUntil.toISOString()).toBe("2026-11-30T23:59:59.000Z");
    expect(data.usageLimit).toBe(100);
    // A `fixed` value is in øre and is NOT bounded by the percent ceiling.
    expect(data.value).toBe(5000);
  });

  it("audits with actor/tool/args/ip/userAgent and no before-snapshot (nothing pre-exists)", async () => {
    const { createDiscount } = await loadTools();
    mocks.prisma.discountCode.create.mockResolvedValue({ id: "d3", code: "WELCOME" });

    const args = createDiscount.input.parse({ code: "WELCOME", type: "percent", value: 5 });
    await createDiscount.handler(args, ctx);

    expect(mocks.captured.meta).toMatchObject({
      actor: "apikey:k1",
      tool: "discounts.create",
      args,
      ip: "10.0.0.9",
      userAgent: "agent/1.0",
    });
    expect(mocks.captured.meta?.before).toBeUndefined();
  });
});

describe("discounts — code normalisation (the case-insensitive identity)", () => {
  it("create uppercases and trims the code before it reaches the DB", async () => {
    const { createDiscount } = await loadTools();
    mocks.prisma.discountCode.create.mockResolvedValue({ id: "d4", code: "SPRING20" });

    await createDiscount.handler(
      createDiscount.input.parse({ code: "  spring20 ", type: "percent", value: 20 }),
      ctx,
    );

    expect(mocks.prisma.discountCode.create.mock.calls.at(-1)?.[0].data.code).toBe("SPRING20");
  });

  it("toggle looks the row up by the NORMALISED code, so a lowercase arg still hits", async () => {
    const { toggleDiscount } = await loadTools();
    mocks.prisma.discountCode.findUnique.mockResolvedValue({
      id: "d5",
      code: "SPRING20",
      active: true,
    });
    mocks.prisma.discountCode.update.mockResolvedValue({ code: "SPRING20", active: false });

    await toggleDiscount.handler(
      toggleDiscount.input.parse({ code: " spring20 " }),
      ctx,
    );

    // Both the audit before() lookup and the handler lookup must use "SPRING20".
    for (const call of mocks.prisma.discountCode.findUnique.mock.calls) {
      expect(call[0].where).toEqual({ code: "SPRING20" });
    }
    expect(mocks.prisma.discountCode.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("discounts.create — input schema bounds", () => {
  it("rejects a percent discount above 100", async () => {
    const { createDiscount } = await loadTools();
    expect(() =>
      createDiscount.input.parse({ code: "TOOMUCH", type: "percent", value: 101 }),
    ).toThrow();
    // ...but the same value is legal for a fixed (øre) discount.
    expect(() =>
      createDiscount.input.parse({ code: "TOOMUCH", type: "fixed", value: 101 }),
    ).not.toThrow();
  });

  it("rejects zero/negative/fractional values, short codes, unknown types and bad dates", async () => {
    const { createDiscount } = await loadTools();
    const bad = [
      { code: "ZERO", type: "percent", value: 0 },
      { code: "NEG", type: "percent", value: -5 },
      { code: "FRAC", type: "fixed", value: 10.5 },
      { code: "AB", type: "percent", value: 10 },
      { code: "NOPE", type: "bogus", value: 10 },
      { code: "BADDATE", type: "percent", value: 10, validUntil: "next tuesday" },
      { code: "BADLIMIT", type: "percent", value: 10, usageLimit: 0 },
    ];
    for (const input of bad) {
      expect(() => createDiscount.input.parse(input), JSON.stringify(input)).toThrow();
    }
  });

  it("measures the length AFTER trimming: whitespace padding cannot buy past min(3)", async () => {
    const { createDiscount } = await loadTools();
    // Zod runs a string chain in written order. With `.min(3)` first it measured
    // the RAW string, so a padded short code slipped through and was stored below
    // the advertised minimum — `"   "` even minted the empty code `""` into a
    // @unique column. `.trim()` now runs first, so padding is stripped before the
    // length is judged: what is measured is exactly what is stored.
    for (const code of ["ab", "  ab  ", "   ", " a "]) {
      expect(() =>
        createDiscount.input.parse({ code, type: "percent", value: 10 }),
        JSON.stringify(code),
      ).toThrow();
    }
    // Codes that were always valid normalise exactly as before — the padding
    // rejection is the ONLY behaviour this reordering changes.
    expect(createDiscount.input.parse({ code: "abc", type: "percent", value: 10 }).code).toBe(
      "ABC",
    );
    expect(
      createDiscount.input.parse({ code: "  save20  ", type: "percent", value: 10 }).code,
    ).toBe("SAVE20");
  });

  it("toggle normalises like create but does NOT inherit its minimum — legacy short codes stay addressable", async () => {
    const { createDiscount, toggleDiscount } = await loadTools();
    // `min(3)` is a minting rule, not an addressing rule. A shop can already
    // hold a 1-2 character row (the pre-fix `create` minted one from `"  ab  "`),
    // and such a code IS redeemable — checkout only requires a truthy code
    // (lib/orders/create.ts:105-107). The old toggle reached it only via the
    // same padding trick; carrying `min(3)` onto the trimmed value would have
    // taken the trick away and left the row unreachable from the tool surface.
    for (const code of ["ab", "  ab  ", "a"]) {
      expect(toggleDiscount.input.parse({ code }).code, JSON.stringify(code)).toBe(
        code.trim().toUpperCase(),
      );
      expect(() =>
        createDiscount.input.parse({ code, type: "percent", value: 10 }),
        `create must still refuse ${JSON.stringify(code)}`,
      ).toThrow();
    }
    // An empty lookup key is refused. The bug could mint an empty row too, so
    // this deliberately drops that one row from the agent surface: it is inert
    // at checkout, and `/admin/rabatkoder` can still flip it by `id`.
    for (const code of ["", "   "]) {
      expect(() => toggleDiscount.input.parse({ code }), JSON.stringify(code)).toThrow();
    }
    // Where both accept, they must agree — the case-insensitive identity.
    for (const code of ["abc", "  save20  "]) {
      expect(toggleDiscount.input.parse({ code }).code).toBe(
        createDiscount.input.parse({ code, type: "percent", value: 10 }).code,
      );
    }
  });
});

describe("discounts.toggle — flip semantics and the id-keyed update", () => {
  it("flips the current status when `active` is omitted", async () => {
    const { toggleDiscount } = await loadTools();
    mocks.prisma.discountCode.findUnique.mockResolvedValue({
      id: "d6",
      code: "FLIPME",
      active: true,
    });
    mocks.prisma.discountCode.update.mockResolvedValue({ code: "FLIPME", active: false });

    const result = await toggleDiscount.handler(
      toggleDiscount.input.parse({ code: "FLIPME" }),
      ctx,
    );

    expect(mocks.prisma.discountCode.update).toHaveBeenCalledWith({
      where: { id: "d6" }, // keyed off the LOADED row, not the code
      data: { active: false },
      select: { code: true, active: true },
    });
    expect(result).toEqual({ code: "FLIPME", active: false });
  });

  it("honours an explicit `active` even when it matches the current state", async () => {
    const { toggleDiscount } = await loadTools();
    mocks.prisma.discountCode.findUnique.mockResolvedValue({
      id: "d7",
      code: "STAYON",
      active: false,
    });
    mocks.prisma.discountCode.update.mockResolvedValue({ code: "STAYON", active: false });

    await toggleDiscount.handler(
      toggleDiscount.input.parse({ code: "STAYON", active: false }),
      ctx,
    );

    // Explicit false must NOT be flipped to true by the `??` fallback.
    expect(mocks.prisma.discountCode.update.mock.calls.at(-1)?.[0].data).toEqual({
      active: false,
    });
  });

  it("reactivates a disabled code when `active: true` is passed", async () => {
    const { toggleDiscount } = await loadTools();
    mocks.prisma.discountCode.findUnique.mockResolvedValue({
      id: "d8",
      code: "COMEBACK",
      active: false,
    });
    mocks.prisma.discountCode.update.mockResolvedValue({ code: "COMEBACK", active: true });

    await toggleDiscount.handler(
      toggleDiscount.input.parse({ code: "COMEBACK", active: true }),
      ctx,
    );

    expect(mocks.prisma.discountCode.update.mock.calls.at(-1)?.[0].data).toEqual({
      active: true,
    });
  });

  it("throws on an unknown code and never reaches the update", async () => {
    const { toggleDiscount } = await loadTools();
    mocks.prisma.discountCode.findUnique.mockResolvedValue(null);

    await expect(
      toggleDiscount.handler(toggleDiscount.input.parse({ code: "GHOST" }), ctx),
    ).rejects.toThrow("Discount code not found: GHOST");

    expect(mocks.prisma.discountCode.update).not.toHaveBeenCalled();
  });
});

describe("discounts.toggle — audit contract", () => {
  it("captures the prior `active` flag via the before closure on success", async () => {
    const { toggleDiscount } = await loadTools();
    // Two distinct findUnique calls happen, in this order: the audit `before`
    // closure (narrow `select: { active }`) and then the handler's full-row
    // lookup. Model them separately so the select-projection is real, not an
    // artefact of one mock answering both.
    mocks.prisma.discountCode.findUnique
      .mockResolvedValueOnce({ active: true })
      .mockResolvedValueOnce({ id: "d9", code: "AUDITME", active: true });
    mocks.prisma.discountCode.update.mockResolvedValue({ code: "AUDITME", active: false });

    const args = toggleDiscount.input.parse({ code: "AUDITME" });
    await toggleDiscount.handler(args, ctx);

    expect(mocks.captured.meta).toMatchObject({
      actor: "apikey:k1",
      tool: "discounts.toggle",
      args,
      ip: "10.0.0.9",
      userAgent: "agent/1.0",
    });
    expect(mocks.captured.before).toEqual({ active: true });
    // The before-snapshot is a narrow select — it must not leak the whole row.
    expect(mocks.prisma.discountCode.findUnique.mock.calls[0][0]).toEqual({
      where: { code: "AUDITME" },
      select: { active: true },
    });
  });

  it("still audits (with a null before-snapshot) when the code does not exist", async () => {
    const { toggleDiscount } = await loadTools();
    mocks.prisma.discountCode.findUnique.mockResolvedValue(null);

    await expect(
      toggleDiscount.handler(toggleDiscount.input.parse({ code: "MISSING" }), ctx),
    ).rejects.toThrow();

    // A rejected toggle is an auditable event: meta threaded, before() resolved.
    expect(mocks.captured.meta).toMatchObject({
      actor: "apikey:k1",
      tool: "discounts.toggle",
    });
    expect(mocks.captured.before).toBeNull();
  });
});

describe("discounts.list — read-only projection", () => {
  it("lists everything by default, ordered by code, capped at the limit", async () => {
    const { listDiscounts } = await loadTools();
    mocks.prisma.discountCode.findMany.mockResolvedValue([]);

    await listDiscounts.handler(listDiscounts.input.parse({}), ctx);

    expect(mocks.prisma.discountCode.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { code: "asc" },
      take: 50, // schema default
    });
  });

  it("filters to active codes when onlyActive is set", async () => {
    const { listDiscounts } = await loadTools();
    mocks.prisma.discountCode.findMany.mockResolvedValue([]);

    await listDiscounts.handler(
      listDiscounts.input.parse({ onlyActive: true, limit: 5 }),
      ctx,
    );

    expect(mocks.prisma.discountCode.findMany.mock.calls.at(-1)?.[0]).toEqual({
      where: { active: true },
      orderBy: { code: "asc" },
      take: 5,
    });
  });

  it("never audits and rejects an out-of-range limit", async () => {
    const { listDiscounts } = await loadTools();
    mocks.prisma.discountCode.findMany.mockResolvedValue([]);

    await listDiscounts.handler(listDiscounts.input.parse({}), ctx);
    expect(mocks.withAudit).not.toHaveBeenCalled();
    expect(listDiscounts.skipAudit).toBe(true);

    expect(() => listDiscounts.input.parse({ limit: 0 })).toThrow();
    expect(() => listDiscounts.input.parse({ limit: 101 })).toThrow();
  });
});

describe("discounts — tool surface", () => {
  it("separates read and write scopes", async () => {
    const { listDiscounts, createDiscount, toggleDiscount } = await loadTools();
    expect(listDiscounts.scope).toBe("discounts:read");
    expect(createDiscount.scope).toBe("discounts:write");
    expect(toggleDiscount.scope).toBe("discounts:write");
    // Write tools must not opt out of auditing.
    expect(createDiscount.skipAudit).toBeFalsy();
    expect(toggleDiscount.skipAudit).toBeFalsy();
  });

  it("exports exactly the three registered tools", async () => {
    const { discountsTools } = await loadTools();
    expect(discountsTools.map((t) => t.name)).toEqual([
      "discounts.list",
      "discounts.create",
      "discounts.toggle",
    ]);
  });
});
