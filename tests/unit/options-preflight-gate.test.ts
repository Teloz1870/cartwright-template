import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";

/**
 * `OPTIONS` must never be the one verb that admits a gated route exists.
 *
 * Next installs a substitute `OPTIONS` for any route module that exports none,
 * and that substitute never reaches the route's gate — #429 and the
 * `agentic-options-gate` suite closed that on the a2a / acp / feed / oauth /
 * mcp surfaces by hand-writing gate-aware handlers. Two flag-gated discovery
 * surfaces were missed and kept a hand-written preflight that answered BEFORE
 * the gate. Measured live on 2026-09-03:
 *
 *   demo.cartwright.app/api/look        OPTIONS 204   GET 404
 *   demo.cartwright.app/api/registry    OPTIONS 204   GET 404
 *   teloz-showcase…/api/look            OPTIONS 204   GET 404
 *   teloz-showcase…/api/registry        OPTIONS 204   GET 404
 *
 * A hand-written unconditional preflight is a STRONGER tell than exporting
 * none: it announces a live sharing endpoint / component registry on a shop
 * whose every real verb says `404`.
 *
 * They were missed because the sweep that found the others grepped
 * `export async function OPTIONS`, and both of these were written
 * `export function OPTIONS` — sync. So this file does not grep for one
 * spelling. It DERIVES the inventory from the tree and recognises every way a
 * route module can serve a preflight:
 *
 *   1. `export function OPTIONS`  /  `export async function OPTIONS`
 *   2. `export const OPTIONS = …` (arrow or function expression)
 *   3. `export { OPTIONS } from "…"` — a thin mount over another route
 *
 * Form 3 is not hypothetical: three `.well-known` mounts use it today, and the
 * first cut of this file missed all three.
 *
 * **The classification is "can this handler produce more than one answer?"**,
 * not "does it contain an `if`". An `if`-only check failed in both directions,
 * both proved by mutation while this file was being written:
 *   - it passed a handler whose gate had been DELETED, because the words
 *     `if (` survived in a comment describing the gate that used to be there;
 *   - it failed the `??` form the `.well-known` surfaces are free to use
 *     (`return (await disabled(…)) ?? allow(…)`), which is a correct gate.
 * So comments and string literals are stripped first, and a gated handler
 * qualifies by having a second `return`, a `??`, or an `if` — any shape that
 * lets it refuse. The four unconditional ones must have none of them.
 */

const ROOT = join(__dirname, "..", "..");

/** Locally defined: `export [async] function OPTIONS` / `export const OPTIONS`. */
const OPTIONS_LOCAL = /export\s+(?:async\s+)?(?:function|const)\s+OPTIONS\b/;
/**
 * Re-exported from another module: `export { …, OPTIONS, … } from "<spec>"`.
 * Detection runs on the literal-stripped source (so a commented-out re-export
 * does not count), but the module specifier IS a string literal — stripping
 * blanks it — so the specifier is read back off the raw source.
 */
const OPTIONS_REEXPORT = /export\s*\{[^}]*\bOPTIONS\b[^}]*\}\s*from\s/;
const OPTIONS_REEXPORT_SPEC =
  /export\s*\{[^}]*\bOPTIONS\b[^}]*\}\s*from\s*["']([^"']+)["']/;
/**
 * The remaining two ways a module can end up serving someone else's handler:
 * a bare `export { OPTIONS }` (imported above) and a blanket `export * from`.
 * Neither is used in `app/` today. They are matched anyway because "no route
 * spells it that way" is exactly the assumption that let the original miss
 * happen — a module in either form would otherwise sit outside the inventory
 * and keep this file green.
 */
const OPTIONS_BARE_EXPORT = /export\s*\{[^}]*\bOPTIONS\b[^}]*\}\s*;/;
const OPTIONS_STAR_EXPORT = /export\s*\*\s*(?:as\s+\w+\s*)?from\s/;

/**
 * Comments and string/template literals removed, positions preserved as
 * spaces. Both the export detectors and the brace balancer read THIS, never
 * the raw source: a `{` inside a string desynchronises the balancer, and — the
 * defect that made the first version of this guard useless — a commented-out
 * `if (` satisfied the gate check on a route whose gate had been removed.
 *
 * Regex literals ARE lexed, and quoted strings stop at a newline. Both are
 * load-bearing, not tidiness: a regex holding a quote (`/["']/`) used to start
 * a "string" that ran to the next quote anywhere in the file, blanking real
 * code — and if that swallowed an `export function OPTIONS`, the module simply
 * dropped out of the sweep with the suite still green. A silent drop from a
 * completeness guard is the one failure it must not have.
 */
function stripLiterals(src: string): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  /** The last non-whitespace character before `i`, in the ORIGINAL source. */
  const before = (i: number) => {
    for (let k = i - 1; k >= 0; k--) {
      if (!/\s/.test(src[k])) return src[k];
    }
    return "";
  };
  // A `/` opens a regex only where a value may begin; after an identifier,
  // `)` or `]` it is division.
  const VALUE_POSITION = /[(,=:[!&|?{};+\-*%~^<>]/;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && VALUE_POSITION.test(before(i))) {
      let k = i + 1;
      let inClass = false;
      while (k < src.length && src[k] !== "\n") {
        if (src[k] === "\\") {
          k += 2;
        } else if (src[k] === "[") {
          inClass = true;
          k++;
        } else if (src[k] === "]") {
          inClass = false;
          k++;
        } else if (src[k] === "/" && !inClass) {
          break;
        } else {
          k++;
        }
      }
      if (k < src.length && src[k] === "/") {
        blank(i, k + 1);
        i = k + 1;
      } else {
        i++; // not a regex after all
      }
    } else if (c === '"' || c === "'") {
      // Newline-bounded: an unterminated quote must not swallow the rest of
      // the file. (A regex holding a quote used to do exactly that, and could
      // erase an `export function OPTIONS` — a SILENT drop from the sweep.)
      let k = i + 1;
      while (k < src.length && src[k] !== c && src[k] !== "\n") {
        k += src[k] === "\\" ? 2 : 1;
      }
      blank(i, Math.min(k + 1, src.length));
      i = k + 1;
    } else if (c === "`") {
      // Blank the literal chunks; KEEP every `${…}` expression — it is real
      // code, and blanking it would unbalance the braces around it.
      let k = i + 1;
      let chunk = i;
      while (k < src.length) {
        if (src[k] === "\\") k += 2;
        else if (src[k] === "`") break;
        else if (src[k] === "$" && src[k + 1] === "{") {
          blank(chunk, k);
          let depth = 1;
          k += 2;
          while (k < src.length && depth > 0) {
            if (src[k] === "{") depth++;
            else if (src[k] === "}") depth--;
            k++;
          }
          chunk = k;
        } else k++;
      }
      blank(chunk, Math.min(k + 1, src.length));
      i = k + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

const sourceOf = (rel: string) =>
  stripLiterals(readFileSync(join(ROOT, rel), "utf8"));

/**
 * Every route module under `app/`, walked with `readdirSync` rather than a
 * glob ON PURPOSE: a `**` wildcard does not descend into dot-directories, and
 * `app/.well-known/` holds seven of the gated preflights. Measured — the
 * glob-based first cut silently returned 22 of the 29 local handlers.
 *
 * `route.static.ts` is the site profile's static variant of a route; it ships
 * no preflight today, and listing it here is precisely so that stops being an
 * assumption.
 */
const ROUTE_FILES = new Set([
  "route.ts",
  "route.tsx",
  "route.js",
  "route.jsx",
  "route.mjs",
  "route.cjs",
  "route.static.ts",
  "route.static.tsx",
]);

/** Generated output, not authored routes. */
const SKIP_DIRS = new Set(["node_modules", "generated"]);

function routeModules(dir = "app"): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...routeModules(rel));
    } else if (ROUTE_FILES.has(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Route modules in THIS tree that serve a preflight, in any of the 3 forms. */
function sweep(): string[] {
  return routeModules()
    .filter((rel) => {
      const src = sourceOf(rel);
      return (
        OPTIONS_LOCAL.test(src) ||
        OPTIONS_REEXPORT.test(src) ||
        OPTIONS_BARE_EXPORT.test(src) ||
        OPTIONS_STAR_EXPORT.test(src)
      );
    })
    .sort();
}

/**
 * Where the locally defined `OPTIONS` handler's own block starts and ends.
 * The parameter list is balanced FIRST — otherwise a destructured parameter
 * (`function OPTIONS(req, { params })`) hands the balancer the pattern instead
 * of the body, and the guard silently reads code that is not the handler.
 */
function locateOptions(rel: string, src: string) {
  const m = OPTIONS_LOCAL.exec(src);
  if (!m) throw new Error(`${rel}: no locally defined OPTIONS`);
  const paren = src.indexOf("(", m.index);
  if (paren === -1) throw new Error(`${rel}: unreadable OPTIONS signature`);
  let depth = 0;
  let close = -1;
  for (let i = paren; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close === -1) throw new Error(`${rel}: unbalanced OPTIONS parameters`);
  // The first `{` after the parameter list is NOT always the body: a return
  // type may hold one (`function OPTIONS(): Promise<{ ok: boolean }> {`), and
  // taking it would make the guard read a type as if it were the handler.
  // Skip anything nested inside `<…>`; `=>` is not a closing angle bracket.
  let angle = 0;
  let open = -1;
  for (let i = close + 1; i < src.length; i++) {
    if (src[i] === "<") angle++;
    else if (src[i] === ">" && src[i - 1] !== "=") angle = Math.max(0, angle - 1);
    else if (src[i] === "{" && angle === 0) {
      open = i;
      break;
    }
  }
  const arrow = src.indexOf("=>", close);
  const isArrow = /\bconst\b/.test(m[0]);
  if (
    open === -1 ||
    (isArrow && arrow !== -1 && src.slice(arrow + 2, open).trim() !== "")
  ) {
    // An implicit-return arrow has no body block to slice, so the balancer
    // would latch onto the next `{` in the file and read the wrong code.
    throw new Error(
      `${rel}: write OPTIONS with a braced body — this guard reads the handler's own block`,
    );
  }
  depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) {
      return { declStart: m.index, bodyStart: open, bodyEnd: i + 1 };
    }
  }
  throw new Error(`${rel}: unbalanced OPTIONS body`);
}

/** The handler's own source (literals stripped). */
function optionsBody(rel: string): string {
  const src = sourceOf(rel);
  const at = locateOptions(rel, src);
  return src.slice(at.bodyStart, at.bodyEnd);
}

/**
 * Bare calls — `foo(`, never `x.foo(` — minus the primitives every handler
 * uses to build a response. What is left is the module's own machinery.
 */
const BARE_CALL = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
const NOT_MACHINERY = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "typeof",
  "await",
  "function",
  "Response",
  "NextResponse",
  "Headers",
  "URL",
  "URLSearchParams",
  "JSON",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Array",
  "Promise",
  "Set",
  "Map",
  "Error",
]);

function bareCalls(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(BARE_CALL)) {
    if (!NOT_MACHINERY.has(m[1])) out.add(m[1]);
  }
  return out;
}

/**
 * The gate machinery the preflight SHARES with the module's real verbs.
 *
 * This is the load-bearing check, and it replaced a purely structural one that
 * failed open. "Contains an `if`, a second `return`, or a `??`" is satisfied by
 * any of those on anything at all — and the idiom is already in this tree
 * (`app/api/v1/tools/route.ts` reads `request?.nextUrl.pathname ?? "…"` in its
 * preflight). Proved by mutation: deleting the real gate from a `.well-known`
 * handler and leaving only such an expression left the whole suite green while
 * the route answered `204` with `mcpPublic` off.
 *
 * Sharing a call is what a gate actually looks like: every gated preflight in
 * this tree calls the same helper its `GET` calls — `mcpPublicDisabledResponse`,
 * `acpDisabledResponse`, `a2aDisabledResponse`, `ucpDisabledResponse`,
 * `gatedNotFound`/`getBrand`, `guard`, `getFeatures`. A preflight-only helper
 * such as `allowResponse` or `mcpPublicOptionsResponse` is by construction NOT
 * shared, so a handler that only builds an allow-response cannot qualify.
 */
function sharedGateCalls(rel: string): Set<string> {
  const src = sourceOf(rel);
  const at = locateOptions(rel, src);
  const inside = bareCalls(src.slice(at.bodyStart, at.bodyEnd));
  const outside = bareCalls(
    src.slice(0, at.declStart) + src.slice(at.bodyEnd),
  );
  return new Set([...inside].filter((c) => outside.has(c)));
}

/**
 * Can this handler answer in more than one way? A second `return`, a `??`
 * fallback, or an `if`. Necessary but NOT sufficient — see `sharedGateCalls`.
 */
function canRefuse(body: string): boolean {
  const returns = body.match(/\breturn\b/g)?.length ?? 0;
  return returns > 1 || /\?\?/.test(body) || /\bif\s*\(/.test(body);
}

/** The module a thin mount re-exports its preflight from, as a repo path. */
function reexportTarget(rel: string): string {
  if (!OPTIONS_REEXPORT.test(sourceOf(rel))) {
    throw new Error(`${rel}: no OPTIONS re-export`);
  }
  const m = OPTIONS_REEXPORT_SPEC.exec(readFileSync(join(ROOT, rel), "utf8"));
  if (!m) throw new Error(`${rel}: unreadable OPTIONS re-export specifier`);
  const spec = m[1];
  const base = spec.startsWith(".")
    ? join(rel, "..", spec).split("\\").join("/")
    : spec.replace(/^@\//, "");
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    if (existsSync(join(ROOT, base + ext))) return base + ext;
  }
  return `${base}.ts`;
}

/**
 * Route modules that serve a preflight, classified. Derived from the tree on
 * 2026-09-03 and re-derived on every run by the sweep below — a new one is
 * red, not silent.
 *
 * GATED: can refuse, so a shut gate reaches the answer.
 */
const GATED: readonly string[] = [
  "app/.well-known/agent-skills/index.json/route.ts",
  "app/.well-known/agent-skills/public-site-research/SKILL.md/route.ts",
  "app/.well-known/ai-catalog.json/route.ts",
  "app/.well-known/api-catalog/route.ts",
  "app/.well-known/mcp.json/route.ts",
  "app/.well-known/oauth-authorization-server/route.ts",
  "app/.well-known/oauth-protected-resource/route.ts",
  "app/api/acp/feed/route.ts",
  "app/api/acp/v1/checkout_sessions/[id]/cancel/route.ts",
  "app/api/acp/v1/checkout_sessions/[id]/complete/route.ts",
  "app/api/acp/v1/checkout_sessions/[id]/route.ts",
  "app/api/acp/v1/checkout_sessions/route.ts",
  "app/api/agent-card/route.ts",
  "app/api/escrow/verify/route.ts",
  "app/api/look/route.ts",
  "app/api/mcp/route.ts",
  "app/api/negotiate/route.ts",
  "app/api/registry/[[...path]]/route.ts",
  "app/api/ucp/orders/route.ts",
  "app/api/v1/tools/[name]/route.ts",
  "app/api/v1/tools/route.ts",
  "app/feed/google.xml/route.ts",
  "app/oauth/register/route.ts",
  "app/oauth/revoke/route.ts",
  "app/oauth/token/route.ts",
];

/**
 * UNCONDITIONAL: no gate to read.
 * - `app/api/route.ts` and both `openapi.json` aliases are always served.
 * - `app/api/[...unknown]/route.ts` is the catch-all every unknown `/api` path
 *   falls to. It answers IDENTICALLY for all of them, so it carries no
 *   information about which routes this shop actually has.
 */
const UNCONDITIONAL: readonly string[] = [
  "app/api/[...unknown]/route.ts",
  "app/api/openapi.json/route.ts",
  "app/api/route.ts",
  "app/openapi.json/route.ts",
];

/** REEXPORTED: thin mounts that serve another entry's already-gated handler. */
const REEXPORTED: readonly string[] = [
  "app/.well-known/agent-card.json/route.ts",
  "app/.well-known/mcp/route.ts",
  "app/.well-known/mcp/server-card.json/route.ts",
];

const INVENTORY = new Set([...GATED, ...UNCONDITIONAL, ...REEXPORTED]);

const present = (paths: readonly string[]) =>
  paths.filter((p) => existsSync(join(ROOT, p)));

/**
 * A scaffold PRUNES modules and its owner adds routes of their own, so the
 * "nothing outside the inventory" leg is an engine-repo invariant. Stated
 * plainly because it is a real limit: inside a customer scaffold this file
 * guards the engine's own preflights, not routes the shop adds afterwards.
 * Every other leg runs everywhere.
 *
 * Nothing here pins a COUNT. The default `create-cartwright` profile
 * (`managed-site`, alias `light`) keeps exactly ten of the gated routes, so a
 * "more than ten" floor would have been red in every default scaffold.
 */
const IS_ENGINE = !existsSync(join(ROOT, ".cartwright", "profile.json"));

describe("the preflight inventory this file derives from", () => {
  it.runIf(IS_ENGINE)("classifies every route module that serves OPTIONS", () => {
    const unknown = sweep().filter((rel) => !INVENTORY.has(rel));
    expect(unknown).toEqual([]);
  });

  it.runIf(IS_ENGINE)("is not vacuous — the engine still has all of them", () => {
    expect(present([...INVENTORY])).toHaveLength(INVENTORY.size);
    expect(sweep()).toHaveLength(INVENTORY.size);
  });

  it("names no route this tree has silently stopped serving a preflight for", () => {
    const found = new Set(sweep());
    for (const rel of present([...GATED, ...UNCONDITIONAL, ...REEXPORTED])) {
      expect(found.has(rel)).toBe(true);
    }
  });
});

describe("every gated surface can refuse its own preflight", () => {
  const rows = present(GATED);
  if (rows.length === 0) {
    it.skip("this profile ships no gated preflight", () => {});
  }
  for (const rel of rows) {
    it(`${rel} consults the gate its own verbs consult`, () => {
      // If this fails on a handler you believe IS gated: call the gate the
      // module's other verbs call (a bare call, not `x.check()`), rather than
      // reading a flag inline — that shared call is the evidence this guard
      // has that the preflight cannot answer past a shut gate.
      expect({ route: rel, shared: [...sharedGateCalls(rel)] }).not.toEqual({
        route: rel,
        shared: [],
      });
      expect(canRefuse(optionsBody(rel))).toBe(true);
    });
  }
});

describe("the unconditional surfaces stay unconditional", () => {
  const rows = present(UNCONDITIONAL);
  if (rows.length === 0) {
    it.skip("this profile ships no unconditional preflight", () => {});
  }
  for (const rel of rows) {
    it(`${rel} has no gate to read`, () => {
      expect([...sharedGateCalls(rel)]).toEqual([]);
      expect(canRefuse(optionsBody(rel))).toBe(false);
    });
  }
});

describe("the thin mounts inherit a gate instead of writing one", () => {
  const rows = present(REEXPORTED);
  if (rows.length === 0) {
    it.skip("this profile ships no thin mount", () => {});
  }
  for (const rel of rows) {
    it(`${rel} re-exports a preflight this file already classifies`, () => {
      const target = reexportTarget(rel);
      expect(GATED).toContain(target);
      expect(existsSync(join(ROOT, target))).toBe(true);
    });
  }
});

/* ------------------------------------------------------------------ */
/* Behaviour — the two surfaces this change fixes.                     */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  getFeatures: vi.fn(),
  exportComposition: vi.fn(),
  toPublicLook: vi.fn(),
  scheduleRegistryHit: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({
  getBrand: mocks.getBrand,
  getFeatures: mocks.getFeatures,
}));
vi.mock("@/lib/compositions/export", () => ({
  exportComposition: mocks.exportComposition,
}));
vi.mock("@/lib/compositions/public-look", () => ({
  toPublicLook: mocks.toPublicLook,
}));
vi.mock("@/lib/registry-stats", () => ({
  scheduleRegistryHit: mocks.scheduleRegistryHit,
}));

const LOOK = "app/api/look/route.ts";
const REGISTRY = "app/api/registry/[[...path]]/route.ts";

const hasLook = existsSync(join(ROOT, LOOK));
const hasRegistry = existsSync(join(ROOT, REGISTRY));

beforeEach(() => {
  mocks.getBrand.mockReset();
  mocks.getFeatures.mockReset();
  mocks.exportComposition.mockReset().mockResolvedValue({});
  mocks.toPublicLook.mockReset().mockReturnValue({});
  mocks.scheduleRegistryHit.mockReset();
});

describe.runIf(hasLook)("/api/look preflight", () => {
  it("flag OFF → the same answer the route's own verb gives", async () => {
    mocks.getBrand.mockResolvedValue({ features: { lookSharing: false } });
    const { OPTIONS, GET } = await import("@/app/api/look/route");

    const preflight = await OPTIONS();
    const get = await GET();

    expect(preflight.status).toBe(404);
    expect(preflight.status).toBe(get.status);
    expect(await preflight.text()).toBe(await get.text());
    // No CORS grant, exactly as an absent route would answer.
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("flag ON → the preflight browser agents need, unchanged", async () => {
    mocks.getBrand.mockResolvedValue({ features: { lookSharing: true } });
    const { OPTIONS } = await import("@/app/api/look/route");
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});

describe.runIf(hasRegistry)("/api/registry preflight", () => {
  const req = () =>
    ({ nextUrl: { origin: "https://shop.example" } }) as unknown as NextRequest;

  it("flag OFF → the same answer the route's own verb gives", async () => {
    mocks.getFeatures.mockResolvedValue({ componentRegistryPublic: false });
    const { OPTIONS, GET } = await import(
      "@/app/api/registry/[[...path]]/route"
    );

    const preflight = await OPTIONS();
    const get = await GET(req(), { params: Promise.resolve({ path: [] }) });

    expect(preflight.status).toBe(404);
    expect(preflight.status).toBe(get.status);
    expect(await preflight.text()).toBe(await get.text());
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("reads the RUNTIME flag, not the compiled one", async () => {
    mocks.getFeatures.mockResolvedValue({ componentRegistryPublic: true });
    const { OPTIONS } = await import(
      "@/app/api/registry/[[...path]]/route"
    );
    const res = await OPTIONS();
    expect(mocks.getFeatures).toHaveBeenCalled();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});
