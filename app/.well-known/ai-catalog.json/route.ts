import { getBrand } from "@/lib/brand";
import {
  mcpPublicDisabledResponse,
  mcpPublicOptionsResponse,
} from "@/lib/tools/public-gate";

// /.well-known/ai-catalog.json — the store's ARD manifest (Agentic Resource
// Discovery 1.0, agenticresourcediscovery.org): `specVersion` + `host` + an
// `entries` array where every entry carries a domain-anchored `urn:air:`
// identifier, an IANA media type, exactly one of `url`|`data`, and a trust
// manifest whose `identity` aligns with the publisher domain. Complements the
// RFC 9727 api-catalog (linkset) with a plain-JSON shape agents parse without
// linkset tooling. Only lists surfaces that exist in the running profile —
// honest discovery, as always.
//
// The document must validate against the spec's JSON Schema (the copy
// Lighthouse's `ard-schema` audit runs is vendored at
// tests/fixtures/ard/ai-catalog.schema.json and checked by
// tests/unit/ai-catalog-ard-schema.test.ts). That schema is CLOSED where it
// matters: the root takes only `specVersion`/`host`/`entries`, `host` only its
// five named fields, and a `trustManifest` only identity/identityType/
// trustSchema/attestations/provenance/signature. A member outside those is not
// ignored — it fails the whole document. Entries are open, and an entry's
// `metadata` is the schema's slot for custom scalar extensions.
export const dynamic = "force-dynamic";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

// What RFC 3986 allows in a path besides pct-encoded octets: pchar and "/".
// WHATWG URL leaves "|", "[", "]" and a stray "%" unencoded in a path.
const NOT_IN_RFC3986_PATH = /%(?![0-9a-f]{2})|[^a-z0-9\-._~!$&'()*+,;=:@/%]/gi;

type SiteAddress = {
  /** Every URL's prefix: origin + path, no trailing slash. */
  base: string;
  /** The did:web identifier (host identifier and every trust manifest). */
  did: string;
  /** The `urn:air:<publisher>:…` segment. */
  publisher: string;
};

/**
 * The catalog's addresses, from `brand.url`.
 *
 * When `brand.url` parses as an http(s) URL, every URL is built from the
 * PARSED value, never the raw string: `new URL` punycodes an IDN host (the
 * setup-wizard domain "smørrebrød.dk" becomes "xn--smrrebrd-64af.dk"),
 * lowercases scheme and host, and drops userinfo, a default port, a query and
 * a fragment. A value with no scheme ("shop.example", or "shop.example:8443",
 * which `new URL` would read as the scheme "shop.example:") is read as https,
 * as lib/data-source/brand.ts does for the wizard's domain.
 *
 * - did:web percent-encodes a port's colon: "A port MAY be included and the
 *   colon MUST be percent encoded" (w3c-ccg.github.io/did-method-web), so
 *   "did:web:shop.example%3A8443"; "did:web:shop.example:8443" would resolve
 *   to the path /8443/did.json. (did:web also forbids IP hosts; an IP
 *   brand.url is local development only.)
 * - The URN publisher is the host name alone. ARD's pattern allows only
 *   [a-zA-Z0-9.-] there, so neither ":8443" (it would parse as a namespace)
 *   nor "%3A8443" fits.
 *
 * Anything that does not parse (empty, "https://" with no host, a space in
 * the host) has no address to publish. It keeps the old best effort, URLs
 * from the raw string and host from a manual strip, so this discovery
 * surface never 500s, but that document cannot be a valid one (a bare
 * "https://" passes the schema only with "https:/…" links that lead nowhere).
 * Nor can a host WHATWG URL accepts and RFC 3986 or the URN pattern does not
 * ("_", "{", '"'), or an IPv6 literal: its URLs are fine, but no URN
 * publisher can hold it.
 */
function siteAddress(raw: string): SiteAddress {
  const value = raw.trim();
  let url: URL | null = null;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    url = null;
  }
  if (url && (url.protocol === "https:" || url.protocol === "http:")) {
    const path = url.pathname
      .replace(/\/+$/, "")
      .replace(NOT_IN_RFC3986_PATH, (c) => encodeURIComponent(c));
    return {
      base: `${url.origin}${path}`,
      did: `did:web:${url.hostname}${url.port ? `%3A${url.port}` : ""}`,
      publisher: url.hostname,
    };
  }
  // The scheme is stripped before the trailing slashes, so a bare "https://"
  // names no host ("unconfigured.invalid") rather than the host "https".
  const host =
    value.replace(/^[a-z+]+:\/\//i, "").replace(/[/:?#].*$/, "") ||
    "unconfigured.invalid";
  return { base: raw.replace(/\/+$/, ""), did: `did:web:${host}`, publisher: host };
}

export async function GET(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse("/.well-known/ai-catalog.json");
  if (gated) return gated;

  const brand = await getBrand();
  const { base, did, publisher } = siteAddress(brand.url);
  // ARD requires `identity` to align with the publisher domain in the entry
  // identifier. Nothing else goes in here: attestations and a signature would
  // assert audits and a JWS this store does not have.
  const trustManifest = {
    identity: did,
    identityType: "did",
  };
  // The store's policy pages (all four resolve — they are the canonical trust
  // routes). They used to sit in the trust manifest, which the schema does not
  // allow; an entry's `metadata` does, so every entry carries them there.
  const metadata = {
    privacy: `${base}/${brand.defaultLocale}/privacy`,
    terms: `${base}/${brand.defaultLocale}/info/terms`,
    contact: `${base}/${brand.defaultLocale}/contact`,
    about: `${base}/${brand.defaultLocale}/about`,
  };
  const developersUrl = `${base}/${brand.defaultLocale}/developers`;
  const description = brand.metadata.description?.trim();
  const urn = (namespace: string, name: string) =>
    `urn:air:${publisher}:${namespace}:${name}`;
  const features = brand.features as { webMcp?: boolean };
  const entries = [
    {
      identifier: urn("doc", "llms-overview"),
      displayName: "Site overview for agents (llms.txt)",
      type: "text/markdown",
      url: `${base}/llms.txt`,
      ...(description ? { description } : {}),
      representativeQueries: [
        `what does ${brand.storeName} offer`,
        "how can an AI agent use this site",
      ],
    },
    {
      identifier: urn("api", "openapi"),
      displayName: "OpenAPI 3.1 contract for the tool API",
      type: "application/vnd.oai.openapi+json",
      url: `${base}/openapi.json`,
      representativeQueries: [
        "get the OpenAPI description of this site's tool API",
        "which REST endpoints does this site expose",
      ],
    },
    {
      identifier: urn("api", "tools"),
      displayName: "REST tool invocation surface",
      type: "application/json",
      url: `${base}/api/v1/tools`,
      representativeQueries: [
        "list the tools this site exposes",
        "call a site tool over REST",
      ],
    },
    {
      identifier: urn("mcp", "server"),
      displayName: "MCP server card (Streamable HTTP endpoint)",
      type: "application/mcp-server-card+json",
      url: `${base}/.well-known/mcp/server-card.json`,
      representativeQueries: [
        "connect an MCP client to this site",
        "which tools does this site's MCP server offer",
      ],
    },
    {
      identifier: urn("doc", "auth"),
      displayName: "API authentication guide",
      type: "text/markdown",
      url: `${base}/auth.md`,
      representativeQueries: [
        "how do I authenticate to this site's API",
        "which API key scopes does this site use",
      ],
    },
    {
      identifier: urn("doc", "agent-skills"),
      displayName: "Public Agent Skills index",
      type: "application/json",
      url: `${base}/.well-known/agent-skills/index.json`,
      representativeQueries: [
        "which Agent Skills does this site publish",
        `research ${brand.storeName} with an agent skill`,
      ],
    },
    {
      identifier: urn("doc", "sitemap"),
      displayName: "Sitemap",
      type: "application/xml",
      url: `${base}/sitemap.xml`,
      representativeQueries: [
        "list every public page on this site",
        `find a page on ${brand.storeName}`,
      ],
    },
    {
      identifier: urn("doc", "developers"),
      displayName: "Developer documentation",
      type: "text/html",
      url: developersUrl,
      representativeQueries: [
        "developer documentation for this site's API",
        "rate limits and error format of this site's API",
      ],
    },
    ...(brand.ecommerceEnabled
      ? [
          {
            identifier: urn("doc", "pricing"),
            displayName: "Machine-readable pricing model",
            type: "text/markdown",
            url: `${base}/pricing.md`,
            representativeQueries: [
              `what do ${brand.storeName}'s products cost`,
              "which currency are prices quoted in",
            ],
          },
        ]
      : []),
    ...(features.webMcp
      ? [
          {
            identifier: urn("doc", "webmcp-tools"),
            displayName: "WebMCP in-browser tool inventory",
            type: "text/html",
            url: `${base}/${brand.defaultLocale}/webmcp-check`,
            representativeQueries: [
              "which in-browser tools does this store expose to agents",
              "add a product to the cart from the page",
            ],
          },
        ]
      : []),
  ];

  return Response.json(
    {
      specVersion: "1.0",
      host: {
        displayName: brand.storeName,
        identifier: did,
        documentationUrl: developersUrl,
        trustManifest,
      },
      entries: entries.map((entry) => ({ ...entry, metadata, trustManifest })),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function OPTIONS(): Promise<Response> {
  const gated = await mcpPublicDisabledResponse("/.well-known/ai-catalog.json");
  if (gated) return gated;
  return mcpPublicOptionsResponse(ALLOWED_METHODS);
}
