import { describe, expect, it } from "vitest";
import { auditProfile, isGeneratedPath } from "../../scripts/site-profile-audit";

/**
 * SITE-AUDIT-GENERATED — the site-profile audit must treat the generated
 * Prisma client (`app/generated/**`) as absent.
 *
 * The client is gitignored and written by the postinstall `prisma generate`,
 * so it IS on disk wherever this suite runs — and a plain existsSync lookup
 * resolved into it. A site scaffold has no prisma and never generates it, so
 * a site-included file importing it (even `import type`, which tsc resolves
 * before erasing) passed the engine's test and broke the scaffold's
 * typecheck. #691 came within a review of shipping exactly that.
 *
 * The fixtures are virtual (`virtualFiles`), so nothing is written into the
 * tree and the test runs the same in a --no-git scaffold.
 */

// Not claimed by any module → core, i.e. included in every profile.
const CORE_FILE = "lib/__site-audit-fixture__/uses-generated.ts";
// Inside the admin module's wholesale `app/admin` claim → not in `site`.
const ADMIN_FILE = "app/admin/__site-audit-fixture__.ts";

const GENERATED_FLAG = "(generated-client: not in a site scaffold)";

function flagged(
  profile: string,
  virtualFiles: Record<string, string>,
  importer: string,
): string[] {
  return auditProfile(profile, { virtualFiles })
    .violations.filter((v) => v.importer.replace(/ \[unreachable\]$/, "") === importer)
    .map((v) => `${v.specifier} ${v.owner}`);
}

describe("site-profile audit: the generated Prisma client", () => {
  it("flags a type-only alias import from a site-included file", () => {
    const hits = flagged(
      "site",
      { [CORE_FILE]: `import type { Prisma } from "@/app/generated/prisma/client";\n` },
      CORE_FILE,
    );
    expect(hits).toEqual([`@/app/generated/prisma/client ${GENERATED_FLAG}`]);
  });

  it("flags the relative spelling and a value import too", () => {
    const hits = flagged(
      "site",
      {
        [CORE_FILE]:
          `import { PrismaClient } from "../../app/generated/prisma/client";\n` +
          `export const load = () => import("@/app/generated/prisma/enums");\n`,
      },
      CORE_FILE,
    );
    expect(hits).toEqual([
      `../../app/generated/prisma/client ${GENERATED_FLAG}`,
      `@/app/generated/prisma/enums ${GENERATED_FLAG}`,
    ]);
  });

  it("leaves a file outside the site profile alone", () => {
    const hits = flagged(
      "site",
      { [ADMIN_FILE]: `import type { Prisma } from "@/app/generated/prisma/client";\n` },
      ADMIN_FILE,
    );
    expect(hits).toEqual([]);
  });

  it("does not flag the same import in a profile that keeps prisma", () => {
    const hits = flagged(
      "light",
      { [CORE_FILE]: `import type { Prisma } from "@/app/generated/prisma/client";\n` },
      CORE_FILE,
    );
    expect(hits).toEqual([]);
  });

  // Pins the verdict as independent of `prisma generate`: this path exists in
  // no checkout, so if the generated check ever moved after the disk lookup
  // it would surface as `(unresolved)` here (and as a false red on light) —
  // even in CI, where the real client IS on disk.
  it("decides before the disk lookup (a generated path no checkout has)", () => {
    // Both spellings: the alias and the relative path take different branches
    // into resolveSpecifier, so each must reach the early verdict on its own.
    const alias = "@/app/generated/__never-generated__/client";
    const relative = "../../app/generated/__never-generated__/client";
    const files = {
      [CORE_FILE]:
        `import type { X } from "${alias}";\n` +
        `import type { Y } from "${relative}";\n`,
    };
    expect(flagged("site", files, CORE_FILE)).toEqual([
      `${alias} ${GENERATED_FLAG}`,
      `${relative} ${GENERATED_FLAG}`,
    ]);
    expect(flagged("light", files, CORE_FILE)).toEqual([]);
  });

  it("recognises only the generated tree, not a look-alike sibling", () => {
    expect(isGeneratedPath("app/generated/prisma/client")).toBe(true);
    expect(isGeneratedPath("app/generated")).toBe(true);
    expect(isGeneratedPath("app/generated-docs/page")).toBe(false);
    expect(isGeneratedPath("lib/app/generated/x")).toBe(false);
  });
});
