import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/brand", () => ({
  getBrand: vi.fn(async () => ({
    storeName: "Example",
    url: "https://example.test/",
    defaultLocale: "en",
  })),
}));

/** Inspect only the operation's top-level contract. Deliberately opaque nested
 * fields remain valid when the enclosing tool result is concrete. */
function isUnconstrainedTopLevel(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return true;
  const record = schema as Record<string, unknown>;
  const alternatives = record.anyOf ?? record.oneOf ?? record.allOf;
  if (Array.isArray(alternatives)) {
    return alternatives.length === 0 || alternatives.some(isUnconstrainedTopLevel);
  }
  if (typeof record.$ref === "string") return false;
  const declaredTypes =
    typeof record.type === "string"
      ? [record.type]
      : Array.isArray(record.type)
        ? record.type.filter((entry): entry is string => typeof entry === "string")
        : [];
  if (declaredTypes.includes("object")) {
    const properties = record.properties;
    if (
      properties &&
      typeof properties === "object" &&
      !Array.isArray(properties) &&
      Object.keys(properties as Record<string, unknown>).length > 0
    ) {
      return false;
    }
    const values = record.additionalProperties;
    return (
      values === undefined ||
      values === true ||
      (typeof values === "object" &&
        values !== null &&
        !Array.isArray(values) &&
        isUnconstrainedTopLevel(values))
    );
  }
  if (declaredTypes.includes("array")) {
    const items = record.items;
    return (
      items === undefined ||
      items === true ||
      (typeof items === "object" &&
        items !== null &&
        !Array.isArray(items) &&
        isUnconstrainedTopLevel(items))
    );
  }
  return (
    declaredTypes.length === 0 &&
    !("const" in record) &&
    !Array.isArray(record.enum)
  );
}

describe("agentic public contracts", () => {
  it("OpenAPI has concrete paths, unique operationIds and explicit security", async () => {
    const { buildOpenApiDocument } = await import("@/lib/openapi");
    const { listTools } = await import("@/lib/tools/registry");
    const document = await buildOpenApiDocument();
    const operations = Object.values(document.paths).map((path) => path.post);
    const ids = operations.map((operation) => operation.operationId);
    expect(operations).toHaveLength(listTools().length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.paths["/api/v1/tools/products.search"].post.security).toEqual([]);
    expect(document.paths["/api/v1/tools/orders.list"].post.security).toEqual([{ bearerAuth: [] }]);
    expect(
      document.paths["/api/v1/tools/products.search"].post[
        "x-cartwright-required-scope"
      ],
    ).toBe("catalog:read");
    expect(document["x-cartwright-scopes-supported"]).toContain(
      "orders:read",
    );
    expect(
      document.components.securitySchemes.bearerAuth[
        "x-cartwright-scopes-supported"
      ],
    ).toEqual(document["x-cartwright-scopes-supported"]);
    expect(document.servers).toEqual([{ url: "https://example.test" }]);
    expect(document.externalDocs.url).toBe(
      "https://example.test/en/developers",
    );
    const publicResult = document.paths["/api/v1/tools/products.search"].post
      .responses["200"].content["application/json"].schema.properties.result as Record<string, unknown>;
    const publicItems = publicResult.items as Record<string, unknown>;
    expect(publicResult).toMatchObject({ type: "array" });
    expect(publicItems).toMatchObject({ type: "object" });
    expect(publicItems.properties).toHaveProperty("slug");
    for (const operation of operations) {
      expect(operation.description.length).toBeGreaterThanOrEqual(20);
      expect(operation.requestBody.content["application/json"].schema).toBeTruthy();
      expect(operation.responses["422"]).toEqual({ $ref: "#/components/responses/Problem" });
      expect(operation.responses["401"]).toEqual({
        $ref: "#/components/responses/UnauthorizedProblem",
      });
      expect(operation.responses["429"]).toEqual({
        $ref: "#/components/responses/RateLimitProblem",
      });
      const result = operation.responses["200"].content["application/json"].schema
        .properties.result;
      expect(
        isUnconstrainedTopLevel(result),
        `${operation.operationId} must publish a concrete result schema`,
      ).toBe(false);
      expect(JSON.stringify(result)).not.toContain(
        "Older authenticated tools add concrete result schemas incrementally",
      );
    }
    expect(
      document.components.responses.UnauthorizedProblem.headers[
        "WWW-Authenticate"
      ],
    ).toEqual({ $ref: "#/components/headers/WWWAuthenticate" });
    expect(
      document.components.responses.RateLimitProblem.headers["Retry-After"],
    ).toEqual({ $ref: "#/components/headers/RetryAfter" });
    expect(
      document.paths["/api/v1/tools/products.search"].post.responses["200"]
        .headers!.RateLimit,
    ).toEqual({ $ref: "#/components/headers/RateLimit" });
    expect(
      document.paths["/api/v1/tools/orders.list"].post.responses["200"]
        .headers!.RateLimit,
    ).toEqual({ $ref: "#/components/headers/RateLimit" });
    // Standalone Zod schemas can use #/$defs refs. Once embedded in OpenAPI,
    // every such definition must be hoisted below components/schemas.
    expect(JSON.stringify(document)).not.toContain('"$ref":"#/$defs/');
    expect(
      Object.keys(document.components.schemas).some((name) =>
        name.startsWith("invoke_orders_get_output_"),
      ),
    ).toBe(true);
  }, 15_000);

  it("publishes an API-prefixed OpenAPI alias without creating a second contract", async () => {
    const canonical = await import("@/app/openapi.json/route");
    const alias = await import("@/app/api/openapi.json/route");
    const [canonicalResponse, aliasResponse] = await Promise.all([
      canonical.GET(),
      alias.GET(),
    ]);

    expect(aliasResponse.status).toBe(200);
    expect(aliasResponse.headers.get("link")).toContain('rel="canonical"');
    expect(aliasResponse.headers.get("api-version")).toBe("1.0.0");
    expect(await aliasResponse.json()).toEqual(await canonicalResponse.json());
    expect(alias.OPTIONS().headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  }, 15_000);

  it("problem responses retain compatibility fields and resolution guidance", async () => {
    const { problemResponse } = await import("@/lib/api-problem");
    const response = problemResponse({ status: 401, title: "Unauthorized", detail: "A key is required", instance: "/api/test", code: "authentication_required", resolution: "Send a Bearer key." });
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ status: 401, ok: false, error: "A key is required", resolution: "Send a Bearer key." });
  });

  it("does not expose handler or database details in 500 problem responses", async () => {
    const { invokeProblem } = await import("@/lib/api-problem");
    const response = invokeProblem(
      { ok: false, status: 500, error: "SQL error: no such column secret_table.token" },
      "/api/v1/tools/site.list_pages",
    );
    const body = await response.json();
    expect(body.detail).toBe("The tool could not complete because of an internal service error.");
    expect(body.error).toBe(body.detail);
    expect(JSON.stringify(body)).not.toContain("secret_table");
  });

  it("markdown 404 gives recovery links and a real 404 status", async () => {
    const { GET, buildRecoveryLinks } = await import("@/app/[locale]/[...missing]/route");
    const response = await GET(new Request("https://example.test/en/nope", { headers: { accept: "text/markdown" } }), {
      params: Promise.resolve({ locale: "en", missing: ["nope"] }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("vary")).toBe("Accept, Accept-Encoding");
    const body = await response.text();
    expect(body).toContain("[Sitemap](/sitemap.xml)");
    expect(body).toContain("[Developer documentation](/en/developers)");
    expect(body).not.toContain("/en/products");

    const commerceLinks = buildRecoveryLinks("en", true, true);
    expect(commerceLinks).toContain("[Product catalogue](/en/produkter)");
    expect(commerceLinks).not.toContain("/en/products");

    const staticLinks = buildRecoveryLinks("en", false, false);
    expect(staticLinks).not.toContain("/developers");
    expect(staticLinks).not.toContain("Product catalogue");
  });
});
