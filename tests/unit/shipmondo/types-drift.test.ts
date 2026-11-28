import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PATHS, cutSubset, header } from "../../../scripts/gen-shipmondo-types";

/**
 * The committed Shipmondo types were generated from the committed spec subset
 * (scripts/gen-shipmondo-types.ts): api.d.ts carries the subset's sha256 in
 * its header. Fails when the subset or PATHS change without regenerating —
 * run `pnpm gen:shipmondo-types`. (The generator runs through pnpm dlx, so the
 * test checks the hash rather than re-rendering offline.)
 */
const ROOT = join(__dirname, "../../..");
const subsetJson = readFileSync(join(ROOT, "plugins/shipmondo/openapi/shipmondo-v3.subset.json"), "utf8");
const subset = JSON.parse(subsetJson);

describe("Shipmondo API types", () => {
  it("api.d.ts was generated from this exact subset", () => {
    expect(readFileSync(join(ROOT, "plugins/shipmondo/lib/api.d.ts"), "utf8").startsWith(header(subsetJson))).toBe(true);
  });

  it("the subset holds exactly the endpoints the plugin calls, and cutting it again changes nothing", () => {
    expect(
      Object.fromEntries(Object.entries(subset.paths as Record<string, object>).map(([p, m]) => [p, Object.keys(m)])),
    ).toEqual(PATHS);
    expect(cutSubset(subset)).toEqual(subset);
  });
});
