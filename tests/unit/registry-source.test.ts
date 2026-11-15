import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildRegistrySource } from "../../scripts/build-registry-source";

/**
 * `lib/magic/registry-source.ts` is a build-time MIRROR: `pnpm build:registry`
 * (wired into `pnpm build`) embeds the raw TSX of the curated, installable
 * section/svg-item atoms so `/api/registry` can serve them on Vercel's
 * read-only serverless filesystem.
 *
 * The hazard: edit a shipped atom but forget to re-run `pnpm build:registry`,
 * and the committed mirror silently drifts from its sources. Every contributor's
 * tree then goes dirty on the next `pnpm build`, and PRs risk dragging in
 * unrelated generated noise (this exact drift happened once — the SVG-items
 * gained a `CSSProperties` import without the mirror being regenerated).
 *
 * This invariant makes the drift impossible: the committed file must equal what
 * the generator produces from the current sources. Runs in the `pnpm test` gate.
 */
describe("lib/magic/registry-source.ts", () => {
  it("matches the committed file — run `pnpm build:registry` if this fails", () => {
    const committed = readFileSync("lib/magic/registry-source.ts", "utf8");
    expect(buildRegistrySource()).toBe(committed);
  });
});
