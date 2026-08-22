import "server-only";

import { getBrand } from "@/lib/brand";
import { buildToolManifest } from "@/lib/tools/registry";
import { isPublicAgentTool } from "@/lib/tools/public";

function operationId(name: string): string {
  return `invoke_${name.replace(/[^a-zA-Z0-9]+/g, "_")}`;
}

const jsonValueSchema = {
  description: "JSON-serializable tool result. Older authenticated tools add concrete result schemas incrementally.",
  oneOf: [
    { type: "object", additionalProperties: true },
    { type: "array", items: true },
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
};

export async function buildOpenApiDocument() {
  const brand = await getBrand();
  const base = brand.url.replace(/\/+$/, "");
  const paths = Object.fromEntries(buildToolManifest().map((tool) => [
    `/api/v1/tools/${tool.name}`,
    {
      post: {
        operationId: operationId(tool.name),
        summary: tool.description,
        description: tool.description,
        tags: [tool.name.split(".")[0]],
        security: isPublicAgentTool(tool.name) ? [] : [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: tool.inputJsonSchema } },
        },
        responses: {
          "200": {
            description: "Tool completed successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "result"],
                  properties: {
                    ok: { const: true },
                    result: tool.outputJsonSchema ?? jsonValueSchema,
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/Problem" },
          "401": { $ref: "#/components/responses/Problem" },
          "403": { $ref: "#/components/responses/Problem" },
          "422": { $ref: "#/components/responses/Problem" },
          "429": { $ref: "#/components/responses/Problem" },
          "500": { $ref: "#/components/responses/Problem" },
        },
        ...(tool.examples?.length ? {
          "x-examples": tool.examples.map((example) => ({ name: example.name, value: example.body })),
        } : {}),
      },
    },
  ]));

  return {
    openapi: "3.1.0",
    info: {
      title: `${brand.storeName} Agent API`,
      version: "1.0.0",
      description: "Typed REST access to Cartwright tools. Public browsing is anonymous and rate-limited; private data and actions require scoped Bearer authentication. Stable operations use the /api/v1 major-version prefix. Additive changes may land within v1; breaking changes require a new major version. Deprecations are documented and signaled with RFC 9745 Deprecation and Link headers plus a Sunset date at least 90 days before removal.",
      license: {
        name: "MIT",
        identifier: "MIT",
      },
    },
    externalDocs: {
      description: "Authentication, scopes, rate limits, errors, versioning and deprecation policy",
      url: `${base}/${brand.defaultLocale}/developers`,
    },
    servers: [{ url: base }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "sb_live_…" },
      },
      schemas: {
        Problem: {
          type: "object",
          required: ["type", "title", "status", "detail", "instance", "code", "resolution", "ok", "error"],
          properties: {
            type: { type: "string", format: "uri" },
            title: { type: "string" },
            status: { type: "integer", minimum: 400, maximum: 599 },
            detail: { type: "string" },
            instance: { type: "string" },
            code: { type: "string" },
            resolution: { type: "string" },
            ok: { const: false },
            error: { type: "string", deprecated: true },
          },
        },
      },
      responses: {
        Problem: {
          description: "RFC 9457-compatible problem details",
          content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
        },
      },
    },
  };
}
