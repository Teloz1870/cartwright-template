import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The no-DB site profile must not be the place where a calculator's answers
 * quietly disappear.
 *
 * `app/api/inquiries/route.static.ts` is the `--profile site` variant: there is
 * no `Lead` row to write, so `source` and `data` are folded into the owner's
 * mail instead. That half shipped with NO behavioural test at all, and the gap
 * was not theoretical — two mutations left the FULL 4195-test suite green:
 * deleting `...dataLines(data.data)` from the mail body (the submitted details
 * silently vanish again, which is the exact defect this feature removes), and
 * relaxing its byte cap tenfold (the public endpoint stops being bounded).
 * Both are red here now.
 */

const mocks = vi.hoisted(() => ({
  sendContactMail: vi.fn(),
  limiterAllowed: true,
}));

vi.mock("@/lib/contact-mail", () => ({
  sendContactMail: (m: unknown) => mocks.sendContactMail(m),
}));

vi.mock("@/lib/rate-limit", () => ({
  inquiryPerIpLimiter: { check: () => ({ allowed: mocks.limiterAllowed, retryAfter: 60 }) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

async function postRaw(body: string) {
  const { POST } = await import("@/app/api/inquiries/route.static");
  return POST(
    new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

const post = (body: Record<string, unknown>) => postRaw(JSON.stringify(body));

/** The plain-text body the owner would receive. */
function mailText(): string {
  return (mocks.sendContactMail.mock.calls[0][0] as { text: string }).text;
}

const BASE = {
  name: "Test Testesen",
  email: "t@example.test",
  message: "Jeg vil gerne have et tilbud.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.limiterAllowed = true;
  mocks.sendContactMail.mockResolvedValue(true);
});

describe("/api/inquiries (site profile) — the mail carries what the form collected", () => {
  it("folds source and data into the owner mail", async () => {
    const res = await post({
      ...BASE,
      source: "hegnsberegner",
      data: { meters: 42, model: "Type 1", colour: "antracit" },
    });

    expect(res.status).toBe(200);
    const text = mailText();
    expect(text).toContain("Form: hegnsberegner");
    expect(text).toContain("Submitted details:");
    expect(text).toContain("- meters: 42");
    expect(text).toContain("- model: Type 1");
    expect(text).toContain("- colour: antracit");
  });

  it("says nothing extra when the form sends neither field", async () => {
    await post(BASE);
    const text = mailText();
    expect(text).not.toContain("Submitted details:");
    expect(text).not.toContain("Form: ");
  });

  it("drops `__proto__` at every depth, through the SHARED sanitizer", async () => {
    // Raw JSON: a `{ __proto__: … }` literal sets a prototype and is never an
    // own property, so a literal would assert nothing. This route used to run
    // its own one-level key filter instead of `sanitizeLeadData`, so a nested
    // key reached the mail body even after the db route learned to strip it.
    const res = await postRaw(
      `{"name":"Test Testesen","email":"t@example.test","data":{"deep":{"__proto__":{"admin":true},"kept":"yes"},"m2":"12"}}`,
    );
    expect(res.status).toBe(200);
    const text = mailText();
    expect(text).not.toContain("__proto__");
    expect(text).toContain("- m2: 12");
    expect(text).toContain('"kept":"yes"');
  });

  it("keeps `constructor` / `prototype` — ordinary field names on real forms", async () => {
    await post({ ...BASE, data: { constructor: "Jensen Byg A/S", prototype: "yes" } });
    const text = mailText();
    expect(text).toContain("- constructor: Jensen Byg A/S");
    expect(text).toContain("- prototype: yes");
  });

  describe("bounds — identical to the db route, because the schema is the same object", () => {
    it("rejects a data blob over the byte cap", async () => {
      const res = await post({ ...BASE, data: { blob: "x".repeat(5000) } });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_too_large");
      expect(mocks.sendContactMail).not.toHaveBeenCalled();
    });

    it("rejects a data blob with too many keys", async () => {
      const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 1]));
      const res = await post({ ...BASE, data: many });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_too_many_keys");
      expect(mocks.sendContactMail).not.toHaveBeenCalled();
    });

    it("rejects an over-long source label with its own code", async () => {
      const res = await post({ ...BASE, source: "s".repeat(65) });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("source_too_long");
    });

    it("rejects an OBJECT under `constructor` / `prototype` — same schema, same refusal", async () => {
      const res = await post({
        ...BASE,
        data: { a: { constructor: { prototype: { isAdmin: true } } } },
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_reserved_key");
      expect(mocks.sendContactMail).not.toHaveBeenCalled();
    });

    it("REGRESSION: a pathologically deep body is a 400 here too, never a 500", async () => {
      // The shared schema propagates behaviour faithfully — including, before
      // the fix, the RangeError that escaped the byte check and made this
      // public route answer 500 with a stack trace in the log.
      let nested = "1";
      for (let i = 0; i < 3000; i++) nested = `[${nested}]`;
      const res = await postRaw(
        `{"name":"Test Testesen","email":"t@example.test","data":{"a":${nested}}}`,
      );
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("data_too_deep");
      expect(mocks.sendContactMail).not.toHaveBeenCalled();
    });

    it("accepts a payload sitting just inside both caps", async () => {
      const res = await post({
        ...BASE,
        source: "s".repeat(64),
        data: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i])),
      });
      expect(res.status).toBe(200);
      expect(mailText()).toContain("- k49: 49");
    });
  });
});
