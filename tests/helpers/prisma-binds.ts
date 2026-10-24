/**
 * How many bind values a Prisma `where` sends on SQLite/libSQL, and the
 * ceiling above which the client refuses the query (P2029) — so a test can
 * prove a query fits without a database.
 *
 * Measured on Prisma 7.10.1 + `@prisma/adapter-libsql` (CATEGORY-IN-LIST-
 * BIND-LIMIT): every scalar a filter compares against is one value, an `in`
 * list one per element, `null` none (it compiles to `IS NULL`), and every
 * `findMany` binds LIMIT and OFFSET on top, with or without `take`/`skip`. A
 * `categoryId: { in }` of 997 ids passed and 998 threw: 997 + 2 = 999.
 */
export const PRISMA_SQLITE_MAX_BINDS = 999;

/** LIMIT and OFFSET — bound by every `findMany`. */
export const PRISMA_FIND_MANY_PAGE_BINDS = 2;

export function prismaBindValues(where: unknown): number {
  if (where === null || where === undefined) return 0;
  if (Array.isArray(where)) return where.reduce((n: number, value) => n + prismaBindValues(value), 0);
  if (typeof where === "object" && !(where instanceof Date)) {
    return Object.values(where).reduce((n: number, value) => n + prismaBindValues(value), 0);
  }
  return 1;
}

/** Whether a `findMany` with this `where` stays under the ceiling. */
export function fitsPrismaSqlite(where: unknown): boolean {
  return prismaBindValues(where) + PRISMA_FIND_MANY_PAGE_BINDS <= PRISMA_SQLITE_MAX_BINDS;
}
