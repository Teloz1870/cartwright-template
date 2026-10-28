import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/.well-known/ai-catalog.json` validates against the ARD JSON Schema — the
 * copy Lighthouse 13.5.0's `ard-schema` audit runs, vendored at
 * tests/fixtures/ard/ai-catalog.schema.json (modified only by an added
 * `$comment`; Apache-2.0, LICENSE beside it).
 *
 * Why this exists: the route used to carry root `name`/`description`/
 * `trustManifest`/`resources` and policy links inside each entry's
 * `trustManifest`, on the belief that ARD ignores unknown members. The schema
 * is closed (`additionalProperties: false` on the root, `host` and
 * `trustManifest`), so Lighthouse scored every canary 0. A test that only
 * checked the members we meant to send could not see the ones we should not.
 *
 * ajv is not resolvable from this tree (only a nested transitive copy, and a
 * scaffold may not have even that), so the schema is interpreted by the small
 * validator below. It implements the keywords the vendored schema uses with
 * the semantics Lighthouse's precompiled ajv 2020 validator has — own members
 * only, and the two formats ported from the ajv-formats `fullFormats`
 * Lighthouse imports — and THROWS on any other keyword or format, so a
 * refreshed schema that adds one fails loudly instead of passing silently.
 */

const SCHEMA_PATH = path.resolve(__dirname, "../fixtures/ard/ai-catalog.schema.json");
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Schema;

type Schema = { [keyword: string]: unknown };

const ANNOTATIONS = ["$schema", "$id", "$comment", "$defs", "title", "description"];
const ASSERTIONS = [
  "type",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "pattern",
  "format",
  "oneOf",
  "not",
  "$ref",
];
const KNOWN = new Set([...ANNOTATIONS, ...ASSERTIONS]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function matchesType(type: string, v: unknown): boolean {
  switch (type) {
    case "object":
      return isObject(v);
    case "array":
      return Array.isArray(v);
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return Number.isInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "null":
      return v === null;
    default:
      throw new Error(`validator does not know JSON type "${type}"`);
  }
}

// ---------------------------------------------------------------------------
// The two formats Lighthouse compiles in, ported from ajv-formats 3.0.1
// (dist/formats.js, MIT, Copyright (c) 2020 Evgeny Poberezkin): Lighthouse's
// third-party/ard/schema-validator.js imports `fullFormats` from
// 'ajv-formats/dist/formats.js' and uses `fullFormats.uri` and
// `fullFormats["date-time"]`. Copied, not imported: ajv-formats is not a
// dependency of this project and a scaffold may not have it at all. Keep the
// two expressions below byte-for-byte equal to that file when refreshing.
//
// fullFormats.uri — RFC 3986 `URI` (jmrware.com URI_regex) plus "contains '/'
// or ':'". Not WHATWG `new URL()`: that accepts "{", "|", "%zz", "\" and a
// non-ASCII host, all of which make Lighthouse score 0.
const NOT_URI_FRAGMENT = /\/|:/;
const URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
const isUri = (str: string) => NOT_URI_FRAGMENT.test(str) && URI.test(str);

// fullFormats["date-time"] = getDateTime(true): RFC 3339 full-date, "T"/"t"
// or whitespace, then a time WITH a zone offset; leap seconds allowed.
const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
const DATE_TIME_SEPARATOR = /t|\s/i;
const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
function isDate(str: string): boolean {
  const matches = DATE.exec(str);
  if (!matches) return false;
  const year = +matches[1];
  const month = +matches[2];
  const day = +matches[3];
  return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
}
function isStrictTime(str: string): boolean {
  const matches = TIME.exec(str);
  if (!matches) return false;
  const hr = +matches[1];
  const min = +matches[2];
  const sec = +matches[3];
  const tz = matches[4];
  const tzSign = matches[5] === "-" ? -1 : 1;
  const tzH = +(matches[6] || 0);
  const tzM = +(matches[7] || 0);
  if (tzH > 23 || tzM > 59 || !tz) return false;
  if (hr <= 23 && min <= 59 && sec < 60) return true;
  // leap second
  const utcMin = min - tzM * tzSign;
  const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
  return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
}
function isDateTime(str: string): boolean {
  const dateTime = str.split(DATE_TIME_SEPARATOR);
  return dateTime.length === 2 && isDate(dateTime[0]) && isStrictTime(dateTime[1]);
}

function matchesFormat(format: string, v: string): boolean {
  if (format === "uri") return isUri(v);
  if (format === "date-time") return isDateTime(v);
  throw new Error(`validator does not implement format "${format}"`);
}
// ---------------------------------------------------------------------------

function resolveRef(ref: string): Schema {
  if (!ref.startsWith("#/")) throw new Error(`validator only resolves local refs, got ${ref}`);
  let node: unknown = schema;
  for (const raw of ref.slice(2).split("/")) {
    // RFC 6901 JSON Pointer, inside a URI fragment.
    const part = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    node = isObject(node) && Object.hasOwn(node, part) ? node[part] : undefined;
  }
  if (!isObject(node)) throw new Error(`unresolvable $ref ${ref}`);
  return node;
}

/** Every violation as `<path>: <reason>`; an empty list means valid. */
function validate(s: Schema, v: unknown, at = "root"): string[] {
  for (const keyword of Object.keys(s)) {
    if (!KNOWN.has(keyword)) {
      throw new Error(`validator does not implement keyword "${keyword}" (at ${at}) — extend it first`);
    }
  }
  const errors: string[] = [];
  if (typeof s.$ref === "string") errors.push(...validate(resolveRef(s.$ref), v, at));
  if (s.type !== undefined) {
    const types = (Array.isArray(s.type) ? s.type : [s.type]) as string[];
    if (!types.some((t) => matchesType(t, v))) return [...errors, `${at}: must be ${types.join("|")}`];
  }
  if (Array.isArray(s.enum)) {
    // ajv compares enum members by deep equality; `includes` is the same
    // thing only for scalars, which is all this schema lists.
    if (s.enum.some((member) => typeof member === "object" && member !== null)) {
      throw new Error(`validator only implements scalar enum members (at ${at})`);
    }
    if (!s.enum.includes(v)) errors.push(`${at}: must be one of ${JSON.stringify(s.enum)}`);
  }
  if (typeof v === "string") {
    if (typeof s.pattern === "string" && !new RegExp(s.pattern, "u").test(v)) {
      errors.push(`${at}: must match ${s.pattern}`);
    }
    if (typeof s.format === "string" && !matchesFormat(s.format, v)) {
      errors.push(`${at}: must be a ${s.format}`);
    }
  }
  if (Array.isArray(v)) {
    if (typeof s.minItems === "number" && v.length < s.minItems) errors.push(`${at}: fewer than ${s.minItems} items`);
    if (typeof s.maxItems === "number" && v.length > s.maxItems) errors.push(`${at}: more than ${s.maxItems} items`);
    if (s.items !== undefined) {
      if (!isObject(s.items)) throw new Error(`validator only implements a schema-object "items" (at ${at})`);
      v.forEach((item, i) => errors.push(...validate(s.items as Schema, item, `${at}[${i}]`)));
    }
  }
  if (isObject(v)) {
    // Own members only. `key in properties` would walk the prototype chain,
    // so a member named "toString" or "constructor" would count as declared
    // (Lighthouse's ajv compares each key against the property names). For
    // `required`, ajv tests `data.key === undefined`; on parsed JSON that is
    // Object.hasOwn for every name not on Object.prototype, and this schema
    // requires none — a refreshed one that does fails here first.
    for (const key of (s.required as string[] | undefined) ?? []) {
      if (key in Object.prototype) throw new Error(`validator does not model required "${key}" (at ${at})`);
      if (!Object.hasOwn(v, key)) errors.push(`${at}: missing required "${key}"`);
    }
    const properties = (s.properties as Record<string, Schema> | undefined) ?? {};
    for (const [key, value] of Object.entries(v)) {
      if (Object.hasOwn(properties, key)) {
        errors.push(...validate(properties[key], value, `${at}.${key}`));
      } else if (s.additionalProperties === false) {
        errors.push(`${at}: must NOT have additional property "${key}"`);
      } else if (isObject(s.additionalProperties)) {
        errors.push(...validate(s.additionalProperties, value, `${at}.${key}`));
      }
    }
  }
  if (Array.isArray(s.oneOf)) {
    const passing = (s.oneOf as Schema[]).filter((branch) => validate(branch, v, at).length === 0).length;
    if (passing !== 1) errors.push(`${at}: must match exactly one oneOf branch (matched ${passing})`);
  }
  if (isObject(s.not) && validate(s.not, v, at).length === 0) errors.push(`${at}: must NOT match the "not" schema`);
  return errors;
}

const mocks = vi.hoisted(() => ({
  brand: {
    url: "https://shop.example",
    storeName: "Test Shop",
    defaultLocale: "en",
    metadata: { description: "A test shop" },
    ecommerceEnabled: true,
    features: { mcpPublic: true } as Record<string, boolean>,
  },
}));

vi.mock("@/lib/brand", () => ({
  getBrand: async () => mocks.brand,
  getFeatureGateState: async () => ({ available: true, features: { mcpPublic: true } }),
}));

type Catalog = {
  host: { identifier: string; documentationUrl: string; trustManifest: { identity: string } };
  entries: Array<Record<string, unknown> & { identifier: string; url: string; trustManifest: { identity: string } }>;
};

async function catalog(): Promise<Catalog> {
  const route = await import("@/app/.well-known/ai-catalog.json/route");
  const response = await route.GET();
  expect(response.status).toBe(200);
  return response.json();
}

beforeEach(() => {
  mocks.brand.url = "https://shop.example";
  mocks.brand.ecommerceEnabled = true;
  mocks.brand.features = { mcpPublic: true };
});

describe("the vendored ARD schema and its validator", () => {
  it("is the schema Lighthouse's ard-schema audit uses", () => {
    expect(schema.$id).toBe(
      "https://raw.githubusercontent.com/ards-project/ard-spec/main/spec/schemas/ai-catalog.schema.json",
    );
    expect(schema.additionalProperties).toBe(false);
  });

  it("rejects the shape the route used to serve (so a pass below means something)", () => {
    const entry = {
      identifier: "urn:air:shop.example:doc:sitemap",
      displayName: "Sitemap",
      type: "application/xml",
      url: "https://shop.example/sitemap.xml",
    };
    // Root members outside specVersion/host/entries.
    expect(validate(schema, { specVersion: "1.0", entries: [entry], name: "Test Shop" })).toEqual([
      'root: must NOT have additional property "name"',
    ]);
    expect(validate(schema, { specVersion: "1.0", entries: [entry], resources: [] })).toHaveLength(1);
    // A policy link inside an entry's trust manifest.
    const withPolicyInTrust = {
      ...entry,
      trustManifest: { identity: "did:web:shop.example", contact: "https://shop.example/en/contact" },
    };
    expect(validate(schema, { specVersion: "1.0", entries: [withPolicyInTrust] })).toEqual([
      'root.entries[0].trustManifest: must NOT have additional property "contact"',
    ]);
    // Both url and data on one entry.
    expect(validate(schema, { specVersion: "1.0", entries: [{ ...entry, data: {} }] })).not.toEqual([]);
  });

  it("agrees with ajv-formats' full `uri` format, not with WHATWG URL", () => {
    // Verdicts measured with ajv-formats 3.0.1 `fullFormats.uri` (the copy
    // Lighthouse 13.5.0 ships) on 2026-10-24.
    const measured: Array<[string, boolean]> = [
      ["https://shop.example/llms.txt", true],
      ["https://shop.example:8443/en/developers", true],
      ["http://localhost:3000/llms.txt", true],
      ["http://[::1]:3000/llms.txt", true],
      ["https://xn--smrrebrd-64af.dk/da/developers", true],
      ["https://shop.example/%C3%A6", true],
      ["urn:air:shop.example:doc:x", true],
      ["mailto:shop@shop.example", true],
      ["https:/da/developers", true],
      ["https://", true],
      ["shop.example:8443/llms.txt", true],
      ["https://shop.example/{pricing}.md", false],
      ["https://smørrebrød.dk/da/developers", false],
      ["https://shop.example/udviklere-æøå", false],
      ["https://my shop.dk/llms.txt", false],
      ["https://shop.example/%zz", false],
      ["https://shop.example/a|b", false],
      ["https://shop.example\\x", false],
      ["https://shop.example/a[b]", false],
      ["/da/developers", false],
      ["shop.example/llms.txt", false],
      ["", false],
    ];
    expect(measured.map(([s]) => [s, matchesFormat("uri", s)])).toEqual(measured);
  });

  it("agrees with ajv-formats' full `date-time` format", () => {
    // Measured like the `uri` corpus above, with `fullFormats["date-time"]`.
    const measured: Array<[string, boolean]> = [
      ["2026-10-24T09:00:00Z", true],
      ["2026-10-24t09:00:00.123+02:00", true],
      ["2026-10-24 09:00:00Z", true],
      ["2024-02-29T00:00:00Z", true],
      ["2026-12-31T23:59:60Z", true],
      ["2026-10-24T09:00:00", false],
      ["2026-02-29T00:00:00Z", false],
      ["2026-10-24T24:00:00Z", false],
      ["2026-10-24", false],
    ];
    expect(measured.map(([s]) => [s, matchesFormat("date-time", s)])).toEqual(measured);
  });

  it("rejects an entry url that is not an RFC 3986 URI (a `{pricing}` placeholder, a non-ASCII host)", () => {
    const entry = {
      identifier: "urn:air:shop.example:doc:pricing",
      displayName: "Pricing",
      type: "text/markdown",
    };
    for (const url of ["https://shop.example/{pricing}.md", "https://smørrebrød.dk/pricing.md"]) {
      expect(validate(schema, { specVersion: "1.0", entries: [{ ...entry, url }] }), url).toEqual([
        "root.entries[0].url: must be a uri",
      ]);
    }
  });

  it("counts a member named after an Object.prototype key as a member", () => {
    // JSON.parse makes these own members, exactly as a fetched document has them.
    const doc = (json: string) => validate(schema, JSON.parse(json));
    const entry = '{"identifier":"urn:air:shop.example:doc:x","displayName":"X","type":"text/html","url":"https://shop.example/x"';
    expect(doc(`{"specVersion":"1.0","entries":[${entry},"trustManifest":{"identity":"did:web:shop.example","toString":"x"}}]}`)).toEqual([
      'root.entries[0].trustManifest: must NOT have additional property "toString"',
    ]);
    expect(doc('{"specVersion":"1.0","entries":[],"constructor":1}')).toEqual([
      'root: must NOT have additional property "constructor"',
    ]);
    expect(doc('{"specVersion":"1.0","entries":[],"host":{"displayName":"a","valueOf":"b"}}')).toEqual([
      'root.host: must NOT have additional property "valueOf"',
    ]);
    // A schema requiring a name Object.prototype also has is where own-member
    // semantics and ajv's `data.key === undefined` part ways: not modelled.
    expect(() => validate({ type: "object", required: ["constructor"] }, {})).toThrow(
      /does not model required "constructor"/,
    );
  });
});

describe("/.well-known/ai-catalog.json validates against the ARD schema", () => {
  const cases = [
    { mode: "webshop", ecommerceEnabled: true, webMcp: false },
    { mode: "webshop", ecommerceEnabled: true, webMcp: true },
    { mode: "website", ecommerceEnabled: false, webMcp: false },
    { mode: "website", ecommerceEnabled: false, webMcp: true },
  ];

  it.each(cases)("$mode mode, webMcp $webMcp", async ({ ecommerceEnabled, webMcp }) => {
    mocks.brand.ecommerceEnabled = ecommerceEnabled;
    mocks.brand.features = { mcpPublic: true, webMcp };
    const body = await catalog();

    expect(validate(schema, body)).toEqual([]);

    // Beyond the schema, Lighthouse flags (Low) an entry without 2–5
    // representativeQueries. Every entry carries them, so the only Low left
    // is the audit's short list of "standard discovery" media types.
    for (const entry of body.entries) {
      expect(entry.representativeQueries, String(entry.identifier)).toEqual(expect.any(Array));
    }
    const ids = body.entries.map((e) => e.identifier);
    expect(ids.includes("urn:air:shop.example:doc:pricing")).toBe(ecommerceEnabled);
    expect(ids.includes("urn:air:shop.example:doc:webmcp-tools")).toBe(webMcp);
  });
});

describe("/.well-known/ai-catalog.json for every brand.url shape that is an address", () => {
  // `brand.url` comes from brand.config.ts, NEXT_PUBLIC_APP_URL / VERCEL_URL,
  // or the setup wizard's domain field (z.string().max(120), no IDNA). Every
  // shape that names a host must yield a document Lighthouse accepts.
  const shapes: Array<{ url: string; base: string; did: string; publisher: string }> = [
    { url: "https://shop.example", base: "https://shop.example", did: "did:web:shop.example", publisher: "shop.example" },
    { url: "https://shop.example/", base: "https://shop.example", did: "did:web:shop.example", publisher: "shop.example" },
    { url: "HTTPS://Shop.Example", base: "https://shop.example", did: "did:web:shop.example", publisher: "shop.example" },
    { url: "https://user@shop.example", base: "https://shop.example", did: "did:web:shop.example", publisher: "shop.example" },
    { url: "https://shop.example/da", base: "https://shop.example/da", did: "did:web:shop.example", publisher: "shop.example" },
    // A setup-wizard IDN domain: lib/data-source/brand.ts prefixes https://
    // and nothing punycodes it on the way.
    {
      url: "https://smørrebrød.dk",
      base: "https://xn--smrrebrd-64af.dk",
      did: "did:web:xn--smrrebrd-64af.dk",
      publisher: "xn--smrrebrd-64af.dk",
    },
    // did:web: "A port MAY be included and the colon MUST be percent encoded"
    // (w3c-ccg.github.io/did-method-web). The URN publisher allows only
    // [a-zA-Z0-9.-], so the port is not part of it.
    {
      url: "https://shop.example:8443",
      base: "https://shop.example:8443",
      did: "did:web:shop.example%3A8443",
      publisher: "shop.example",
    },
    { url: "http://localhost:3000", base: "http://localhost:3000", did: "did:web:localhost%3A3000", publisher: "localhost" },
    // No scheme: read as https, as lib/data-source/brand.ts does for a domain.
    { url: "shop.example", base: "https://shop.example", did: "did:web:shop.example", publisher: "shop.example" },
    {
      url: "shop.example:8443",
      base: "https://shop.example:8443",
      did: "did:web:shop.example%3A8443",
      publisher: "shop.example",
    },
    // A path character WHATWG URL leaves alone but RFC 3986 does not allow.
    { url: "https://shop.example/a|b", base: "https://shop.example/a%7Cb", did: "did:web:shop.example", publisher: "shop.example" },
  ];

  it.each(shapes)("$url", async ({ url, base, did, publisher }) => {
    mocks.brand.url = url;
    mocks.brand.features = { mcpPublic: true, webMcp: true };
    const body = await catalog();

    expect(validate(schema, body)).toEqual([]);
    expect(body.host.identifier).toBe(did);
    expect(body.host.trustManifest.identity).toBe(did);
    expect(body.host.documentationUrl).toBe(`${base}/en/developers`);
    const urn = new RegExp(`^urn:air:${publisher.replace(/\./g, "\\.")}:(doc|api|mcp):[a-z-]+$`);
    for (const entry of body.entries) {
      expect(entry.identifier).toMatch(urn);
      expect(entry.url.startsWith(`${base}/`), entry.url).toBe(true);
      expect(entry.trustManifest.identity).toBe(did);
    }
  });

  it("still answers when brand.url names no host at all (best effort, documented)", async () => {
    // Empty, a scheme with no host, a space in the host: there is no address
    // to publish, so the document cannot be a valid one (Lighthouse scores
    // "" and the space 0; "https://" yields "https:/…" URLs, which RFC 3986
    // happens to accept). The surface must still not 500, and must not
    // invent a host: one that names none says so.
    for (const [url, did] of [
      ["", "did:web:unconfigured.invalid"],
      ["https://", "did:web:unconfigured.invalid"],
      ["https://my shop.dk", "did:web:my shop.dk"],
    ]) {
      mocks.brand.url = url;
      const body = await catalog();
      expect(body.host.identifier, url).toBe(did);
    }
  });
});
