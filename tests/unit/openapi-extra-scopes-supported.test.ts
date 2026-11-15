import { describe, expect, it, vi } from "vitest";

/**
 * `lib/openapi.ts` builds `x-cartwright-scopes-supported` (top level and on the
 * bearer scheme) and `x-cartwright-scopes` from every scope a tool REQUIRES:
 * its primary `scope` and its `extraScopes` (#787). In the real registry every
 * extra scope happens also to be some other tool's primary scope
 * (`discounts:write` is `discounts.create`'s), so dropping the extras leg would
 * go unnoticed there. This pins it with a manifest whose only tool is
 * `marketing.create_campaign`: then `discounts:write` can only come from the
 * extra scope.
 */

vi.mock("@/lib/brand", () => ({
  getBrand: vi.fn(async () => ({
    storeName: "Example",
    url: "https://example.test/",
    defaultLocale: "en",
  })),
}));

vi.mock("@/lib/tools/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools/registry")>();
  return {
    ...actual,
    buildToolManifest: () =>
      actual.buildToolManifest().filter((tool) => tool.name === "marketing.create_campaign"),
  };
});

describe("OpenAPI: the supported scopes include every tool's extra scopes", () => {
  it("a scope that only an extraScopes entry names is still listed as supported", async () => {
    const { buildOpenApiDocument } = await import("@/lib/openapi");
    const document = await buildOpenApiDocument();

    expect(Object.keys(document.paths)).toEqual(["/api/v1/tools/marketing.create_campaign"]);
    const operation = document.paths["/api/v1/tools/marketing.create_campaign"].post as Record<string, unknown>;
    expect(operation["x-cartwright-required-scope"]).toBe("marketing:write");
    expect(operation["x-cartwright-extra-scopes"]).toEqual(["discounts:write"]);

    expect(document["x-cartwright-scopes-supported"]).toEqual(["discounts:write", "marketing:write"]);
    const bearer = document.components.securitySchemes.bearerAuth;
    expect(bearer["x-cartwright-scopes-supported"]).toEqual(["discounts:write", "marketing:write"]);
    expect(Object.keys(bearer["x-cartwright-scopes"])).toEqual(["discounts:write", "marketing:write"]);
    expect(bearer.description).toContain("discounts:write");
    // The cold import of the whole tool registry takes 5-10 s on a loaded runner.
  }, 30_000);
});
