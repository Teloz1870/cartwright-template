import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The supplier's confirm link (DRØM12-a): opening it writes nothing, because mail
 * scanners open links; only the page's POST moves the row. In-memory prisma with the
 * real `status: { not }` guard, so two POSTs at once are a real race.
 */

type Row = { id: string; orderId: string; token: string; status: string };

const mocks = vi.hoisted(() => ({
  rows: [] as Row[],
  audit: [] as Array<{ actor: string; tool: string; args: unknown }>,
  brand: { defaultLocale: "en", storeName: "Test Shop", url: "https://shop.test", emails: {} },
}));

vi.mock("@/brand.config", () => ({ brand: mocks.brand }));
vi.mock("@/lib/mailer/resend", () => ({ getResendApiKey: vi.fn(), shouldUseResend: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn() }));
vi.mock("@/lib/audit", () => ({
  withAudit: async (meta: { actor: string; tool: string; args: unknown }, fn: () => Promise<unknown>) => {
    mocks.audit.push(meta);
    return fn();
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    fulfillmentOrder: {
      findUnique: vi.fn(async ({ where }: { where: { token: string } }) => {
        const row = mocks.rows.find((r) => r.token === where.token);
        return row ? { ...row } : null;
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string; status: { not: string } }; data: { status: string } }) => {
          const hits = mocks.rows.filter((r) => r.id === where.id && r.status !== where.status.not);
          for (const r of hits) r.status = data.status;
          return { count: hits.length };
        },
      ),
    },
  },
}));

const URL_BASE = "https://shop.test/api/fulfillment/confirm";

function post(body: BodyInit, headers?: HeadersInit) {
  return new NextRequest(URL_BASE, { method: "POST", body, headers });
}
const pressButton = (token: string) => post(new URLSearchParams({ token }));

async function route() {
  return import("@/app/api/fulfillment/confirm/route");
}

beforeEach(() => {
  vi.resetModules();
  mocks.brand.defaultLocale = "en";
  mocks.audit.length = 0;
  mocks.rows.length = 0;
  mocks.rows.push({ id: "fo1", orderId: "order-12345678", token: "tok-1", status: "sent" });
});

describe("opening the link", () => {
  it("shows one button and writes nothing", async () => {
    const { GET } = await route();
    const res = await GET(new NextRequest(`${URL_BASE}?token=tok-1`));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<form method="post">`);
    expect(html).toContain(`name="token" value="tok-1"`);
    expect(html).not.toMatch(/thanks|marked as shipped\./i);
    expect(mocks.rows[0].status).toBe("sent");
    expect(mocks.audit).toHaveLength(0);
  });

  it("does not let the token leave through a cache or a referrer", async () => {
    const { GET } = await route();
    const res = await GET(new NextRequest(`${URL_BASE}?token=tok-1`));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each([
    ["an unknown token", "?token=nope"],
    ["no token", ""],
  ])("answers 404 with no form for %s", async (_label, query) => {
    const { GET } = await route();
    const res = await GET(new NextRequest(`${URL_BASE}${query}`));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("<form");
  });

  it("offers no button once the order is shipped", async () => {
    mocks.rows[0].status = "shipped";
    const { GET } = await route();
    const html = await (await GET(new NextRequest(`${URL_BASE}?token=tok-1`))).text();
    expect(html).toContain("Already marked as shipped");
    expect(html).not.toContain("<form");
  });

  it("escapes a stored token and order id into the page", async () => {
    mocks.rows[0].token = `a"><script>`;
    mocks.rows[0].orderId = `<b>"1234`;
    const { GET } = await route();
    const res = await GET(new NextRequest(`${URL_BASE}?token=${encodeURIComponent(`a"><script>`)}`));
    const html = await res.text();
    expect(html).toContain("a&quot;&gt;&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;&quot;1234");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(`<b>"1234`);
  });
});

describe("pressing the button", () => {
  it("marks the order shipped and audits it without the token", async () => {
    const { POST } = await route();
    const res = await POST(pressButton("tok-1"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Thanks — marked as shipped");
    expect(html).not.toMatch(/notified/i);
    expect(mocks.rows[0].status).toBe("shipped");
    expect(mocks.audit).toHaveLength(1);
    expect(mocks.audit[0].tool).toBe("fulfillment.mark_shipped");
    expect(JSON.stringify(mocks.audit[0])).not.toContain("tok-1");
  });

  it("a second press changes nothing and says so", async () => {
    const { POST } = await route();
    await POST(pressButton("tok-1"));
    const html = await (await POST(pressButton("tok-1"))).text();
    expect(html).toContain("Already marked as shipped");
    expect(mocks.rows[0].status).toBe("shipped");
    expect(mocks.audit).toHaveLength(1);
  });

  it("of two presses at once, one wins and the other says already shipped", async () => {
    const { POST } = await route();
    const pages = await Promise.all([POST(pressButton("tok-1")), POST(pressButton("tok-1"))]);
    const html = await Promise.all(pages.map((p) => p.text()));
    expect(html.filter((h) => h.includes("Thanks — marked as shipped"))).toHaveLength(1);
    expect(html.filter((h) => h.includes("Already marked as shipped"))).toHaveLength(1);
  });

  it.each([
    ["a wrong token", () => pressButton("nope")],
    ["a form without a token", () => post(new URLSearchParams({ other: "x" }))],
    ["a token only in the query", () => new NextRequest(`${URL_BASE}?token=tok-1`, { method: "POST" })],
    ["a body that is not a form", () => post(`{"token":"tok-1"}`, { "content-type": "application/json" })],
  ])("%s writes nothing and answers 404", async (_label, make) => {
    const { POST } = await route();
    const res = await POST(make());
    expect(res.status).toBe(404);
    expect(mocks.rows[0].status).toBe("sent");
    expect(mocks.audit).toHaveLength(0);
  });
});

describe("a Danish shop", () => {
  it("gets the button and the receipt in Danish", async () => {
    mocks.brand.defaultLocale = "da";
    const { GET, POST } = await route();
    const form = await (await GET(new NextRequest(`${URL_BASE}?token=tok-1`))).text();
    expect(form).toContain("Markér som afsendt");
    expect(form).toContain(`lang="da"`);
    expect(await (await POST(pressButton("tok-1"))).text()).toContain("Tak — markeret som afsendt");
  });
});
