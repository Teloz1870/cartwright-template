import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `Lead.projectType` and `Lead.budget` are agency-shaped fields on a form every
 * shop has. A bakery's visitor has no "project type" and no "budget", and the
 * API stopped requiring them — but the columns were still `NOT NULL`, so the
 * route wrote `""` to satisfy the database. Storing an empty string in a
 * required column is a quiet lie about what the visitor actually said.
 *
 * ## Why this lands in two releases, and why a test guards the seam
 *
 * Widening the column is safe for everyone: an existing `""` still fits.
 * Writing `null` is NOT — a shop that upgrades its CODE before running
 * `pnpm db:push` would get a Prisma error on every submission, i.e. a broken
 * contact form caused by an upgrade. That is the exact failure class this whole
 * body of work is about, so the two halves ship apart:
 *
 *   this release   columns nullable · route still writes ""   → nothing breaks
 *   next release   route writes null                          → needs db:push
 *
 * The danger is that the second half arrives by accident — someone tidies the
 * `?? ""` away, and every unmigrated shop's contact form starts failing with no
 * release note. So the pairing is asserted, not remembered: flipping the write
 * turns this red, and the way to make it green is to do it deliberately, with
 * the migration note in the CHANGELOG.
 */

const ROOT = join(__dirname, "..", "..");
const schema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
const route = readFileSync(
  join(ROOT, "app", "api", "inquiries", "route.ts"),
  "utf8",
);

describe("Lead's agency-shaped columns are optional", () => {
  it("projectType and budget are nullable in the schema", () => {
    for (const field of ["projectType", "budget"]) {
      const line = schema
        .split("\n")
        .find((l) => new RegExp(`^\\s+${field}\\s+String`).test(l));
      expect(line, `${field} is missing from the Lead model`).toBeDefined();
      expect(
        line!.trim(),
        `${field} must be String? — a contact form without agency fields is the normal case`,
      ).toMatch(/^\w+\s+String\?/);
    }
  });

  it("the API still writes a non-null value — the write flips NEXT release", () => {
    // Deliberate, not an oversight: see the file header. If you are flipping
    // this on purpose, update the header, this test, and the CHANGELOG entry
    // that tells shops to run `pnpm db:push` first.
    expect(
      route,
      "route.ts no longer writes a fallback — every shop that upgrades code " +
        "before database now has a broken contact form. See the header.",
    ).toMatch(/projectType:\s*data\.projectType\s*\?\?\s*""/);
  });
});

describe("the migration baseline followed the schema", () => {
  // The baseline is generated FROM schema.prisma and `pnpm db:verify` gates the
  // drift in CI — this asserts the specific column, so a regenerate that
  // silently missed is visible here rather than only as an exit code.
  const baseline = readFileSync(
    join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"),
    "utf8",
  );

  it("declares both columns without NOT NULL", () => {
    for (const field of ["projectType", "budget"]) {
      const line = baseline
        .split("\n")
        .find((l) => l.includes(`"${field}" TEXT`));
      expect(line, `${field} missing from the baseline`).toBeDefined();
      expect(
        line!,
        `${field} is still NOT NULL in the baseline — run the regenerate in prisma/migrations/README.md`,
      ).not.toMatch(/NOT NULL/);
    }
  });
});
