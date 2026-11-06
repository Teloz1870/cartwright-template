/**
 * ARG5 — the homepage hands every design its featured products with
 * `imageUrl` set to the product's first image.
 *
 * `DesignProduct.imageUrl` is what the blank-canvas guide tells a builder to
 * render, and what atelier, northern-coffee, webshop-bold, webshop-editorial
 * and webshop-minimal read for their product photos. Nothing set it: the route
 * passed the raw `findMany` rows, so every one of those cards rendered without
 * a photo. The route is driven for real here and the returned element tree is
 * read for the `featured` prop the design component receives — the value comes
 * from the engine's own media resolver (`resolveProductImageUrls`), unmocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";

const mocks = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  const DesignHome = () => null;
  return {
    rows,
    DesignHome,
    // Like the database for `status`: a row without one holds the column
    // default ("active"), and a where that names a status keeps only those.
    findMany: vi.fn(async (q?: { where?: { status?: string } }) =>
      rows
        .filter((r) => q?.where?.status === undefined || (r.status ?? "active") === q.where.status)
        .map((r) => ({ ...r })),
    ),
  };
});

vi.mock("@/lib/db", () => ({ prisma: { product: { findMany: mocks.findMany } } }));
vi.mock("@/lib/data-source/nav", () => ({
  fetchHomeCategories: async () => [],
  fetchHomePage: async () => null,
}));
vi.mock("@/lib/data-source/brand", () => ({ fetchBrandingSettings: async () => null }));
vi.mock("@/designs", () => ({ getDesign: () => ({ homepage: mocks.DesignHome }) }));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({ storeName: "Shop", url: "https://shop.example", metadata: { description: "" } }),
  getFeatures: async () => ({ genomeResolve: false, threeD: false, mcpPublic: false }),
  resolveStoreIdentity: () => ({ ecommerceEnabled: true, designSlug: "webshop-minimal" }),
}));
vi.mock("@/lib/three/resolve", () => ({ getActiveThreeDConfig: async () => ({ scene: "orb", intensity: 0 }) }));
vi.mock("@/lib/annotate/server", () => ({ isAnnotateEditEnabled: async () => false }));
vi.mock("@/lib/first-run", () => ({ shouldShowWelcomeCanvas: async () => false }));
vi.mock("@/components/first-run/WelcomeCanvas", () => ({ default: () => null }));
vi.mock("@/lib/genome/read", () => ({ readField: async () => undefined }));
vi.mock("@/lib/homepage-metadata", () => ({ buildHomepageMetadata: async () => ({}) }));
vi.mock("@/lib/storefront-jsonld", () => ({ buildWebsiteJsonLd: () => ({}) }));

const page = await import("@/app/[locale]/page");

type El = { type: unknown; props: Record<string, unknown> };

function elements(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, out);
  } else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    out.push(el);
    elements(el.props.children, out);
  }
  return out;
}

async function featuredHandedToDesign(): Promise<Array<Record<string, unknown>>> {
  const tree = elements(await page.default({ params: Promise.resolve({ locale: brand.defaultLocale }) }));
  const design = tree.find((el) => el.type === mocks.DesignHome);
  if (!design) throw new Error("the homepage did not render the active design");
  return design.props.featured as Array<Record<string, unknown>>;
}

const product = (id: string, images: string) => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  priceDkk: 100_00,
  images,
  featured: true,
  translations: null,
});

beforeEach(() => {
  mocks.rows.splice(0);
  mocks.findMany.mockClear();
});

describe("ARG5 — homepage featured products carry imageUrl", () => {
  it("sets imageUrl to the product's first image", async () => {
    mocks.rows.push(product("a", JSON.stringify(["/img/a-front.jpg", "/img/a-side.jpg"])));

    const [first] = await featuredHandedToDesign();

    expect(first.imageUrl).toBe("/img/a-front.jpg");
  });

  it("sets imageUrl to null when the product has no usable image", async () => {
    mocks.rows.push(product("empty", "[]"), product("broken", "not json"));

    const featured = await featuredHandedToDesign();

    expect(featured.map((p) => p.imageUrl)).toEqual([null, null]);
  });

  it("keeps the row's other fields and runs the same query as before", async () => {
    mocks.rows.push(product("a", JSON.stringify(["/img/a.jpg"])));

    const [first] = await featuredHandedToDesign();

    expect(first).toMatchObject(product("a", JSON.stringify(["/img/a.jpg"])));
    // No join added: ProductMedia rows are not fetched, so the first image comes
    // from the `images` column — the same source ProductCard resolves from,
    // since no storefront query fetches ProductMedia either.
    // STOREFRONT-DRAFT-FILTER: a draft is not featured on the homepage either.
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { featured: true, status: "active", deletedAt: null },
      take: 4,
    });
  });

  // Schema batch B, owner decision B92: saas-dark and corporate-baseline are client
  // components, so a prop they get is serialised into the page's HTML, read or not.
  it("does not hand the design schema batch B's columns: the public page stays as it was", async () => {
    mocks.rows.push({ ...product("a", "[]"), compareAtDkk: 12900, shippingClass: "pallet", stockPolicy: "backorder" });

    const [first] = await featuredHandedToDesign();

    expect(first).toMatchObject({ id: "a", imageUrl: null });
    for (const column of ["compareAtDkk", "shippingClass", "stockPolicy"]) expect(first).not.toHaveProperty(column);
  });

  it("does not hand the design a featured draft (STOREFRONT-DRAFT-FILTER)", async () => {
    mocks.rows.push(product("live", "[]"), { ...product("draft", "[]"), status: "draft" });

    expect((await featuredHandedToDesign()).map((p) => p.id)).toEqual(["live"]);
  });
});
