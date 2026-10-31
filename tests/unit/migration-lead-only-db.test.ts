import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";

/**
 * MIGD-4b — seo.product-jsonld's lead-only lookup against a real database: the
 * real Prisma client over libSQL on the migration baseline's schema, so the
 * `attributes` JSON column is read the way a run reads it, not as a fake hands
 * it over. Only a marked, live product at a frozen path is lead-only.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const db = vi.hoisted(() => ({ client: null as unknown as object }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_target, key) => Reflect.get(db.client, key) }),
}));

const { leadOnlyPaths } = await import("@/lib/tools/migration-woo");

let dir = "";
let prisma: PrismaClient;

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-lead-only-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"));
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  db.client = prisma;
  await prisma.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  const product = (id: string, permalink: string | null, attributes: object | undefined, deletedAt: Date | null = null) =>
    ({ id, slug: id, name: id, description: "", priceDkk: 100, images: "[]", categoryId: "cat", permalink, attributes, deletedAt });
  await prisma.product.createMany({
    data: [
      product("lead", "/fences/lead/", { leadOnly: true }),
      product("catalog", "/fences/catalog/", { catalogOnly: true, tags: ["x"] }),
      product("plain", "/fences/plain/", { tags: ["x"] }),
      product("none", "/fences/none/", undefined),
      product("false", "/fences/false/", { leadOnly: false, catalogOnly: false }),
      product("text", "/fences/text/", { leadOnly: "true" }),
      product("deleted", "/fences/deleted/", { leadOnly: true }, new Date("2026-10-01T00:00:00Z")),
      product("unasked", "/fences/unasked/", { leadOnly: true }),
      product("no-permalink", null, { leadOnly: true }),
    ],
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!sqlite)("leadOnlyPaths — on a real database", () => {
  it("finds the marked, live products at the asked paths, and nothing else", async () => {
    const asked = ["lead", "catalog", "plain", "none", "false", "text", "deleted", "not-a-product"].map((p) => `/fences/${p}/`);
    expect(await leadOnlyPaths(asked)).toEqual(new Set(["/fences/lead/", "/fences/catalog/"]));
  });

  it("asks for nothing, finds nothing", async () => {
    expect(await leadOnlyPaths([])).toEqual(new Set());
  });
});
