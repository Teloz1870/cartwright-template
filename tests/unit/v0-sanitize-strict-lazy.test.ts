import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Import-time side effects — the regression that broke `/admin/audit` in
 * production.
 *
 * `sanitize-strict.ts` used to construct its jsdom window at module scope AND
 * import jsdom statically, so *importing* the file both paid for jsdom and, on
 * the way in, crossed jsdom's own CJS→ESM `require` boundary
 * (`html-encoding-sniffer` requires `@exodus/bytes`, which is `type: "module"`).
 * That module hangs under `lib/tools/registry.ts` — a barrel importing ~20 tool
 * modules — which 14 files import, including `app/admin/audit/page.tsx`, a page
 * that wants only `getTool()`. A module-load failure kills the whole page.
 *
 * **What this file must prove is that jsdom is not LOADED on import** — not
 * merely that no window is constructed. A first version of this test mocked
 * `jsdom` with a factory that itself called `importOriginal()`, which eagerly
 * loads real jsdom: it could only ever assert "no window constructed", so a
 * change reintroducing the actual crash path would have stayed green. That is
 * exactly the failure mode this hardening programme is about, so it is worth
 * naming here rather than quietly fixing.
 *
 * The mock below therefore never touches the real module. Vitest invokes a mock
 * factory lazily, on the first import of the mocked specifier, so the `loaded`
 * flag is a direct probe of "has jsdom been pulled in yet".
 *
 * Behaviour — that sanitization still strips what it must — is covered by the
 * 15 tests in `v0-sanitize-strict.test.ts`, which run against the real jsdom.
 */

const { loaded, jsdomCtor } = vi.hoisted(() => ({
  loaded: { value: false },
  jsdomCtor: vi.fn(),
}));

// Pure stub — deliberately no importOriginal(). Merely evaluating this factory
// is the signal that something asked for jsdom.
vi.mock("jsdom", () => {
  loaded.value = true;
  return {
    JSDOM: class {
      window: unknown;
      constructor(html?: string) {
        jsdomCtor(html);
        this.window = { document: {} };
      }
    },
  };
});

// DOMPurify would reject the stub window, so stub it too: this file is about
// load timing, not sanitization.
vi.mock("dompurify", () => ({
  default: () => ({ sanitize: (html: string) => html, addHook: () => {} }),
}));

async function freshImport() {
  vi.resetModules();
  loaded.value = false;
  jsdomCtor.mockClear();
  return import("@/lib/v0/transform/sanitize-strict");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sanitize-strict — jsdom is loaded lazily, never at import", () => {
  it("importing the module does NOT load jsdom at all", async () => {
    const mod = await freshImport();

    expect(typeof mod.sanitizeUserHtml).toBe("function");
    expect(loaded.value, "jsdom was pulled in just by importing the module").toBe(false);
    expect(jsdomCtor).not.toHaveBeenCalled();
  });

  it("the empty-input short-circuit loads nothing either", async () => {
    const { sanitizeUserHtml } = await freshImport();

    await expect(sanitizeUserHtml("")).resolves.toBe("");
    expect(loaded.value).toBe(false);
    expect(jsdomCtor).not.toHaveBeenCalled();
  });

  it("the first real call loads jsdom and builds exactly one window", async () => {
    const { sanitizeUserHtml } = await freshImport();

    await sanitizeUserHtml("<div>one</div>");

    expect(loaded.value).toBe(true);
    expect(jsdomCtor).toHaveBeenCalledTimes(1);
  });

  it("the instance is memoised — a second call rebuilds nothing", async () => {
    const { sanitizeUserHtml } = await freshImport();

    await sanitizeUserHtml("<div>one</div>");
    await sanitizeUserHtml("<div>two</div>");

    expect(jsdomCtor).toHaveBeenCalledTimes(1);
  });

  it("concurrent first calls share ONE load (the promise is memoised, not the result)", async () => {
    // Memoising only after `await` would let N concurrent callers each start
    // their own load during a cold start.
    const { sanitizeUserHtml } = await freshImport();

    await Promise.all([
      sanitizeUserHtml("<p>a</p>"),
      sanitizeUserHtml("<p>b</p>"),
      sanitizeUserHtml("<p>c</p>"),
    ]);

    expect(jsdomCtor).toHaveBeenCalledTimes(1);
  });
});
