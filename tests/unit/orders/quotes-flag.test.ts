/**
 * TIL1-a — what the `quotes` flag publishes. The orders.* tool schemas are frozen
 * at module load (B22 = b), so each state of the flag is a fresh import under a
 * config that says so. Off, the catalogue, OpenAPI and what MCP is handed say what
 * they said before the flag: the 12, in their order. On, the only change to those
 * tools is the quote in the enum and a sentence in one description.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    orderNote: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({
  withAudit: (_meta: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({ url: "https://shop.example.test", storeName: "Shop", features: {} }),
}));

const THE_12 = [
  "pending_payment",
  "pending",
  "paid",
  "flagged_review",
  "shipped",
  "cancelled",
  "refunded",
  "partial_refund",
  "disputed",
  "processing",
  "delivered",
  "completed",
];

// The tool's wording before the flag, up to where the flag's sentence goes.
const VALID_STATUSES =
  "Valid statuses: pending_payment, pending, paid, processing, shipped, delivered, completed, cancelled, refunded, partial_refund, flagged_review, disputed";

const ORDER_TOOLS = ["orders.list", "orders.get", "orders.update_status"];

type Manifest = { name: string; description: string; inputJsonSchema: unknown; outputJsonSchema: unknown }[];
type Schema = { properties: { status: { enum: string[] } } };

const CTX = { actor: "apikey:k1", requestId: "r1" } as never;

async function load(quotes: boolean) {
  vi.resetModules();
  vi.doMock("@/brand.config", async () => {
    const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
    return { ...actual, brand: { ...actual.brand, features: { ...actual.brand.features, quotes } } };
  });
  const registry = await import("@/lib/tools/registry");
  const { buildOpenApiDocument } = await import("@/lib/openapi");
  const manifest = registry.buildToolManifest() as unknown as Manifest;
  const entry = (name: string) => {
    const found = manifest.find((t) => t.name === name);
    if (!found) throw new Error(`no tool ${name}`);
    return found;
  };
  return { ...registry, buildOpenApiDocument, manifest, entry };
}

const inputEnum = (entry: Manifest[number]) => (entry.inputJsonSchema as Schema).properties.status.enum;
const outputEnum = (entry: Manifest[number]) => (entry.outputJsonSchema as Schema).properties.status.enum;

/** Every enum in a JSON document that holds one of the order statuses. */
function statusEnums(node: unknown, found: string[][] = []): string[][] {
  if (Array.isArray(node)) {
    for (const child of node) statusEnums(child, found);
  } else if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) {
      if (key === "enum" && Array.isArray(child) && child.includes("partial_refund")) found.push(child as string[]);
      else statusEnums(child, found);
    }
  }
  return found;
}

beforeEach(() => {
  mocks.prisma.order.findMany.mockReset().mockResolvedValue([]);
  mocks.prisma.order.findUnique.mockReset();
  mocks.prisma.order.updateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.prisma.orderNote.create.mockReset().mockResolvedValue({ id: "n1" });
  mocks.prisma.$transaction
    .mockReset()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

afterEach(() => {
  vi.doUnmock("@/brand.config");
  vi.resetModules();
});

// Each load re-imports the tool registry, which can outlast 5 s on a busy machine.
vi.setConfig({ testTimeout: 60_000 });

describe("flag off: what is published is what was published", () => {
  it("the catalogue's status enums are the 12, in their order", async () => {
    const { entry } = await load(false);
    expect(inputEnum(entry("orders.list"))).toEqual(THE_12);
    expect(inputEnum(entry("orders.update_status"))).toEqual(THE_12);
    expect(outputEnum(entry("orders.update_status"))).toEqual(THE_12);
  });

  it("the tool's description lists the 12 and goes straight on, as it did", async () => {
    const { entry } = await load(false);
    expect(entry("orders.update_status").description).toContain(`${VALID_STATUSES}. The move must be a legal transition`);
  });

  it("the word appears nowhere in the three order tools", async () => {
    const { entry } = await load(false);
    for (const name of ORDER_TOOLS) expect(JSON.stringify(entry(name)), name).not.toMatch(/quote/i);
  });

  it("no status enum anywhere in the catalogue or OpenAPI holds it", async () => {
    const { manifest, buildOpenApiDocument } = await load(false);
    const inManifest = statusEnums(manifest);
    const inOpenApi = statusEnums(await buildOpenApiDocument());
    expect(inManifest.length).toBeGreaterThanOrEqual(3);
    expect(inOpenApi.length).toBeGreaterThanOrEqual(3);
    for (const values of [...inManifest, ...inOpenApi]) expect(values).toEqual(THE_12);
  });

  it("the flag's one trace in the catalogue is its name in features.get's list of flags, as with any flag", async () => {
    const { manifest } = await load(false);
    expect(manifest.filter((t) => JSON.stringify(t).includes('"quotes"')).map((t) => t.name)).toEqual(["features.get"]);
  });

  it("what MCP is handed refuses it: `tool.input`, the schema it registers", async () => {
    const { getTool } = await load(false);
    expect(getTool("orders.list")?.input.safeParse({ status: "quote" }).success).toBe(false);
    expect(getTool("orders.update_status")?.input.safeParse({ orderId: "o1", status: "quote" }).success).toBe(false);
    for (const status of THE_12) {
      expect(getTool("orders.list")?.input.safeParse({ status }).success, status).toBe(true);
    }
  });

  it("over REST it is a 422, before anything is read", async () => {
    const { invokeTool } = await load(false);
    await expect(invokeTool("orders.list", { status: "quote" }, CTX, ["orders:read"])).resolves.toMatchObject({ ok: false, status: 422 });
    await expect(invokeTool("orders.update_status", { orderId: "o1", status: "quote" }, CTX, ["orders:write"])).resolves.toMatchObject({ ok: false, status: 422 });
    expect(mocks.prisma.order.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.order.findUnique).not.toHaveBeenCalled();
  });
});

describe("flag on: the enum includes the quote", () => {
  it("everywhere it is the 12 and the quote behind them", async () => {
    const { entry, manifest, buildOpenApiDocument } = await load(true);
    const THE_13 = [...THE_12, "quote"];
    expect(inputEnum(entry("orders.list"))).toEqual(THE_13);
    expect(inputEnum(entry("orders.update_status"))).toEqual(THE_13);
    expect(outputEnum(entry("orders.update_status"))).toEqual(THE_13);
    for (const values of [...statusEnums(manifest), ...statusEnums(await buildOpenApiDocument())]) expect(values).toEqual(THE_13);
  });

  it("the description says what a quote can do, right after the list", async () => {
    const { entry } = await load(true);
    expect(entry("orders.update_status").description).toContain(
      `${VALID_STATUSES}, quote. A quote is no order yet: it moves to pending_payment or cancelled, and no move leads into one. The move must be a legal transition`,
    );
  });

  it("that is all that changes: with the quote taken back out, the three tools are the flag-off tools", async () => {
    const off = await load(false);
    const offEntries = ORDER_TOOLS.map(off.entry);
    const on = await load(true);
    const withoutQuote = (key: string, value: unknown) =>
      key === "enum" && Array.isArray(value) ? value.filter((v) => v !== "quote") : value;

    for (const [i, name] of ORDER_TOOLS.entries()) {
      const entry = JSON.parse(JSON.stringify(on.entry(name), withoutQuote)) as Manifest[number];
      entry.description = entry.description.replace(/, quote\. A quote is no order yet: [^.]*\./, ".");
      expect(entry, name).toEqual(JSON.parse(JSON.stringify(offEntries[i])));
    }
  });

  it("what MCP is handed takes it, and orders.list really filters on it", async () => {
    const { getTool, invokeTool } = await load(true);
    expect(getTool("orders.list")?.input.safeParse({ status: "quote" }).success).toBe(true);
    expect(getTool("orders.update_status")?.input.safeParse({ orderId: "o1", status: "quote" }).success).toBe(true);

    await expect(invokeTool("orders.list", { status: "quote" }, CTX, ["orders:read"])).resolves.toEqual({ ok: true, result: [] });
    expect(mocks.prisma.order.findMany.mock.calls[0][0].where).toEqual({ status: "quote" });
  });

  it("a move into one is still refused, from a known status and from a legacy string alike", async () => {
    const { invokeTool } = await load(true);
    for (const [from, message] of [
      ["paid", /Illegal order transition: paid → quote/],
      ["legacy_weird", /Illegal order transition: legacy_weird → quote/],
    ] as const) {
      mocks.prisma.order.findUnique.mockResolvedValue({ status: from, totalDkk: 100, stripePaymentIntentId: null });
      const result = await invokeTool("orders.update_status", { orderId: "o1", status: "quote" }, CTX, ["orders:write"]);
      expect(result, from).toMatchObject({ ok: false, error: expect.stringMatching(message) });
    }
    expect(mocks.prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("a move out of one goes through", async () => {
    const { invokeTool } = await load(true);
    mocks.prisma.order.findUnique.mockResolvedValue({ status: "quote", totalDkk: 100, stripePaymentIntentId: null });
    await expect(invokeTool("orders.update_status", { orderId: "o1", status: "pending_payment" }, CTX, ["orders:write"])).resolves.toEqual({
      ok: true,
      result: { id: "o1", status: "pending_payment" },
    });
    expect(mocks.prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", status: "quote" },
      data: { status: "pending_payment" },
    });
  });
});

describe("the flag itself", () => {
  const descriptor = async () => {
    vi.resetModules();
    const { FEATURE_MANIFEST, RUNTIME_TOGGLEABLE_KEYS } = await import("@/lib/feature-flags/manifest");
    const found = FEATURE_MANIFEST.find((f) => f.key === "quotes");
    if (!found) throw new Error("no quotes flag");
    return { found, RUNTIME_TOGGLEABLE_KEYS, FEATURE_MANIFEST };
  };

  it("is off by default, on this engine and in what it ships", async () => {
    const { brand } = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
    expect(brand.features.quotes).toBe(false);
  });

  it("is compile-time, as the frozen schemas need, so a row in the database cannot flip it", async () => {
    const { found, RUNTIME_TOGGLEABLE_KEYS } = await descriptor();
    expect(found.tier).toBe("compile-time");
    expect(found.runtimeToggleable).toBe(false);
    expect(found.requiresRedeployNote).toBeTruthy();
    expect(found.precondition).toEqual({ kind: "ecommerce" });
    expect(RUNTIME_TOGGLEABLE_KEYS.has("quotes")).toBe(false);

    const { mergeFeatureOverrides } = await import("@/lib/feature-flags/resolve");
    expect(mergeFeatureOverrides({ quotes: false }, JSON.stringify({ quotes: true })).quotes).toBe(false);
  });

  it("claims nothing while nothing can create a quote: not on /built-with-cartwright, not in llms.txt", async () => {
    const { found, FEATURE_MANIFEST } = await descriptor();
    expect(found.implemented).toBe(false);
    expect(found.description).toMatch(/Nothing creates a quote yet/);
    // Both surfaces filter on `implemented`, and the first of them lists flags that are off too.
    expect(FEATURE_MANIFEST.filter((f) => f.implemented).map((f) => f.key)).not.toContain("quotes");
  });
});
