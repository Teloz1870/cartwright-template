import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bulk redirect import (lib/redirects/import.ts) — the WooCommerce-migration
 * step where every old URL goes in BEFORE the DNS switch.
 *
 * Pure half (parse + plan) is exercised without any mock. The I/O half mocks
 * `@/lib/db` + `@/lib/audit` the way settings-tools.test.ts does: a dry run
 * must write nothing, a real run must write once and audit once — and never
 * put the CSV itself in the audit args.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    redirect: { findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
  withAudit: vi.fn(),
  syncRedirectsToRedis: vi.fn(),
  captured: { meta: [] as Record<string, unknown>[] },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
// Everything in the store stays real (the shared rule, buildRedirectMap) except
// the Redis sync — the edge only sees an import once it runs, so it is pinned.
vi.mock("@/lib/redirects/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/redirects/store")>()),
  syncRedirectsToRedis: mocks.syncRedirectsToRedis,
}));
// For the server action: an admin session, and a revalidate that does nothing.
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "u-test", role: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const ACTOR = "user:test" as const;

beforeEach(() => {
  mocks.prisma.redirect.findMany.mockReset().mockResolvedValue([]);
  mocks.prisma.redirect.upsert.mockReset().mockImplementation((args: unknown) => args);
  mocks.prisma.$transaction.mockReset().mockResolvedValue([]);
  mocks.syncRedirectsToRedis.mockReset().mockResolvedValue(true);
  mocks.captured.meta = [];
  mocks.withAudit
    .mockReset()
    .mockImplementation(async (meta: Record<string, unknown>, fn: () => Promise<unknown>) => {
      mocks.captured.meta.push(meta);
      return fn();
    });
});

describe("parseRedirectCsv", () => {
  it("parses from,to,status with an optional, case-insensitive header and CRLF", async () => {
    const { parseRedirectCsv } = await import("@/lib/redirects/import");
    const r = parseRedirectCsv("FROM,TO,STATUS\r\n/old,/new\r\n/sale,/campaign,302\r\n");
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([
      { line: 2, from: "/old", to: "/new", status: "" },
      { line: 3, from: "/sale", to: "/campaign", status: "302" },
    ]);
  });

  it("works without a header: the first row is data", async () => {
    const { parseRedirectCsv } = await import("@/lib/redirects/import");
    expect(parseRedirectCsv("/old,/new").rows).toEqual([{ line: 1, from: "/old", to: "/new", status: "" }]);
  });

  it("strips a UTF-8 BOM so the header is still recognised", async () => {
    const { parseRedirectCsv } = await import("@/lib/redirects/import");
    const r = parseRedirectCsv("\uFEFFfrom,to\n/old,/new\n");
    expect(r.rows).toEqual([{ line: 2, from: "/old", to: "/new", status: "" }]);
  });

  it("keeps commas inside quoted fields and trims cells", async () => {
    const { parseRedirectCsv } = await import("@/lib/redirects/import");
    const r = parseRedirectCsv('"/old,page" , "https://x.test/a,b" , 301');
    expect(r.rows).toEqual([{ line: 1, from: "/old,page", to: "https://x.test/a,b", status: "301" }]);
  });

  it("skips blank lines and # comments but keeps physical line numbers", async () => {
    const { parseRedirectCsv } = await import("@/lib/redirects/import");
    const r = parseRedirectCsv("# exported from WooCommerce\n\n/a,/b\n   \n# note\n/c,/d\n");
    expect(r.rows.map((x) => [x.line, x.from])).toEqual([
      [3, "/a"],
      [6, "/c"],
    ]);
  });

  it("refuses more than 2000 rows with ONE error — never a silent truncation", async () => {
    const { parseRedirectCsv, REDIRECT_IMPORT_LIMITS } = await import("@/lib/redirects/import");
    const lines = Array.from({ length: REDIRECT_IMPORT_LIMITS.maxRows + 1 }, (_, i) => `/p${i},/q`);
    const r = parseRedirectCsv(lines.join("\n"));
    expect(r.rows).toEqual([]);
    expect(r.error).toMatch(/2001 redirects; the limit is 2000/);
    // Exactly at the limit is fine.
    expect(parseRedirectCsv(lines.slice(0, 2000).join("\n")).error).toBeNull();
  });

  it("refuses an input larger than 256 KB with ONE error", async () => {
    const { parseRedirectCsv, REDIRECT_IMPORT_LIMITS } = await import("@/lib/redirects/import");
    const big = "/a,/b\n".repeat(Math.ceil(REDIRECT_IMPORT_LIMITS.maxBytes / 6) + 1);
    const r = parseRedirectCsv(big);
    expect(r.rows).toEqual([]);
    expect(r.error).toMatch(/larger than 256 KB/);
  });
});

describe("planRedirectImport", () => {
  const plan = async (csv: string, existing: Record<string, { to: string; status: number }> = {}) => {
    const { parseRedirectCsv, planRedirectImport } = await import("@/lib/redirects/import");
    const parsed = parseRedirectCsv(csv);
    expect(parsed.error).toBeNull();
    return planRedirectImport(parsed.rows, existing);
  };

  it("normalises sources, defaults status to 301, keeps 302, flags replacements", async () => {
    const p = await plan("from,to,status\nold-page/,/new\n/sale,/campaign,302\n", {
      "/sale": { to: "/x", status: 301 },
    });
    expect(p.errors).toEqual([]);
    expect(p.valid).toEqual([
      { line: 2, fromPath: "/old-page", toPath: "/new", status: 301, replaces: false },
      { line: 3, fromPath: "/sale", toPath: "/campaign", status: 302, replaces: true },
    ]);
    expect(p.summary).toEqual({ rows: 2, valid: 2, invalid: 0, replaces: 1 });
  });

  const LOCALE_REASON = "Write the destination without the /da or /en prefix — the redirect keeps the reader's locale.";

  it("applies createRedirect's own rules per row, with the line number", async () => {
    // /kontakt → /da/kontakt would loop at runtime (/da/kontakt matches /kontakt
    // again → /da/da/kontakt); /page → /page/ is the same page with a slash.
    const p = await plan(",/new\n/a,new\n/same,/same\n/b,/c,307\n/kontakt,/da/kontakt\n/page,/page/\n");
    expect(p.valid).toEqual([]);
    expect(p.errors).toEqual([
      { line: 1, reason: "A source path is required." },
      { line: 2, reason: "The destination must start with / or http(s)://" },
      { line: 3, reason: "Source and destination must not be the same." },
      { line: 4, reason: 'Status must be 301 or 302 (got "307").' },
      { line: 5, reason: LOCALE_REASON },
      { line: 6, reason: "Source and destination must not be the same." },
    ]);
  });

  it("the single-create path refuses exactly the same inputs (shared rule)", async () => {
    const { createRedirect } = await import("@/lib/redirects/store");
    expect(await createRedirect("", "/new", 301, ACTOR)).toEqual({ ok: false, error: "A source path is required." });
    expect(await createRedirect("/a", "new", 301, ACTOR)).toEqual({
      ok: false,
      error: "The destination must start with / or http(s)://",
    });
    const same = { ok: false, error: "Source and destination must not be the same." };
    expect(await createRedirect("/same", "/same", 301, ACTOR)).toEqual(same);
    // A trailing slash or a query does not make it a different page — saved, it loops.
    expect(await createRedirect("/page", "/page/", 301, ACTOR)).toEqual(same);
    expect(await createRedirect("/page", "/page?x=1", 301, ACTOR)).toEqual(same);
    expect(await createRedirect("/kontakt", "/da/kontakt", 301, ACTOR)).toEqual({ ok: false, error: LOCALE_REASON });
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });

  it("the locale rule reads the destination as the router does: a query or hash does not hide /da or /en", async () => {
    const { redirectInputError } = await import("@/lib/redirects/store");
    // /da?ref=x lands on /da at runtime — the same loop as /da/x, just dressed up.
    for (const to of ["/da?ref=x", "/en#top", "/da/", "/da/x?ref=y"]) {
      expect(redirectInputError("/old", to), to).toBe(LOCALE_REASON);
    }
    // Not a locale segment: a longer first segment, or "da" only in the query/hash.
    for (const to of ["/dansk/side", "/x?ref=da", "/english#en"]) {
      expect(redirectInputError("/old", to), to).toBeNull();
    }
    const p = await plan("/old,/da?ref=x\n/new,/x?ref=da\n");
    expect(p.errors).toEqual([{ line: 1, reason: LOCALE_REASON }]);
    expect(p.valid).toMatchObject([{ line: 2, fromPath: "/new", toPath: "/x?ref=da" }]);
  });

  it("refuses a duplicate source inside the CSV (the later line)", async () => {
    const p = await plan("/a,/b\n/c,/d\na/,/e\n");
    expect(p.valid.map((v) => v.line)).toEqual([1, 2]);
    expect(p.errors).toEqual([{ line: 3, reason: "Duplicate source path /a (also on line 1)." }]);
  });

  it("refuses a chain inside the CSV: a destination that is itself a source", async () => {
    const p = await plan("/a,/b\n/b,/c\n");
    expect(p.valid.map((v) => v.fromPath)).toEqual(["/b"]);
    expect(p.errors).toEqual([
      {
        line: 1,
        reason: "/b is itself redirected (to /c); chains are not allowed; point directly at the final destination.",
      },
    ]);
  });

  it("refuses a chain through an already-saved redirect", async () => {
    const p = await plan("/a,/b/\n", { "/b": { to: "/c", status: 301 } });
    expect(p.valid).toEqual([]);
    expect(p.errors[0]?.reason).toMatch(/^\/b is itself redirected \(to \/c\); chains are not allowed/);
  });

  it("refuses the other direction too: a source that a saved redirect already points at", async () => {
    // Saved /a → /b; the file says /b → /c. Accepting it would put /a → /b → /c live.
    const p = await plan("/b,/c\n", { "/a": { to: "/b", status: 301 } });
    expect(p.valid).toEqual([]);
    expect(p.errors).toEqual([
      { line: 1, reason: "/a already redirects to /b; chains are not allowed; point /a directly at the final destination." },
    ]);
    // A saved destination is compared as a source path — the trailing slash does not hide it.
    expect((await plan("/b,/c\n", { "/a": { to: "/b/", status: 301 } })).valid).toEqual([]);
  });

  it("a row for the upstream source in the same file replaces the saved one — then it is no chain", async () => {
    const p = await plan("/b,/c\n/a,/c\n", { "/a": { to: "/b", status: 301 } });
    expect(p.errors).toEqual([]);
    expect(p.valid.map((v) => [v.fromPath, v.replaces])).toEqual([
      ["/b", false],
      ["/a", true],
    ]);
  });

  it("a row that is refused does not replace its saved redirect — so the row downstream of it goes too", async () => {
    // Saved /a → /b. Line 1 re-states it but is a chain into line 2, so it is
    // refused and the saved /a STAYS; accepting line 2 would put /a → /b → /c live.
    const p = await plan("/a,/b\n/b,/c\n", { "/a": { to: "/b", status: 301 } });
    expect(p.valid).toEqual([]);
    expect(p.errors).toEqual([
      { line: 1, reason: "/b is itself redirected (to /c); chains are not allowed; point directly at the final destination." },
      { line: 2, reason: "/a already redirects to /b; chains are not allowed; point /a directly at the final destination." },
    ]);
    // Same, with the refused re-point going elsewhere: /a,/x is a chain into
    // /x,/y, so /a keeps pointing at /b and /b,/c is its second hop. /x,/y
    // touches nothing that is saved and stays valid.
    const q = await plan("/a,/x\n/x,/y\n/b,/c\n", { "/a": { to: "/b", status: 301 } });
    expect(q.valid.map((v) => v.fromPath)).toEqual(["/x"]);
    expect(q.errors.map((e) => e.line)).toEqual([1, 3]);
    expect(q.errors[1]?.reason).toMatch(/^\/a already redirects to \/b/);
  });

  it("'is a source' means what the matcher does at request time: locale prefix and query are stripped", async () => {
    // Saved before the locale rule existed: /a → /da/b lands on /b at runtime.
    const backward = await plan("/b,/c\n", { "/a": { to: "/da/b", status: 301 } });
    expect(backward.valid).toEqual([]);
    expect(backward.errors[0]?.reason).toMatch(/^\/a already redirects to \/b/);
    // /b?x=1 is the pathname /b, which is a source in the file / already saved.
    const query = await plan("/a,/b?x=1\n/b,/c\n");
    expect(query.valid.map((v) => v.fromPath)).toEqual(["/b"]);
    expect(query.errors).toEqual([
      { line: 1, reason: "/b is itself redirected (to /c); chains are not allowed; point directly at the final destination." },
    ]);
    expect((await plan("/a,/b#top\n", { "/b": { to: "/c", status: 301 } })).valid).toEqual([]);
    // A locale-prefixed destination in the file is refused by the per-row rule, before any chain check.
    const localised = await plan("/a,/da/b\n", { "/b": { to: "/c", status: 301 } });
    expect(localised.errors).toEqual([{ line: 1, reason: LOCALE_REASON }]);
    // Unrelated saved redirects change nothing.
    const unrelated = await plan("/old,/new\n", { "/x": { to: "/y", status: 301 } });
    expect(unrelated.errors).toEqual([]);
    expect(unrelated.valid.map((v) => v.fromPath)).toEqual(["/old"]);
  });

  it("re-pointing an existing source is an update, not a chain", async () => {
    const p = await plan("/old,/newer\n", { "/old": { to: "/new", status: 301 } });
    expect(p.errors).toEqual([]);
    expect(p.valid[0]).toMatchObject({ fromPath: "/old", toPath: "/newer", replaces: true });
  });

  it("refuses a loop inside the CSV and a loop with a saved redirect", async () => {
    const inCsv = await plan("/a,/b\n/b,/a\n");
    expect(inCsv.valid).toEqual([]);
    expect(inCsv.errors).toEqual([
      { line: 1, reason: "Redirect loop: /a → /b → /a." },
      { line: 2, reason: "Redirect loop: /b → /a → /b." },
    ]);
    const withSaved = await plan("/a,/b\n", { "/b": { to: "/a", status: 301 } });
    expect(withSaved.errors).toEqual([{ line: 1, reason: "Redirect loop: /a → /b → /a." }]);
  });

  it("an external destination never chains", async () => {
    const p = await plan("/a,https://other.test/b\n", { "https://other.test/b": { to: "/c", status: 301 } });
    expect(p.errors).toEqual([]);
    expect(p.valid).toHaveLength(1);
  });
});

describe("importRedirects", () => {
  const CSV = "from,to,status\n/old,/new\n/sale,/campaign,302\n/bad,nope\n";

  it("dry run returns the plan and writes nothing", async () => {
    const { importRedirects } = await import("@/lib/redirects/import");
    const plan = await importRedirects(CSV, ACTOR, { dryRun: true });
    expect(plan.dryRun).toBe(true);
    if (!plan.dryRun) return;
    expect(plan.summary).toEqual({ rows: 3, valid: 2, invalid: 1, replaces: 0 });
    expect(plan.errors).toEqual([{ line: 4, reason: "The destination must start with / or http(s)://" }]);
    expect(mocks.prisma.redirect.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.redirect.upsert).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });

  it("a real run upserts every valid row in ONE transaction under ONE audit entry", async () => {
    const { importRedirects } = await import("@/lib/redirects/import");
    const r = await importRedirects(CSV, ACTOR, { dryRun: false, requestId: "req-1", ip: "10.0.0.1" });
    expect(r).toEqual({
      dryRun: false,
      imported: 2,
      skipped: 1,
      errors: [{ line: 4, reason: "The destination must start with / or http(s)://" }],
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.prisma.redirect.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.redirect.upsert).toHaveBeenCalledWith({
      where: { fromPath: "/sale" },
      update: { toPath: "/campaign", statusCode: 302 },
      create: { fromPath: "/sale", toPath: "/campaign", statusCode: 302 },
    });
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    const meta = mocks.captured.meta[0];
    expect(meta).toMatchObject({
      actor: ACTOR,
      tool: "redirects.import",
      args: { count: 2, dryRun: false },
      requestId: "req-1",
      ip: "10.0.0.1",
    });
    expect(JSON.stringify(meta.args)).not.toContain("/old");
  });

  it("a real run syncs the map to Redis exactly once, after the write; a dry run never does", async () => {
    // The edge reads Redis, not the table: without this call an import is saved
    // but not live. Dropping it left every other test green.
    const { importRedirects } = await import("@/lib/redirects/import");
    await importRedirects(CSV, ACTOR, { dryRun: true });
    expect(mocks.syncRedirectsToRedis).not.toHaveBeenCalled();
    await importRedirects(CSV, ACTOR, { dryRun: false });
    expect(mocks.syncRedirectsToRedis).toHaveBeenCalledTimes(1);
    expect(mocks.syncRedirectsToRedis.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.prisma.$transaction.mock.invocationCallOrder[0],
    );
  });

  it("a real run with nothing valid writes, audits and syncs nothing", async () => {
    const { importRedirects } = await import("@/lib/redirects/import");
    const r = await importRedirects("/bad,nope\n", ACTOR, { dryRun: false });
    expect(r).toEqual({
      dryRun: false,
      imported: 0,
      skipped: 1,
      errors: [{ line: 1, reason: "The destination must start with / or http(s)://" }],
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
    expect(mocks.syncRedirectsToRedis).not.toHaveBeenCalled();
  });

  it("an over-bounds file is ONE line-0 error on both paths, and nothing is written", async () => {
    const { importRedirects, REDIRECT_IMPORT_LIMITS } = await import("@/lib/redirects/import");
    const big = Array.from({ length: REDIRECT_IMPORT_LIMITS.maxRows + 1 }, (_, i) => `/p${i},/q`).join("\n");
    const plan = await importRedirects(big, ACTOR, { dryRun: true });
    expect(plan).toMatchObject({ dryRun: true, valid: [], errors: [{ line: 0 }] });
    expect(plan.errors).toHaveLength(1);
    const r = await importRedirects(big, ACTOR, { dryRun: false });
    expect(r).toMatchObject({ dryRun: false, imported: 0 });
    expect(r.errors).toHaveLength(1);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });
});

describe("previewRedirectImport (the /admin/redirects server action)", () => {
  it("a failed read is { ok: false, error } the panel can show — not a rejection for the error boundary", async () => {
    mocks.prisma.redirect.findMany.mockRejectedValue(new Error("Database unavailable"));
    const { previewRedirectImport } = await import("@/app/admin/redirects/actions");
    await expect(previewRedirectImport("/a,/b\n")).resolves.toEqual({ ok: false, error: "Database unavailable" });
  });

  it("a good read is { ok: true, plan }", async () => {
    const { previewRedirectImport } = await import("@/app/admin/redirects/actions");
    const r = await previewRedirectImport("/a,/b\n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.summary).toEqual({ rows: 1, valid: 1, invalid: 0, replaces: 0 });
  });
});
