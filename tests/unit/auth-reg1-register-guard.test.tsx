import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

/**
 * AUTH-REG1: the bot guard on customer sign-up. Rate limit per trusted client
 * IP, a honeypot answered with a fake success, a minimum fill time, and the
 * same answer for a known and an unknown address. Prisma, headers and
 * marketing are mocked; bcrypt, trustedClientIp and the limiter are real.
 */

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn(), user: { create: vi.fn() } },
  headers: {} as Record<string, string>,
  emit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(mocks.headers),
}));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: mocks.emit,
  MARKETING_EVENTS: { userCreated: "user.created" },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { registerUser } from "@/app/[locale]/account/actions";
import { registerPerIpLimiter } from "@/lib/rate-limit";
import {
  REGISTER_ELAPSED_FIELD,
  REGISTER_HONEYPOT_FIELD,
  REGISTER_MIN_FILL_MS,
  filledSlowlyEnough,
} from "@/lib/auth/register-guard";
import RegisterForm from "@/components/RegisterForm";

function form(overrides: Record<string, string | null> = {}): FormData {
  const fields: Record<string, string | null> = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "correct-horse",
    [REGISTER_ELAPSED_FIELD]: String(REGISTER_MIN_FILL_MS + 1500),
    [REGISTER_HONEYPOT_FIELD]: "",
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== null) fd.set(k, v);
  return fd;
}

/** On Vercel the ingress header is trusted (lib/trusted-client-ip.ts). */
function onVercelFrom(chain: string) {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "");
  mocks.headers = { "x-vercel-forwarded-for": chain };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  registerPerIpLimiter.reset();
  onVercelFrom("203.0.113.7");
  mocks.prisma.$queryRaw.mockReset().mockResolvedValue([]);
  mocks.prisma.user.create.mockReset().mockResolvedValue({ id: "u1" });
  mocks.emit.mockReset().mockResolvedValue(undefined);
});

describe("registerUser — rate limit per IP", () => {
  it("the sixth sign-up from one IP in the window is refused and creates nothing", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await registerUser(form({ email: `u${i}@example.com` }));
      expect(res).toEqual({ ok: true });
    }
    expect(mocks.prisma.user.create).toHaveBeenCalledTimes(5);

    const sixth = await registerUser(form({ email: "u5@example.com" }));
    expect(sixth.ok).toBe(false);
    expect(sixth).toMatchObject({ error: expect.stringMatching(/too many attempts/i) });
    expect(mocks.prisma.user.create).toHaveBeenCalledTimes(5);
  });

  it("another client IP still gets through", async () => {
    for (let i = 0; i < 5; i++) await registerUser(form({ email: `u${i}@example.com` }));
    onVercelFrom("198.51.100.9");
    expect(await registerUser(form({ email: "other@example.com" }))).toEqual({ ok: true });
  });

  it("keys on the first hop only: a different tail does not buy a fresh bucket", async () => {
    for (let i = 0; i < 5; i++) {
      onVercelFrom(`203.0.113.7, 10.0.0.${i}`);
      await registerUser(form({ email: `u${i}@example.com` }));
    }
    onVercelFrom("203.0.113.7, 10.9.9.9");
    expect((await registerUser(form({ email: "u5@example.com" }))).ok).toBe(false);
  });

  it("a validation error or a too-quick submit does not spend an attempt", async () => {
    for (let i = 0; i < 5; i++) {
      await registerUser(form({ email: "not-an-email" }));
      await registerUser(form({ [REGISTER_ELAPSED_FIELD]: "10" }));
    }
    expect(await registerUser(form())).toEqual({ ok: true });
  });

  it("self-hosted without a trusted proxy: a spoofed X-Forwarded-For buys nothing, and customers are not throttled through one shared bucket", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "");
    for (let i = 0; i < 7; i++) {
      mocks.headers = { "x-forwarded-for": `198.51.100.${i}` };
      expect(await registerUser(form({ email: `s${i}@example.com` }))).toEqual({ ok: true });
    }
    // Nothing was charged: the client is "unknown", so no bucket was touched.
    onVercelFrom("unknown");
    expect(registerPerIpLimiter.check("unknown").remaining).toBe(4);
  });

  it("self-hosted behind a proxy the operator trusts: the limit applies", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("CARTWRIGHT_TRUST_PROXY_IP_HEADERS", "1");
    mocks.headers = { "x-forwarded-for": "192.0.2.44" };
    for (let i = 0; i < 5; i++) await registerUser(form({ email: `t${i}@example.com` }));
    expect((await registerUser(form({ email: "t5@example.com" }))).ok).toBe(false);
  });
});

describe("registerUser — honeypot", () => {
  it("a filled honeypot gets a success answer, and no account is looked up or created", async () => {
    const res = await registerUser(form({ [REGISTER_HONEYPOT_FIELD]: "https://spam.example" }));
    expect(res).toEqual({ ok: true });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("a value padded with whitespace is still a bot", async () => {
    expect(await registerUser(form({ [REGISTER_HONEYPOT_FIELD]: "   x " }))).toEqual({ ok: true });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("whitespace alone counts as empty, so the person still gets an account", async () => {
    expect(await registerUser(form({ [REGISTER_HONEYPOT_FIELD]: "   " }))).toEqual({ ok: true });
    expect(mocks.prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it("is not a name browser autofill recognises", () => {
    expect(REGISTER_HONEYPOT_FIELD).not.toMatch(
      /website|url|homepage|company|organi[sz]ation|address|phone|tel|email|name|nickname|username/i,
    );
  });
});

describe("registerUser — minimum fill time", () => {
  it.each([
    ["too fast", String(REGISTER_MIN_FILL_MS - 1)],
    ["missing", null],
    ["not a number", "3000ms"],
    ["negative", "-5000"],
  ])("%s → refused with a visible error, no account", async (_label, elapsed) => {
    const res = await registerUser(form({ [REGISTER_ELAPSED_FIELD]: elapsed }));
    expect(res.ok).toBe(false);
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("exactly the minimum passes", () => {
    expect(filledSlowlyEnough(String(REGISTER_MIN_FILL_MS))).toBe(true);
    expect(filledSlowlyEnough(String(REGISTER_MIN_FILL_MS - 1))).toBe(false);
  });
});

describe("registerUser — no enumeration", () => {
  it("a known address gets exactly the answer a new one gets, and no second account", async () => {
    const fresh = await registerUser(form({ email: "new@example.com" }));

    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "existing", email: "ada@example.com" }]);
    const known = await registerUser(form({ email: "ada@example.com" }));

    expect(known).toEqual(fresh);
    expect(mocks.prisma.user.create).toHaveBeenCalledTimes(1);
    expect(mocks.emit).toHaveBeenCalledTimes(1);
  });

  it("hashes the password before the lookup, so both paths pay the bcrypt cost", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const spy = vi.spyOn(bcrypt, "hash");
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: "existing", email: "ada@example.com" }]);
    await registerUser(form());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.$queryRaw.mock.invocationCallOrder[0],
    );
    spy.mockRestore();
  });

  it("a racing duplicate that hits the unique index is answered the same way", async () => {
    mocks.prisma.user.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await registerUser(form())).toEqual({ ok: true });
  });

  it("any other database failure is still a generic error", async () => {
    mocks.prisma.user.create.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await registerUser(form());
    expect(res.ok).toBe(false);
    err.mockRestore();
  });
});

describe("RegisterForm — the honeypot a person never meets", () => {
  it("renders the honeypot by the shared name, out of the tab order and hidden from assistive tech", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={{}}>
        <RegisterForm />
      </NextIntlClientProvider>,
    );
    const input = html.match(new RegExp(`<input[^>]*name="${REGISTER_HONEYPOT_FIELD}"[^>]*>`))?.[0];
    expect(input).toBeDefined();
    expect(input).toContain('tabindex="-1"');
    expect(input).toMatch(/autocomplete="off"/i);
    const wrapper = html.slice(0, html.indexOf(input!));
    expect(wrapper.slice(wrapper.lastIndexOf("<div"))).toContain('aria-hidden="true"');
    // A submit before hydration posts instead of putting the password in the URL.
    expect(html).toMatch(/<form[^>]*method="post"/);
    // The visible fields are untouched.
    for (const name of ["name", "email", "password"]) {
      expect(html).toContain(`name="${name}"`);
    }
  });
});

describe("auth forms — a submit before hydration never puts a password in the URL", () => {
  // Without a method, a click that lands before React hydrates submits the
  // form natively as GET: the password ends up in the address bar, the
  // history and the server's access log. Measured on the sign-up form.
  it.each(["components/RegisterForm.tsx", "components/LoginForm.tsx"])(
    "%s declares method=\"post\" on every <form>",
    async (file) => {
      const { readFileSync } = await import("node:fs");
      const src = readFileSync(file, "utf8");
      const forms = src.match(/<form\b[^>]*>/g) ?? [];
      expect(forms.length).toBeGreaterThan(0);
      for (const tag of forms) expect(tag).toContain('method="post"');
    },
  );
});
