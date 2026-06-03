import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * CSV produkt-import/eksport (H3) — parser-edge-cases + import-logik. Mocket prisma.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    category: { findMany: vi.fn() },
    product: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function reset() {
  vi.resetModules();
  for (const m of Object.values(mocks.prisma)) for (const fn of Object.values(m)) fn.mockReset();
  mocks.prisma.auditLog.create.mockResolvedValue({});
  mocks.prisma.product.create.mockResolvedValue({});
  mocks.prisma.product.update.mockResolvedValue({});
}

describe("parseCsv", () => {
  beforeEach(reset);

  it("håndterer quotes, escaped quotes, komma + newline i quoted felt", async () => {
    const { parseCsv } = await import("@/lib/products-csv");
    const text = 'a,b\n"hej, du","linje1\nlinje2"\n"han sagde ""hej""",x';
    const rows = parseCsv(text);
    expect(rows[0]).toEqual({ a: "hej, du", b: "linje1\nlinje2" });
    expect(rows[1]).toEqual({ a: 'han sagde "hej"', b: "x" });
  });

  it("dropper tomme rækker", async () => {
    const { parseCsv } = await import("@/lib/products-csv");
    expect(parseCsv("a,b\nx,y\n\n")).toEqual([{ a: "x", b: "y" }]);
  });
});

describe("productsToCsv", () => {
  beforeEach(reset);
  it("konverterer øre→kroner + escaper", async () => {
    const { productsToCsv } = await import("@/lib/products-csv");
    const csv = productsToCsv([
      {
        slug: "kaffe",
        name: 'Bønner, "dark"',
        description: "lang nok beskrivelse",
        priceDkk: 12500,
        stock: 3,
        brand: null,
        featured: true,
        category: { slug: "kaffe-kat" },
        images: "[]",
        attributes: { roast: "dark" },
      },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("slug,name,description,priceKr");
    expect(lines[1]).toContain("125"); // 12500 øre → 125 kr
    expect(lines[1]).toContain('"Bønner, ""dark"""');
  });
});

describe("importProductsFromCsv", () => {
  beforeEach(reset);

  it("opretter, opdaterer og rapporterer fejl", async () => {
    mocks.prisma.category.findMany.mockResolvedValue([{ id: "c1", slug: "kaffe-kat" }]);
    // første slug findes (update), anden findes ikke (create)
    mocks.prisma.product.findUnique
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce(null);

    const csv = [
      "slug,name,description,priceKr,stock,brand,featured,categorySlug,images,attributes",
      "eksisterende,Navn et,beskrivelse lang nok,100,5,,true,kaffe-kat,,",
      "ny-vare,Navn to,beskrivelse lang nok,200,2,,false,kaffe-kat,,",
      "fejl-vare,Navn tre,beskrivelse lang nok,50,1,,false,ukendt-kat,,",
    ].join("\n");

    const { importProductsFromCsv } = await import("@/lib/products-csv");
    const r = await importProductsFromCsv(csv, "user:test");

    expect(r.updated).toBe(1);
    expect(r.created).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].error).toContain("ukendt categorySlug");
    // priceKr 200 → 20000 øre i create-data
    const createData = mocks.prisma.product.create.mock.calls[0][0].data;
    expect(createData.priceDkk).toBe(20000);
  });

  it("afviser ugyldig slug", async () => {
    mocks.prisma.category.findMany.mockResolvedValue([{ id: "c1", slug: "kat" }]);
    const csv = "slug,name,description,priceKr,categorySlug\nUgyldig Slug,Navn,beskrivelse lang nok,100,kat";
    const { importProductsFromCsv } = await import("@/lib/products-csv");
    const r = await importProductsFromCsv(csv, "user:test");
    expect(r.errors[0].error).toContain("slug");
    expect(r.created).toBe(0);
  });
});
