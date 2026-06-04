export type CatalogParams = {
  q?: string;
  kategori?: string;
  stelfarve?: string;
  glasfarve?: string;
  brand?: string;
  minPris?: string;
  maxPris?: string;
  sort?: string;
};

export type ProductQuery = {
  where: Record<string, unknown>;
  orderBy: Record<string, "asc" | "desc">;
};

function parseKroner(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

/** Oversætter URL-søgeparametre til et Prisma where/orderBy-objekt for produkter. */
export function buildProductQuery(params: CatalogParams): ProductQuery {
  const where: Record<string, unknown> = {};

  if (params.q && params.q.trim() !== "") {
    const term = params.q.trim();
    where.OR = [
      { name: { contains: term } },
      { brand: { contains: term } },
    ];
  }
  if (params.kategori) where.category = { slug: params.kategori };
  if (params.stelfarve) where.frameColor = params.stelfarve;
  if (params.glasfarve) where.lensColor = params.glasfarve;
  if (params.brand) where.brand = params.brand;

  const min = parseKroner(params.minPris);
  const max = parseKroner(params.maxPris);
  if (min !== undefined || max !== undefined) {
    const price: Record<string, number> = {};
    if (min !== undefined) price.gte = min;
    if (max !== undefined) price.lte = max;
    where.priceDkk = price;
  }

  let orderBy: Record<string, "asc" | "desc">;
  switch (params.sort) {
    case "pris-op":
      orderBy = { priceDkk: "asc" };
      break;
    case "pris-ned":
      orderBy = { priceDkk: "desc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  return { where, orderBy };
}
