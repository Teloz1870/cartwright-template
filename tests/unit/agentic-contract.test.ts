import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/brand", () => ({
  getBrand: vi.fn(async () => ({
    storeName: "Example",
    url: "https://example.test",
  })),
}));

describe("agentic public contracts", () => {
  it("OpenAPI has concrete paths, unique operationIds and explicit security", async () => {
    const { buildOpenApiDocument } = await import("@/lib/openapi");
    const document = await buildOpenApiDocument();
    const operations = Object.values(document.paths).map((path) => path.post);
    const ids = operations.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.paths["/api/v1/tools/products.search"].post.security).toEqual([]);
    expect(document.paths["/api/v1/tools/orders.list"].post.security).toEqual([{ bearerAuth: [] }]);
    for (const operation of operations) {
      expect(operation.requestBody.content["application/json"].schema).toBeTruthy();
      expect(operation.responses["422"]).toEqual({ $ref: "#/components/responses/Problem" });
    }
  }, 15_000);

  it("problem responses retain compatibility fields and resolution guidance", async () => {
    const { problemResponse } = await import("@/lib/api-problem");
    const response = problemResponse({ status: 401, title: "Unauthorized", detail: "A key is required", instance: "/api/test", code: "authentication_required", resolution: "Send a Bearer key." });
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ status: 401, ok: false, error: "A key is required", resolution: "Send a Bearer key." });
  });

  it("markdown 404 gives recovery links and a real 404 status", async () => {
    const { GET } = await import("@/app/[locale]/[...missing]/route");
    const response = await GET(new Request("https://example.test/en/nope", { headers: { accept: "text/markdown" } }), {
      params: Promise.resolve({ locale: "en", missing: ["nope"] }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("vary")).toBe("Accept, Accept-Encoding");
    expect(await response.text()).toContain("[Sitemap](/sitemap.xml)");
  });
});
