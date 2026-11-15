import { getBrand } from "@/lib/brand";
import { SCOPES } from "@/lib/scopes";
import { PUBLIC_AGENT_TOOL_NAMES } from "@/lib/tools/public";
import { PUBLIC_AGENT_RATE_LIMIT } from "@/lib/public-agent-rate-limit";
import { mcpPublicDisabledResponse } from "@/lib/tools/public-gate";

// /auth.md — the machine-readable authentication guide agents look for at the
// site root. It documents ONLY what this store actually runs: Bearer API keys
// with named scopes, a narrow anonymous read surface, and problem+json errors.
// No OAuth flow is described because none is offered — honesty over score.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const gated = await mcpPublicDisabledResponse("/auth.md");
  if (gated) return gated;

  const brand = await getBrand();
  const base = brand.url.replace(/\/+$/, "");
  const today = new Date().toISOString().slice(0, 10);
  const anonymousTools = PUBLIC_AGENT_TOOL_NAMES.map((name) => `- \`${name}\``).join("\n");
  const scopeList = SCOPES.map((scope) => `- \`${scope}\``).join("\n");

  // Leading heading, no frontmatter: markdown-detection heuristics (measured:
  // Is Agentic's auth-md-exists) require the document to OPEN with a heading.
  // The homepage markdown keeps its frontmatter — different doc, different
  // convention. Canonical + freshness live in the footer line instead.
  const body = `# API authentication — ${brand.storeName}

## Overview

The API at \`${base}/api/v1/tools/<name>\` (and the MCP endpoint at
\`${base}/api/mcp\`) uses **Bearer API keys**. There is no OAuth 2.0 /
OpenID Connect flow on this store — what this file documents is the complete,
actual authentication surface.

## Anonymous access

Five read-only tools accept unauthenticated calls, rate-limited per client IP:

${anonymousTools}

Everything else — private reads and every write — requires a key. An invalid
or expired key never falls back to anonymous access.

## Authentication scheme

Send the key as a standard Bearer token:

\`\`\`
Authorization: Bearer sb_live_…
\`\`\`

Keys are scoped: a request is authorized only when the key carries the scope
the tool requires (each operation's \`x-cartwright-required-scope\` in
[the OpenAPI document](${base}/openapi.json)).

## Obtaining a key

Keys are minted by the store operator in the admin (\`/admin/api-keys\`).
There is no self-service signup for agents; contact the operator via the
[contact page](${base}/${brand.defaultLocale}/contact).

## Scopes

${scopeList}

## Rate limits

Anonymous public reads share a per-IP budget (burst ${PUBLIC_AGENT_RATE_LIMIT},
refill 1/s). Responses carry \`RateLimit-*\` headers; a 429 includes
\`Retry-After\`.

## Errors

Errors are RFC 9457 Problem Details (\`application/problem+json\`) with a
stable \`code\` and a human \`resolution\`. Missing or invalid credentials
return \`401\` with \`WWW-Authenticate: Bearer realm="cartwright-api"\`;
insufficient scope returns \`403\`.

## More

- [\`llms.txt\`](${base}/llms.txt) — site overview for agents
- [OpenAPI 3.1](${base}/openapi.json) — the full typed contract
- [Developer docs](${base}/${brand.defaultLocale}/developers)

---
Canonical: ${base}/auth.md · Last updated: ${today}
`;

  void request;
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
