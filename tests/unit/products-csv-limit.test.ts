import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRODUCT-CSV-BODY-LIMIT. The product import is a Server Action that takes the
 * whole CSV as one string, and Next refuses an action body over 1 MB with a 413
 * before the action runs (next/dist/server/app-render/action-handler.js,
 * `defaultBodySizeLimit = '1 MB'`; measured on a Next 16.4.2 app: 0.9 MB went
 * through, 1.2 MB answered "Body exceeded 1 MB limit."). The owner got the error
 * page and nothing was saved. The limit is global, so it stays; the import now
 * refuses an oversized file itself and says how to split it. The form half is
 * pinned in product-import-form.test.tsx.
 */

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
  importProductsFromCsv: vi.fn(async () => ({ created: 1, updated: 0, errors: [] })),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/products-csv", () => ({ importProductsFromCsv: h.importProductsFromCsv }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));

const MB = 1024 * 1024;

beforeEach(() => {
  h.importProductsFromCsv.mockClear();
  h.revalidatePath.mockClear();
});

describe("csvImportBodyBytes", () => {
  it("measures the body React sends — the JSON text of the argument list, in UTF-8 bytes", async () => {
    const { csvImportBodyBytes } = await import("@/lib/products-csv-limit");
    // `["` + `"]` around the text.
    expect(csvImportBodyBytes("slug")).toBe(8);
    // A quote and a line break are escaped, so each takes two bytes on the wire.
    expect(csvImportBodyBytes('a"\n')).toBe(4 + 1 + 2 + 2);
    // Danish letters are two UTF-8 bytes each, not one.
    expect(csvImportBodyBytes("æøå")).toBe(4 + 6);
  });

  it("matches what React's encodeReply — the client side of a Server Action call — sends", async () => {
    const { csvImportBodyBytes } = await import("@/lib/products-csv-limit");
    // The copy Next bundles and calls for every action; a React that changes how it
    // encodes a string argument fails here instead of letting the guard miscount.
    // (The compiled copy ships no types; `as string` keeps tsc from resolving it.)
    const { encodeReply } = (await import(
      "next/dist/compiled/react-server-dom-webpack/client.edge" as string
    )) as { encodeReply: (value: unknown) => Promise<string | FormData> };
    const csv = 'slug,name\n"a, b","he said ""hi"""\r\næøå\n';
    const body = await encodeReply([csv]);
    expect(typeof body).toBe("string");
    expect(csvImportBodyBytes(csv)).toBe(Buffer.byteLength(body as string, "utf8"));
  });
});

describe("csvImportSizeError", () => {
  it("lets a body of exactly 1 MB through — Next refuses only what is larger", async () => {
    const { CSV_IMPORT_MAX_BYTES, csvImportSizeError } = await import("@/lib/products-csv-limit");
    expect(CSV_IMPORT_MAX_BYTES).toBe(MB);
    expect(csvImportSizeError(MB)).toBeNull();
    expect(csvImportSizeError(10)).toBeNull();
  });

  it("refuses one byte more, with the size and how to split the file", async () => {
    const { csvImportSizeError } = await import("@/lib/products-csv-limit");
    const message = csvImportSizeError(MB + 1);
    expect(message).toMatch(/at most 1 MB/);
    expect(message).toMatch(/Split it into smaller files that each start with the header row/);
    expect(message).toMatch(/Nothing was imported/);
    expect(csvImportSizeError(MB + 1)).toMatch(/^This CSV is 1\.01 MB as sent/);
    expect(csvImportSizeError(Math.round(1.2 * MB))).toMatch(/^This CSV is 1\.2 MB as sent/);
  });
});

describe("the limit mirrors Next's default", () => {
  it("next.config.ts does not set its own serverActions.bodySizeLimit", () => {
    // If someone raises the global limit, lib/products-csv-limit.ts must move with
    // it — otherwise the import keeps refusing files the server would now accept.
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).not.toMatch(/bodySizeLimit/);
  });
});

describe("importProductsAction", () => {
  it("returns a clear error for a CSV over the limit and imports nothing", async () => {
    const { importProductsAction } = await import("@/app/admin/produkter/import/actions");
    const csv = "slug,name\n" + "x".repeat(Math.round(1.1 * MB));
    const r = await importProductsAction(csv);
    expect(r).toEqual({ error: expect.stringMatching(/at most 1 MB/) });
    expect(h.importProductsFromCsv).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("still imports a CSV that fits", async () => {
    const { importProductsAction } = await import("@/app/admin/produkter/import/actions");
    const r = await importProductsAction("slug,name\nabc,Abc\n");
    expect(r).toEqual({ created: 1, updated: 0, errors: [] });
    expect(h.importProductsFromCsv).toHaveBeenCalledWith("slug,name\nabc,Abc\n", "user:admin-1");
    expect(h.revalidatePath).toHaveBeenCalledWith("/admin/produkter");
  });
});
