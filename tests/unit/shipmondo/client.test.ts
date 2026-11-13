import { describe, expect, it, vi } from "vitest";
import { ShipmondoApiError, ShipmondoDeadlineError, createSalesOrder, listPickupPoints, listWebhooks } from "@/plugins/shipmondo/lib/client";
import {
  SHIPMONDO_BASE_URL,
  ShipmondoNotConfiguredError,
  readShipmondoConfig,
  requireShipmondoConfig,
} from "@/plugins/shipmondo/lib/config";

/** The Shipmondo client and its config (plugins/shipmondo/lib/{client,config}.ts), against a stubbed fetch. */
const CONFIG = { apiUser: "user", apiKey: "key", baseUrl: SHIPMONDO_BASE_URL.sandbox, webhookKey: null };

function stubFetch(status: number, body: unknown) {
  return vi.fn(async (_url: URL, _init?: RequestInit) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

describe("config", () => {
  it("is null until both the API user and key are set", () => {
    expect(readShipmondoConfig({})).toBeNull();
    expect(readShipmondoConfig({ SHIPMONDO_API_USER: "u" })).toBeNull();
    expect(() => requireShipmondoConfig({})).toThrow(ShipmondoNotConfiguredError);
  });

  it("talks to production unless SHIPMONDO_SANDBOX is 1", () => {
    const env = { SHIPMONDO_API_USER: " u ", SHIPMONDO_API_KEY: "k" };
    expect(readShipmondoConfig(env)).toEqual({
      apiUser: "u",
      apiKey: "k",
      baseUrl: "https://app.shipmondo.com/api/public/v3",
      webhookKey: null,
    });
    expect(readShipmondoConfig({ ...env, SHIPMONDO_SANDBOX: "1" })?.baseUrl).toBe(
      "https://sandbox.shipmondo.com/api/public/v3",
    );
  });
});

describe("client", () => {
  it("sends Basic auth and the query, leaving out empty parameters", async () => {
    const fetchImpl = stubFetch(200, [{ id: "1", name: "Netto" }]);
    const points = await listPickupPoints(
      { carrier_code: "gls", country_code: "DK", zipcode: "6780", city: undefined },
      { config: CONFIG, fetchImpl: fetchImpl as never },
    );

    expect(points).toEqual([{ id: "1", name: "Netto" }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      "https://sandbox.shipmondo.com/api/public/v3/pickup_points?carrier_code=gls&country_code=DK&zipcode=6780",
    );
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("user:key").toString("base64")}`,
    );
    expect(init?.method).toBe("GET");
  });

  it("posts a JSON body", async () => {
    const fetchImpl = stubFetch(201, { id: 9 });
    await createSalesOrder({ order_id: "1" } as never, { config: CONFIG, fetchImpl: fetchImpl as never });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"order_id":"1"}');
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("keeps Shipmondo's status and message when it refuses", async () => {
    const fetchImpl = stubFetch(422, { error: "zipcode is invalid" });
    const call = listPickupPoints(
      { carrier_code: "gls", country_code: "DK", zipcode: "x" },
      { config: CONFIG, fetchImpl: fetchImpl as never },
    );
    await expect(call).rejects.toBeInstanceOf(ShipmondoApiError);
    await expect(call).rejects.toMatchObject({ status: 422, path: "/pickup_points" });
  });

  it("reads every page of webhooks, 50 at a time", async () => {
    const page = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ id: from + i }));
    const fetchImpl = vi.fn(async (url: URL) => {
      const p = Number(new URL(String(url)).searchParams.get("page"));
      return new Response(JSON.stringify(p === 1 ? page(50, 0) : page(3, 50)), { status: 200 });
    });
    const hooks = await listWebhooks({ config: CONFIG, fetchImpl: fetchImpl as never });
    expect(hooks).toHaveLength(53);
    expect(fetchImpl.mock.calls.map(([u]) => new URL(String(u)).search)).toEqual(["?per_page=50&page=1", "?per_page=50&page=2"]);
  });

  it("starts no request once its deadline is (almost) spent", async () => {
    const fetchImpl = stubFetch(200, []);
    const call = listPickupPoints(
      { carrier_code: "gls", country_code: "DK", zipcode: "6780" },
      { config: CONFIG, fetchImpl: fetchImpl as never, deadline: Date.now() + 500 },
    );
    await expect(call).rejects.toBeInstanceOf(ShipmondoDeadlineError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("turns an abort caused by the deadline into a deadline, not a failure", async () => {
    const hang = vi.fn((_url: URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    const call = listPickupPoints(
      { carrier_code: "gls", country_code: "DK", zipcode: "6780" },
      { config: CONFIG, fetchImpl: hang as never, deadline: Date.now() + 1_200 },
    );
    await expect(call).rejects.toBeInstanceOf(ShipmondoDeadlineError);
  });

  it("a body that stalls past the deadline is a deadline too, not a failure", async () => {
    const stall = vi.fn(async (_url: URL, init?: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason));
          },
        }),
        { status: 200 },
      ),
    );
    const call = listPickupPoints(
      { carrier_code: "gls", country_code: "DK", zipcode: "6780" },
      { config: CONFIG, fetchImpl: stall as never, deadline: Date.now() + 1_200 },
    );
    await expect(call).rejects.toBeInstanceOf(ShipmondoDeadlineError);
  });
});
