import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A custom form must be able to say WHICH form it is and WHAT was configured.
 *
 * `Lead` shipped with agency-shaped columns (`projectType`, `budget`) and
 * nothing else, and the route's Zod schema strips unknown keys. So a site with
 * a fence calculator, a booking form and a plain contact form received three
 * indistinguishable rows, and a calculator POSTing its whole result set stored
 * a name and an email — SILENTLY, with a 200 and an `ok: true`. The submitter
 * had no way to discover the loss; the shop owner had no way to reconstruct it.
 *
 * `source` and `data` close that. Both are bounded at the wire because
 * `/api/inquiries` is PUBLIC and unauthenticated: without caps the endpoint is
 * free, anonymous storage.
 */

const mocks = vi.hoisted(() => ({
  leadCreate: vi.fn(),
  features: {} as { leadAiTriage?: boolean; contactAttachments?: boolean },
  limiterAllowed: true,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void cb };
});

vi.mock("@/brand.config", () => ({
  brand: {
    storeName: "Test Shop",
    get features() {
      return mocks.features;
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: { lead: { create: (a: unknown) => mocks.leadCreate(a), update: vi.fn() } },
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiSettings: async () => ({ anthropicConfigured: false, localConfigured: false }),
}));
vi.mock("@/lib/ai/client", () => ({ chatModelResolved: vi.fn() }));
vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@/lib/audit-context", () => ({
  withAuditContext: (_c: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  inquiryPerIpLimiter: { check: () => ({ allowed: mocks.limiterAllowed, retryAfter: 60 }) },
  supportTriagePerIpLimiter: { check: () => ({ allowed: mocks.limiterAllowed, retryAfter: 60 }) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/inquiries/route");
  return POST(
    new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** The row Prisma was asked to create. */
function written() {
  return mocks.leadCreate.mock.calls[0][0].data as Record<string, unknown>;
}

const BASE = {
  name: "Test Testesen",
  email: "t@example.test",
  message: "Jeg vil gerne have et tilbud.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.features = {};
  mocks.limiterAllowed = true;
  mocks.leadCreate.mockResolvedValue({ id: "lead_1" });
});

describe("/api/inquiries — which form, and what was configured", () => {
  it("persists source and data instead of silently dropping them", async () => {
    const res = await post({
      ...BASE,
      source: "hegnsberegner",
      data: { meters: 42, model: "Type 1", colour: "antracit" },
    });

    expect(res.status).toBe(200);
    expect(written().source).toBe("hegnsberegner");
    expect(written().data).toEqual({ meters: 42, model: "Type 1", colour: "antracit" });
  });

  it("REGRESSION: an unknown-key payload used to arrive as name + email only", async () => {
    // Exactly the shape a bespoke calculator sends. Before source/data existed
    // this returned 200 and stored nothing of it.
    await post({ ...BASE, source: "quote-wizard", data: { m2: 18.5 } });
    const row = written();
    expect(row.source).toBeTruthy();
    expect(row.data).toBeTruthy();
  });

  it("treats an empty, blank or null source as absent, not as a rejection", async () => {
    // An untouched hidden input serialises to "", and a client writing
    // `source: state.source || null` sends null. Both used to return
    // `400 invalid_input` naming no field, losing the whole enquiry.
    for (const source of ["", "   ", null]) {
      vi.clearAllMocks();
      mocks.leadCreate.mockResolvedValue({ id: "lead_1" });
      const res = await post({ ...BASE, source });
      expect(res.status).toBe(200);
      expect(written().source).toBeNull();
    }
    vi.clearAllMocks();
    mocks.leadCreate.mockResolvedValue({ id: "lead_1" });
    expect((await post({ ...BASE, data: null })).status).toBe(200);
  });

  it("writes source=null and omits data when the form sends neither", async () => {
    await post(BASE);
    // Both are equivalent on a nullable column; they differ only in whether
    // Prisma names the column in the INSERT. Asserted as written, so the test
    // name, the code and the assertion agree.
    expect(written().source).toBeNull();
    expect(written().data).toBeUndefined();
  });

  it("keeps `constructor` / `prototype` — they are ordinary form fields", async () => {
    // REGRESSION. These were once stripped as "polluting", which returned
    // 200 {ok:true} with the answer missing — silent loss behind a success
    // response, the exact defect this feature removes. A construction firm's
    // "constructor" and an agency wizard's "Do you need a prototype?" are real.
    await post({
      ...BASE,
      data: { constructor: "Jensen Byg A/S", prototype: "yes", real: "kept" },
    });
    expect(written().data).toEqual({
      constructor: "Jensen Byg A/S",
      prototype: "yes",
      real: "kept",
    });
  });

  it("drops `__proto__` — sent as RAW JSON, the only way it is an own property", async () => {
    // A JS object literal `{ __proto__: … }` SETS THE PROTOTYPE and never
    // becomes an own property, so writing this test with a literal asserts
    // nothing at all. It has to go over the wire as text.
    const { POST } = await import("@/app/api/inquiries/route");
    const raw = `{"name":"Test Testesen","email":"t@example.test","data":{"__proto__":{"admin":true},"real":"kept"}}`;
    const res = await POST(
      new Request("http://localhost:3000/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw,
      }),
    );
    expect(res.status).toBe(200);
    const stored = written().data as Record<string, unknown>;
    expect(Object.keys(stored)).not.toContain("__proto__");
    expect(stored.real).toBe("kept");
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it("drops `__proto__` at EVERY depth — a nested one used to be stored verbatim", async () => {
    // Zod's `z.record(z.string(), z.unknown())` rebuilds only the TOP level, so
    // a nested `__proto__` never met the old one-level filter: measured, it was
    // written to the row and came back out of it as an own property. Sent raw
    // for the same reason as the test above — a literal would set a prototype.
    const { POST } = await import("@/app/api/inquiries/route");
    const raw = `{"name":"Test Testesen","email":"t@example.test","data":{"settings":{"__proto__":{"isAdmin":true},"theme":"dark"},"rows":[{"__proto__":{"x":1}},{"ok":"y"}],"m2":"12"}}`;
    const res = await POST(
      new Request("http://localhost:3000/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw,
      }),
    );
    expect(res.status).toBe(200);
    const stored = written().data as {
      settings: Record<string, unknown>;
      rows: Record<string, unknown>[];
      m2: string;
    };
    expect(Object.keys(stored.settings)).not.toContain("__proto__");
    expect(Object.keys(stored.rows[0])).not.toContain("__proto__");
    // …and nothing legitimate was lost on the way through.
    expect(stored.settings.theme).toBe("dark");
    expect(stored.rows[1].ok).toBe("y");
    expect(stored.m2).toBe("12");
  });

  it("keeps `constructor` / `prototype` when they are NESTED too", async () => {
    // The depth-walk must not become the silent-loss bug at depth: these are
    // ordinary field names, and stripping them is the defect, not the cure.
    await post({
      ...BASE,
      data: { firm: { constructor: "Jensen Byg A/S", prototype: "yes" } },
    });
    expect(written().data).toEqual({
      firm: { constructor: "Jensen Byg A/S", prototype: "yes" },
    });
  });

  describe("bounds — this endpoint is public and unauthenticated", () => {
    it("rejects a data blob over the byte cap", async () => {
      const res = await post({ ...BASE, data: { blob: "x".repeat(5000) } });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_too_large");
    });

    it("rejects a data blob with too many keys", async () => {
      const many = Object.fromEntries(
        Array.from({ length: 51 }, (_, i) => [`k${i}`, 1]),
      );
      const res = await post({ ...BASE, data: many });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_too_many_keys");
    });

    it("rejects an over-long source label with its OWN code", async () => {
      // The agent-facing docs promise "over a cap is a 400 with its own code".
      // Without the explicit message this fell through to `invalid_input`, so
      // a caller could not tell WHICH cap it had hit.
      const res = await post({ ...BASE, source: "s".repeat(65) });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("source_too_long");
    });

    const deepBody = (levels: number) => {
      let nested = "1";
      for (let i = 0; i < levels; i++) nested = `[${nested}]`;
      return `{"name":"Test Testesen","email":"t@example.test","data":{"a":${nested}}}`;
    };
    const postRaw = async (body: string) => {
      const { POST } = await import("@/app/api/inquiries/route");
      return POST(
        new Request("http://localhost:3000/api/inquiries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
      );
    };

    it("accepts nesting right at the depth cap", async () => {
      // 31 array levels under `data.a` puts the innermost value at MAX_DATA_DEPTH.
      const res = await postRaw(deepBody(31));
      expect(res.status).toBe(200);
    });

    it("rejects nesting past the cap with its own code", async () => {
      const res = await postRaw(deepBody(64));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_too_deep");
    });

    it("counts OBJECT nesting toward the cap too, not only arrays", async () => {
      // Every other depth case nests arrays, so dropping the object leg's
      // `depth + 1` in exceedsDepth left the whole suite green.
      let nested = "1";
      for (let i = 0; i < 64; i++) nested = `{"a":${nested}}`;
      const res = await postRaw(
        `{"name":"Test Testesen","email":"t@example.test","data":${nested}}`,
      );
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_too_deep");
    });

    it("REGRESSION: a pathologically deep body is a 400, never a 500", async () => {
      // `JSON.parse` accepts structures `JSON.stringify` cannot walk, so the
      // byte check — which must serialise in order to measure — threw
      // RangeError out of the refinement. Not a ZodError, so the PUBLIC,
      // unauthenticated route answered `500 send_failed` and logged a stack
      // trace on every request. Measured before the fix at depth 3000 (6 KB).
      for (const levels of [3000, 9000]) {
        const res = await postRaw(deepBody(levels));
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("data_too_deep");
        expect(mocks.leadCreate).not.toHaveBeenCalled();
      }
    });

    it("rejects an OBJECT under `constructor` / `prototype` with its own code", async () => {
      // Measured: with `__proto__` stripped, {"constructor":{"prototype":{…}}}
      // still reaches Object.prototype through a recursive merge. No real form
      // sends that shape, so it is refused loudly rather than stripped quietly.
      const res = await post({
        ...BASE,
        data: { constructor: { prototype: { isAdmin: true } } },
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_reserved_key");
      expect(mocks.leadCreate).not.toHaveBeenCalled();
    });

    it("rejects that shape at DEPTH too, not just at the top", async () => {
      const res = await post({
        ...BASE,
        data: { a: { b: [{ constructor: { prototype: { x: 1 } } }] } },
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_reserved_key");
    });

    it("still accepts `constructor` / `prototype` carrying a STRING", async () => {
      // The regression guard: refusing the object shape must not resurrect the
      // silent-drop bug for a construction firm called "constructor".
      const res = await post({
        ...BASE,
        data: { constructor: "Jensen Byg A/S", prototype: "yes" },
      });
      expect(res.status).toBe(200);
      expect(written().data).toEqual({ constructor: "Jensen Byg A/S", prototype: "yes" });
    });

    it("rejects a non-object data (arrays and primitives)", async () => {
      expect((await post({ ...BASE, data: ["a", "b"] })).status).toBe(400);
      expect((await post({ ...BASE, data: "just a string" })).status).toBe(400);
    });

    it("accepts a payload sitting just inside both caps — and STORES it", async () => {
      // Asserting only the 200 let this case survive a full revert of the
      // route to origin/main, where the fields do not exist at all: an
      // unknown-key payload was always accepted, silently, which is the very
      // defect. The row has to be checked, not the status.
      const data = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
      const res = await post({ ...BASE, source: "s".repeat(64), data });
      expect(res.status).toBe(200);
      expect(written().source).toBe("s".repeat(64));
      expect(written().data).toEqual(data);
    });
  });

  it("does not disturb the existing agency columns", async () => {
    await post({ ...BASE, source: "contact", projectType: "Webshop" });
    const row = written();
    expect(row.projectType).toBe("Webshop");
    expect(row.status).toBe("new");
  });
});

/**
 * `sanitizeLeadData` had NO coverage of its own: every assertion above reaches
 * it through the route, and Zod's `z.record` already strips a TOP-LEVEL
 * `__proto__` before the function is called. Measured: replacing the whole body
 * with `return input;` — and separately emptying `UNSAFE_KEYS` — left the route
 * suite fully green. These call it directly, so a gutted body is red here.
 */
describe("sanitizeLeadData — called directly, not through Zod", () => {
  it("strips `__proto__` at the top level", async () => {
    const { sanitizeLeadData } = await import("@/lib/inquiry-errors");
    const raw = JSON.parse('{"__proto__":{"admin":true},"real":"kept"}');
    expect(Object.getOwnPropertyNames(raw)).toContain("__proto__");
    const out = sanitizeLeadData(raw)!;
    expect(Object.getOwnPropertyNames(out)).not.toContain("__proto__");
    expect(out.real).toBe("kept");
  });

  it("strips `__proto__` nested in objects AND in array elements", async () => {
    const { sanitizeLeadData } = await import("@/lib/inquiry-errors");
    const raw = JSON.parse(
      '{"o":{"__proto__":{"a":1},"keep":"x"},"arr":[{"__proto__":{"b":2}},{"keep":"y"}]}',
    );
    const out = sanitizeLeadData(raw) as {
      o: Record<string, unknown>;
      arr: Record<string, unknown>[];
    };
    expect(Object.getOwnPropertyNames(out.o)).not.toContain("__proto__");
    expect(Object.getOwnPropertyNames(out.arr[0])).not.toContain("__proto__");
    expect(out.o.keep).toBe("x");
    expect(out.arr[1].keep).toBe("y");
  });

  it("keeps every other key, including `constructor` and `prototype`, at any depth", async () => {
    const { sanitizeLeadData } = await import("@/lib/inquiry-errors");
    const input = {
      constructor: "Jensen Byg A/S",
      nested: { prototype: "yes", n: 12, b: true, nul: null, arr: [1, "a", false] },
    };
    expect(sanitizeLeadData(input)).toEqual(input);
  });

  it("returns undefined for nothing, and for an object left empty", async () => {
    const { sanitizeLeadData } = await import("@/lib/inquiry-errors");
    expect(sanitizeLeadData(undefined)).toBeUndefined();
    expect(sanitizeLeadData({})).toBeUndefined();
    expect(sanitizeLeadData(JSON.parse('{"__proto__":{"a":1}}'))).toBeUndefined();
  });

  it("handles anything the depth cap lets through", async () => {
    // Deliberately NOT a stack-safety assertion: the previous version of this
    // test stayed green when the walk was swapped for the naive recursion it
    // claimed to be safer than, because a vitest worker has a bigger stack than
    // the runtime the route runs in. MAX_DATA_DEPTH is the real guarantee, so
    // this asserts the contract at that boundary instead of a stack budget.
    const { sanitizeLeadData, MAX_DATA_DEPTH } = await import("@/lib/inquiry-errors");
    let nested = "1";
    for (let i = 0; i < MAX_DATA_DEPTH; i++) nested = `[${nested}]`;
    const input = JSON.parse(`{"a":${nested},"__proto__":{"x":1}}`);
    const out = sanitizeLeadData(input)!;
    expect(Object.getOwnPropertyNames(out)).not.toContain("__proto__");
    expect(out.a).toEqual(input.a);
  });
});
