import "server-only";

import { getBrand } from "@/lib/brand";
import { buildToolManifest } from "@/lib/tools/registry";
import { isPublicAgentTool } from "@/lib/tools/public";

function operationId(name: string): string {
  return `invoke_${name.replace(/[^a-zA-Z0-9]+/g, "_")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Zod emits standalone draft-2020 schemas whose local refs start at
 * `#/$defs`. Once that schema is embedded inside an OpenAPI operation, `#`
 * means the OpenAPI document root, so those refs become invalid. Hoist each
 * definition into a uniquely named OpenAPI component and rewrite every local
 * ref before composing the document.
 */
function openApiSchema(
  schema: unknown,
  namespace: string,
  components: Record<string, unknown>,
): unknown {
  if (!isRecord(schema)) return schema;
  const defs = isRecord(schema.$defs) ? schema.$defs : {};
  const safeNamespace = namespace.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const componentNames = new Map(
    Object.keys(defs).map((name) => [
      name,
      `${safeNamespace}_${name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`,
    ]),
  );

  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!isRecord(value)) return value;

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "$defs") continue;
      if (key === "$ref" && typeof child === "string") {
        const match = child.match(/^#\/\$defs\/([^/]+)$/);
        const localName = match?.[1]
          ? decodeURIComponent(match[1].replace(/~1/g, "/").replace(/~0/g, "~"))
          : null;
        const componentName = localName ? componentNames.get(localName) : null;
        output[key] = componentName
          ? `#/components/schemas/${componentName}`
          : child;
      } else {
        output[key] = rewrite(child);
      }
    }
    return output;
  };

  for (const [name, definition] of Object.entries(defs)) {
    components[componentNames.get(name)!] = rewrite(definition);
  }
  return rewrite(schema);
}

export async function buildOpenApiDocument() {
  const brand = await getBrand();
  const base = brand.url.replace(/\/+$/, "");
  const manifest = buildToolManifest();
  const supportedScopes = [...new Set(manifest.map((tool) => tool.scope))].sort();
  const generatedSchemas: Record<string, unknown> = {};
  const openApiManifest = manifest.map((tool) => ({
    ...tool,
    inputJsonSchema: openApiSchema(
      tool.inputJsonSchema,
      `${operationId(tool.name)}_input`,
      generatedSchemas,
    ),
    outputJsonSchema: openApiSchema(
      tool.outputJsonSchema,
      `${operationId(tool.name)}_output`,
      generatedSchemas,
    ),
  }));
  const operationIds = new Set<string>();
  for (const tool of manifest) {
    const id = operationId(tool.name);
    if (operationIds.has(id)) {
      throw new Error(`OpenAPI operationId collision: ${id}`);
    }
    operationIds.add(id);
  }

  const requestRateLimitHeaders = {
    "RateLimit-Policy": { $ref: "#/components/headers/RateLimitPolicy" },
    RateLimit: { $ref: "#/components/headers/RateLimit" },
    "RateLimit-Limit": { $ref: "#/components/headers/LegacyRateLimitLimit" },
    "RateLimit-Remaining": { $ref: "#/components/headers/LegacyRateLimitRemaining" },
    "RateLimit-Reset": { $ref: "#/components/headers/LegacyRateLimitReset" },
  };

  const paths = Object.fromEntries(openApiManifest.map((tool) => {
    const publicRead = isPublicAgentTool(tool.name);
    return [
      `/api/v1/tools/${tool.name}`,
      {
        post: {
        operationId: operationId(tool.name),
        summary: tool.description,
        description: tool.description,
        tags: [tool.name.split(".")[0]],
        security: publicRead ? [] : [{ bearerAuth: [] }],
        "x-cartwright-required-scope": tool.scope,
        "x-cartwright-anonymous-read": publicRead,
        requestBody: {
          required: true,
          content: { "application/json": { schema: tool.inputJsonSchema } },
        },
        responses: {
          "200": {
            description: "Tool completed successfully",
            headers: requestRateLimitHeaders,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "result"],
                  properties: {
                    ok: { const: true },
                    result: tool.outputJsonSchema,
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/Problem" },
          "401": { $ref: "#/components/responses/UnauthorizedProblem" },
          "403": { $ref: "#/components/responses/Problem" },
          "422": { $ref: "#/components/responses/Problem" },
          "429": { $ref: "#/components/responses/RateLimitProblem" },
          "500": { $ref: "#/components/responses/Problem" },
          // Every other status follows the same RFC 9457 error model — stated
          // explicitly so spec consumers never have to guess an error shape.
          default: { $ref: "#/components/responses/Problem" },
        },
        ...(tool.examples?.length ? {
          "x-examples": tool.examples.map((example) => ({ name: example.name, value: example.body })),
        } : {}),
        },
      },
    ];
  }));

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
    "x-cartwright-scopes-supported": supportedScopes,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "sb_live_…",
          description:
            "Cartwright API key. Each operation declares its required named scope in x-cartwright-required-scope.",
          "x-cartwright-scopes-supported": supportedScopes,
        },
      },
      headers: {
        WWWAuthenticate: {
          description: "Bearer authentication challenge",
          schema: { type: "string", example: 'Bearer realm="cartwright-api"' },
        },
        RetryAfter: {
          description: "Seconds before the request should be retried",
          schema: { type: "integer", minimum: 1 },
        },
        RateLimitPolicy: {
          description: "HTTPAPI draft-11 quota policy structured field. Anonymous calls use public-agent; authenticated/private attempts use auth-attempt.",
          schema: { type: "string", example: '"public-agent";q=60;w=60' },
        },
        RateLimit: {
          description: "HTTPAPI draft-11 current service-limit structured field for the active policy",
          schema: { type: "string", example: '"public-agent";r=59;t=1' },
        },
        LegacyRateLimitLimit: {
          description: "Legacy request quota for the active policy",
          schema: { type: "integer", minimum: 0, example: 60 },
        },
        LegacyRateLimitRemaining: {
          description: "Legacy remaining request quota for the active policy",
          schema: { type: "integer", minimum: 0, example: 59 },
        },
        LegacyRateLimitReset: {
          description: "Legacy seconds until the token bucket is fully replenished",
          schema: { type: "integer", minimum: 1, example: 1 },
        },
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
        ...generatedSchemas,
      },
      responses: {
        Problem: {
          description: "RFC 9457-compatible problem details",
          headers: requestRateLimitHeaders,
          content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
        },
        UnauthorizedProblem: {
          description: "Bearer authentication failed",
          headers: {
            "WWW-Authenticate": { $ref: "#/components/headers/WWWAuthenticate" },
            ...requestRateLimitHeaders,
          },
          content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
        },
        RateLimitProblem: {
          description: "Public-agent or authentication-attempt quota exhausted",
          headers: {
            ...requestRateLimitHeaders,
            "Retry-After": { $ref: "#/components/headers/RetryAfter" },
          },
          content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
        },
      },
    },
  };
}
