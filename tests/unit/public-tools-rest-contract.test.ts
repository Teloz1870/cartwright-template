import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { PUBLIC_AGENT_TOOL_NAMES, type PublicAgentToolName } from "@/lib/tools/public";
import { publicAgentPerIpLimiter } from "@/lib/public-agent-rate-limit";
import { getTool } from "@/lib/tools/registry";

/**
 * TREND13-a — what the anonymous public tools put on the wire over REST.
 *
 * Each handler builds its answer by hand today. Nothing stops the next edit
 * from returning the Prisma row instead (`return products`, `{ ...page }`,
 * `include: { category: true }`): `invokeTool` hands the handler's value to
 * the route untouched, and the route serialises it without consulting the
 * tool's output schema. So the answer is pinned HERE, at the serialised body,
 * against an allowlist of key paths written out by hand — not derived from the
 * handler or its Zod schema, which an edit would change in the same commit.
 *
 * The database is a small fake that keeps Prisma's shape rules (a `select`
 * returns what it names; an `include` returns every column plus the included
 * relations, pruned by any nested `select`). Its rows carry EVERY column the
 * generated client knows — read from its scalar-field enums, so a new column
 * joins the fixture by itself — plus columns that do not exist yet and
 * relation data. Every value a public answer must not carry starts with
 * `LEAK:`, so a leak through an allowed key fails too, not only a new key.
 *
 * Changing a public tool's answer on purpose means changing its allowlist
 * below in the same PR: that is the review the test exists to force.
 */

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Query = { where?: Row; select?: Row; include?: Row; skip?: number; take?: number };

  /** Keys that are relations (or `_count`) rather than columns in the fixtures. */
  const RELATIONS = new Set([
    "category", "supplier", "reviews", "products", "parent", "heroImageAsset", "_count",
  ]);
  const rows: Record<string, Row[]> = { product: [], category: [], page: [] };

  function project(value: unknown, spec: unknown): unknown {
    const query = (spec === true ? {} : spec) as Query;
    if (Array.isArray(value)) return value.map((item) => project(item, query));
    if (value === null || typeof value !== "object" || value instanceof Date) return value;
    return shape(value as Row, query);
  }

  function shape(row: Row, query: Query): Row {
    const out: Row = {};
    if (query.select) {
      for (const [key, spec] of Object.entries(query.select)) {
        if (!spec) continue;
        if (!Object.hasOwn(row, key)) throw new Error(`fake prisma: no field "${key}" to select`);
        out[key] = RELATIONS.has(key) ? project(row[key], spec) : row[key];
      }
      return out;
    }
    for (const [key, value] of Object.entries(row)) if (!RELATIONS.has(key)) out[key] = value;
    for (const [key, spec] of Object.entries(query.include ?? {})) {
      if (spec) out[key] = project(row[key], spec);
    }
    return out;
  }

  function matching(model: string, where: Row = {}): Row[] {
    return rows[model].filter((row) =>
      Object.entries(where).every(([key, wanted]) => {
        if (wanted !== null && typeof wanted === "object") {
          throw new Error(`fake prisma: where.${key} operators are not modelled`);
        }
        return row[key] === wanted;
      }),
    );
  }

  const model = (name: string) => ({
    findMany: async (query: Query = {}) => {
      const skip = query.skip ?? 0;
      const end = query.take === undefined ? undefined : skip + query.take;
      return matching(name, query.where).slice(skip, end).map((row) => shape(row, query));
    },
    findFirst: async (query: Query = {}) => {
      const hit = matching(name, query.where)[0];
      return hit ? shape(hit, query) : null;
    },
  });

  // Anything else the code reaches for fails loudly instead of answering.
  const refuse = (what: string) => () =>
    Promise.reject(new Error(`fake prisma: ${what} is not modelled by this contract test`));
  const prisma = new Proxy({} as Row, {
    get(_target, key) {
      if (typeof key !== "string" || key === "then") return undefined;
      if (Object.hasOwn(rows, key)) return model(key);
      if (key.startsWith("$")) return refuse(key);
      return new Proxy({} as Row, {
        get: (_m, op) => (typeof op === "string" ? refuse(`${key}.${op}`) : undefined),
      });
    },
  });
  return { rows, prisma, findFirst: (name: string, query: Query) => model(name).findFirst(query) };
});

vi.mock("@/lib/db", () => ({ prisma: db.prisma, isPostgresDriver: () => false }));
vi.mock("@/lib/brand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brand")>();
  const { brand } = await import("@/brand.config");
  return {
    ...actual,
    getFeatureGateState: async () => ({
      available: true,
      features: { ...brand.features, mcpPublic: true },
    }),
  };
});

type Row = Record<string, unknown>;

/** Every column the generated client knows, each holding a `LEAK:` sentinel,
 *  overlaid with the values a public answer may legitimately carry. `extra`
 *  holds what is not a column today: tomorrow's columns and relation data. */
function fullRow(model: string, columns: Record<string, string>, real: Row, extra: Row): Row {
  const known = new Set(Object.values(columns));
  const row: Row = {};
  for (const column of known) row[column] = `LEAK:${model}.${column}`;
  for (const key of Object.keys(real)) {
    if (!known.has(key)) throw new Error(`fixture: ${model} has no column "${key}"`);
  }
  for (const key of Object.keys(extra)) {
    if (known.has(key)) throw new Error(`fixture: ${model}.${key} is a real column, not an extra`);
  }
  return { ...row, ...real, ...extra };
}

const category = fullRow(
  "Category",
  Prisma.CategoryScalarFieldEnum,
  { id: "cat_1", slug: "sunglasses", name: "Sunglasses", description: "Shades for bright days." },
  {
    internalNote: "LEAK:Category.internalNote",
    marginTarget: "LEAK:Category.marginTarget",
    products: [{ id: "LEAK:Category.products[].id" }],
    parent: { id: "LEAK:Category.parent.id", name: "LEAK:Category.parent.name" },
    _count: { products: 1, productLinks: 9, children: 0 },
  },
);

const product = fullRow(
  "Product",
  Prisma.ProductScalarFieldEnum,
  {
    id: "prod_1",
    slug: "aviator-gold",
    name: "Aviator Gold",
    brand: "Northwind",
    description: "A gold-framed aviator with green lenses.",
    priceDkk: 129900,
    stock: 4,
    featured: true,
    frameColor: "gold",
    lensColor: "green",
    images: JSON.stringify(["https://cdn.example/aviator.jpg"]),
    status: "active",
    deletedAt: null,
    createdAt: new Date("2026-10-01T09:00:00.000Z"),
  },
  {
    costPrice: "LEAK:Product.costPrice",
    internalNote: "LEAK:Product.internalNote",
    supplierSku: "LEAK:Product.supplierSku",
    category,
    supplier: { id: "LEAK:Supplier.id", email: "LEAK:Supplier.email" },
    reviews: [{ id: "LEAK:ProductReview.id", authorEmail: "LEAK:ProductReview.authorEmail" }],
  },
);

const page = fullRow(
  "Page",
  Prisma.PageScalarFieldEnum,
  {
    slug: "brewing",
    title: "How we brew",
    body: "Our method.",
    bodyFormat: "markdown",
    heroImage: "https://cdn.example/brew.jpg",
    metaTitle: "Brewing notes",
    metaDescription: "Notes from the bar.",
    status: "published",
    updatedAt: new Date("2026-10-02T09:00:00.000Z"),
  },
  {
    internalNote: "LEAK:Page.internalNote",
    authorEmail: "LEAK:Page.authorEmail",
    heroImageAsset: { url: "LEAK:MediaAsset.url" },
  },
);

/** Rows a public read must never reach; the sentinel check catches them too. */
const deletedProduct = { ...product, id: "LEAK:deleted.id", slug: "leak-deleted", name: "LEAK:deleted", deletedAt: new Date(0) };
const draftProduct = { ...product, id: "LEAK:draft.id", slug: "leak-draft-product", name: "LEAK:draft", status: "draft" };
const draftPage = { ...page, slug: "leak-draft", title: "LEAK:draft", status: "draft" };

const PAGE_DTO = [
  "ok", "result", "result.slug", "result.title", "result.body", "result.bodyFormat",
  "result.heroImage", "result.metaTitle", "result.metaDescription", "result.updatedAt",
];

/** The allowlist: every key path each answer may contain. Written out by hand on purpose. */
const CONTRACT: Record<PublicAgentToolName, Array<{ label: string; args: Row; paths: string[] }>> = {
  "products.search": [{
    label: "products.search",
    args: {},
    paths: [
      "ok", "result", "result[].id", "result[].slug", "result[].name", "result[].brand",
      "result[].priceDkk", "result[].stock", "result[].featured", "result[].frameColor",
      "result[].lensColor", "result[].categorySlug", "result[].categoryName", "result[].firstImage",
    ],
  }],
  "products.get": [{
    label: "products.get",
    args: { slug: "aviator-gold" },
    paths: [
      "ok", "result", "result.id", "result.slug", "result.name", "result.brand",
      "result.description", "result.priceDkk", "result.stock", "result.featured",
      "result.frameColor", "result.lensColor", "result.images", "result.category",
      "result.category.slug", "result.category.name", "result.category.description",
      "result.createdAt",
    ],
  }],
  "categories.list": [{
    label: "categories.list",
    args: {},
    paths: [
      "ok", "result", "result[].id", "result[].slug", "result[].name",
      "result[].description", "result[].productCount",
    ],
  }],
  "site.list_pages": [{
    label: "site.list_pages",
    args: {},
    paths: [
      "ok", "result", "result[].slug", "result[].title", "result[].metaDescription",
      "result[].updatedAt", "result[].url",
    ],
  }],
  "site.get_page": [
    { label: "site.get_page (a CMS page)", args: { slug: "brewing" }, paths: PAGE_DTO },
    { label: "site.get_page (the synthesised legal text)", args: { slug: "privacy" }, paths: PAGE_DTO },
    { label: "site.get_page (not found)", args: { slug: "no-such-page" }, paths: ["ok", "result", "result.found", "result.slug"] },
  ],
};

const CASES = (Object.entries(CONTRACT) as Array<[PublicAgentToolName, (typeof CONTRACT)[PublicAgentToolName]]>)
  .flatMap(([tool, cases]) => cases.map((c) => ({ tool, ...c })));

/** Every key path in a JSON value; array elements share one `[]` segment. */
function keyPaths(value: unknown, at = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => keyPaths(item, `${at}[]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = at ? `${at}.${key}` : key;
    return [path, ...keyPaths(child, path)];
  });
}

async function callAnonymously(tool: string, args: Row) {
  const { POST } = await import("@/app/api/v1/tools/[name]/route");
  const res = await POST(
    new NextRequest(`http://localhost:3000/api/v1/tools/${tool}`, {
      method: "POST",
      body: JSON.stringify(args),
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" },
    }),
    { params: Promise.resolve({ name: tool }) },
  );
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as { ok: boolean; result?: unknown } };
}

describe("public tools over REST answer with their allowlist and nothing more", () => {
  beforeEach(() => {
    publicAgentPerIpLimiter.reset();
    db.rows.product = [product, deletedProduct, draftProduct];
    db.rows.category = [category];
    db.rows.page = [page, draftPage];
  });

  it("has a contract for exactly the anonymous tool set", () => {
    expect(Object.keys(CONTRACT).sort()).toEqual([...PUBLIC_AGENT_TOOL_NAMES].sort());
  });

  /** Guards the guard: a fake that pruned the row itself would make every case below vacuous. */
  it("hands each handler every column, tomorrow's included, the way Prisma would", async () => {
    const included = (await db.findFirst("product", {
      where: { slug: "aviator-gold" },
      include: { category: { select: { slug: true } } },
    })) as Row;
    expect(included).toMatchObject({ sku: "LEAK:Product.sku", costPrice: "LEAK:Product.costPrice" });
    // A column the engine reads itself (BOM2-b3), never one it answers with (owner decision B92).
    expect(included).toMatchObject({ stockPolicy: "LEAK:Product.stockPolicy" });
    expect(included.category).toEqual({ slug: "sunglasses" });
    expect(included).not.toHaveProperty("supplier");

    const widened = (await db.findFirst("product", { include: { category: true } })) as { category: Row };
    expect(widened.category).toMatchObject({ internalNote: "LEAK:Category.internalNote" });
    expect(widened.category).not.toHaveProperty("parent");
  });

  it.each(CASES)("$label answers with only its allowlisted paths", async ({ tool, args, paths }) => {
    const { status, text, body } = await callAnonymously(tool, args);

    expect(status, text).toBe(200);
    expect(body.ok, text).toBe(true);
    expect([...new Set(keyPaths(body))].sort()).toEqual([...paths].sort());
    expect(text).not.toContain("LEAK:");
    // The declared (strict) output schema accepts what REST actually sent.
    expect(getTool(tool)?.output?.safeParse(body.result).success).toBe(true);
  });
});
