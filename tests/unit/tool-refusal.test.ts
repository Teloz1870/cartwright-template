import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TOOL-REFUSAL-4XX — a tool's deliberate business refusal (`ToolRefusal`,
 * lib/tools/refusal.ts) reaches REST and MCP callers as a 4xx with a stable
 * code and its own public message, while any OTHER throw stays a 500 whose
 * text never leaves the server.
 *
 * Runs the REAL registry dispatcher and the REAL discount/marketing handlers;
 * only the discount table and the audit wrapper are stubbed, so the assertion
 * is on what `invokeTool` + `invokeProblem` actually hand a caller.
 */

const mocks = vi.hoisted(() => ({
  discountCode: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    prisma: new Proxy(actual.prisma, {
      get: (target, key) =>
        key === "discountCode" ? mocks.discountCode : Reflect.get(target, key),
    }),
  };
});
vi.mock("@/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit")>()),
  withAudit: async (_meta: unknown, fn: () => Promise<unknown>) => fn(),
}));

const CTX = { actor: "system:test", requestId: "refusal-test" } as const;
const SCOPES = ["discounts:write", "marketing:write"] as const;
const INSTANCE = "/api/v1/tools/discounts.create";

function uniqueViolation(): Error {
  // What Prisma throws on the unique `code` column. Its text names the table
  // and constraint, which must never reach a caller.
  return Object.assign(
    new Error("Unique constraint failed on the fields: (`code`) libsql://shop-secret.turso.io"),
    { code: "P2002" },
  );
}

// The registry pulls in every tool module; load it once, outside the 5 s
// per-test budget, so a loaded machine cannot time the first test out.
beforeAll(async () => {
  await import("@/lib/tools/registry");
}, 60_000);

beforeEach(() => {
  for (const fn of Object.values(mocks.discountCode)) fn.mockReset();
});

describe("invokeTool — a ToolRefusal is a 4xx with its code", () => {
  it("discounts.create on a duplicate code → 409 discount_code_exists, public text only", async () => {
    mocks.discountCode.create.mockRejectedValue(uniqueViolation());
    const { invokeTool } = await import("@/lib/tools/registry");

    const r = await invokeTool(
      "discounts.create",
      { code: "summer20", type: "percent", value: 20 },
      CTX,
      [...SCOPES],
    );

    expect(r).toEqual({
      ok: false,
      status: 409,
      code: "discount_code_exists",
      error: expect.stringContaining("Discount code SUMMER20 already exists"),
    });
    expect(JSON.stringify(r)).not.toContain("turso.io");
  });

  it("discounts.toggle on an unknown code → 404 discount_not_found", async () => {
    mocks.discountCode.findUnique.mockResolvedValue(null);
    const { invokeTool } = await import("@/lib/tools/registry");

    const r = await invokeTool("discounts.toggle", { code: "nope" }, CTX, [...SCOPES]);

    expect(r).toEqual({
      ok: false,
      status: 404,
      code: "discount_not_found",
      error: "Discount code not found: NOPE",
    });
    expect(mocks.discountCode.update).not.toHaveBeenCalled();
  });

  it("marketing.create_campaign on a switched-off code → 409 discount_code_switched_off", async () => {
    mocks.discountCode.findUnique.mockResolvedValue({ active: false });
    const { invokeTool } = await import("@/lib/tools/registry");

    const r = await invokeTool(
      "marketing.create_campaign",
      {
        discountCode: "winter",
        discountType: "percent",
        discountValue: 10,
        announcement: "Winter sale is here",
      },
      CTX,
      [...SCOPES],
    );

    expect(r).toMatchObject({ ok: false, status: 409, code: "discount_code_switched_off" });
    if (r.ok) return;
    expect(r.error).toContain("Discount code WINTER exists and is switched off");
    expect(mocks.discountCode.upsert).not.toHaveBeenCalled();
  });

  // TOOL-REFUSAL-4XX-b: the code is echoed in a 409's detail, so it is bounded
  // (64 after trim) and a longer one is a 422 before any handler runs.
  it.each([
    ["discounts.create", { type: "percent", value: 20 }, "code"],
    ["marketing.create_campaign", { discountType: "percent", discountValue: 10, announcement: "Winter sale is here" }, "discountCode"],
  ])("%s refuses a code over 64 characters as 422, never echoing it", async (tool, rest, key) => {
    const { invokeTool } = await import("@/lib/tools/registry");
    const huge = "x".repeat(65);

    const r = await invokeTool(tool, { ...rest, [key]: huge }, CTX, [...SCOPES]);

    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(JSON.stringify(r)).not.toContain(huge.toUpperCase());
    expect(mocks.discountCode.findUnique).not.toHaveBeenCalled();
    expect(mocks.discountCode.create).not.toHaveBeenCalled();
    expect(mocks.discountCode.upsert).not.toHaveBeenCalled();
  });

  it("a plain Error stays a 500 without a code (the invariant the refusal relies on)", async () => {
    mocks.discountCode.create.mockRejectedValue(
      new Error("SQLITE_BUSY: database is locked at libsql://shop-secret.turso.io"),
    );
    const { invokeTool } = await import("@/lib/tools/registry");

    const r = await invokeTool(
      "discounts.create",
      { code: "summer20", type: "percent", value: 20 },
      CTX,
      [...SCOPES],
    );

    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(r).not.toHaveProperty("code");
  });
});

describe("invokeProblem — the REST shape of a refusal", () => {
  it("409 carries the refusal's code, title Conflict and its message as detail", async () => {
    const { invokeProblem } = await import("@/lib/api-problem");
    const message = "Discount code SUMMER20 already exists. Choose a new code.";

    const response = invokeProblem(
      { ok: false, status: 409, code: "discount_code_exists", error: message },
      INSTANCE,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(body).toMatchObject({
      type: "https://cartwright.app/problems/discount_code_exists",
      title: "Conflict",
      status: 409,
      code: "discount_code_exists",
      detail: message,
      error: message,
      instance: INSTANCE,
      ok: false,
    });
    expect(body.resolution).toMatch(/retrying it unchanged/);
  });

  it("a 404 refusal keeps its own code; a bare 404 keeps the generic one", async () => {
    const { invokeProblem } = await import("@/lib/api-problem");

    const refused = await invokeProblem(
      { ok: false, status: 404, code: "discount_not_found", error: "Discount code not found: NOPE" },
      INSTANCE,
    ).json();
    const bare = await invokeProblem(
      { ok: false, status: 404, error: "Tool not found: x.y" },
      INSTANCE,
    ).json();

    expect(refused.code).toBe("discount_not_found");
    expect(refused.detail).toBe("Discount code not found: NOPE");
    expect(bare.code).toBe("tool_or_resource_not_found");
  });

  it("end to end: a duplicate is a 409 problem, a plain failure a generic 500", async () => {
    const { invokeTool } = await import("@/lib/tools/registry");
    const { invokeProblem } = await import("@/lib/api-problem");
    const args = { code: "summer20", type: "percent", value: 20 };

    mocks.discountCode.create.mockRejectedValueOnce(uniqueViolation());
    const refused = await invokeTool("discounts.create", args, CTX, [...SCOPES]);
    if (refused.ok) throw new Error("expected a refusal");
    const refusedBody = await invokeProblem(refused, INSTANCE).json();

    mocks.discountCode.create.mockRejectedValueOnce(new Error("db password hunter2 rejected"));
    const failed = await invokeTool("discounts.create", args, CTX, [...SCOPES]);
    if (failed.ok) throw new Error("expected a failure");
    const failedBody = await invokeProblem(failed, INSTANCE).json();

    expect(refusedBody.status).toBe(409);
    expect(refusedBody.code).toBe("discount_code_exists");
    expect(failedBody.status).toBe(500);
    expect(failedBody.code).toBe("tool_execution_failed");
    expect(failedBody.detail).toBe(
      "The tool could not complete because of an internal service error.",
    );
    expect(JSON.stringify(failedBody)).not.toContain("hunter2");
  });
});

describe("ToolRefusal", () => {
  it("is an Error, defaults to 409 and refuses a code that is not snake_case", async () => {
    const { ToolRefusal } = await import("@/lib/tools/refusal");
    const refusal = new ToolRefusal("discount_code_exists", "taken");

    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.status).toBe(409);
    expect(() => new ToolRefusal("Bad Code", "x")).toThrow(TypeError);
  });
});
