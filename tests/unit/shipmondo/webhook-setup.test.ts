import { describe, expect, it, vi } from "vitest";

/** Registering the plugin's one Shipmondo webhook (plugins/shipmondo/lib/webhook-setup.ts). */
const market = vi.hoisted(() => ({ brand: { url: "https://shop.example.dk/", storeName: "Northbound" } }));
vi.mock("@/brand.config", () => ({ brand: market.brand }));

import { findOurWebhook, isPublicEndpoint, registerWebhook, webhookEndpoint } from "@/plugins/shipmondo/lib/webhook-setup";

const CONFIG = { apiUser: "u", apiKey: "k", baseUrl: "https://sandbox.shipmondo.com/api/public/v3", webhookKey: "wk" };
const OURS = { id: 5, endpoint: "https://shop.example.dk/api/shipmondo/webhook", resource_name: "Shipments", action: "create" };

function shipmondo(existing: unknown[]) {
  return vi.fn(async (_url: URL, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(JSON.stringify({ id: 6, ...JSON.parse(String(init.body)) }), { status: 201 })
      : new Response(JSON.stringify(existing), { status: 200 }),
  );
}

describe("webhook setup", () => {
  it("points at this site's route, and knows which URLs Shipmondo can reach", () => {
    expect(webhookEndpoint()).toBe("https://shop.example.dk/api/shipmondo/webhook");
    expect(isPublicEndpoint("https://shop.example.dk/api/shipmondo/webhook")).toBe(true);
    expect(isPublicEndpoint("http://shop.example.dk/x")).toBe(false);
    expect(isPublicEndpoint("https://localhost:3000/x")).toBe(false);
    expect(isPublicEndpoint("https://127.0.0.1/x")).toBe(false);
  });

  it("registers Shipments: create, signed with the shop's key", async () => {
    const fetchImpl = shipmondo([]);
    const hook = await registerWebhook(CONFIG, { fetchImpl: fetchImpl as never });
    expect(hook).toMatchObject({ id: 6 });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({
      name: "Northbound (Cartwright)",
      endpoint: "https://shop.example.dk/api/shipmondo/webhook",
      key: "wk",
      action: "create",
      resource_name: "Shipments",
    });
  });

  it("leaves a webhook that is already there, and creates no second", async () => {
    const fetchImpl = shipmondo([{ id: 1, endpoint: "https://elsewhere/x", resource_name: "Shipments", action: "create" }, OURS]);
    expect(await registerWebhook(CONFIG, { fetchImpl: fetchImpl as never })).toEqual(OURS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(findOurWebhook([OURS as never])).toEqual(OURS);
  });

  it("prefers an active webhook, and registers a fresh one beside one Shipmondo deactivated", async () => {
    const inactive = { ...OURS, id: 4, active: false };
    expect(findOurWebhook([inactive as never, { ...OURS, active: true } as never])).toMatchObject({ id: 5 });
    expect(findOurWebhook([inactive as never])).toMatchObject({ id: 4, active: false });

    const fetchImpl = shipmondo([inactive]);
    expect(await registerWebhook(CONFIG, { fetchImpl: fetchImpl as never })).toMatchObject({ id: 6 });
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "POST"]);
  });

  it("reports a deactivated webhook as inactive, not registered", async () => {
    const { webhookSetup } = await import("@/plugins/shipmondo/lib/webhook-setup");
    const fetchImpl = shipmondo([{ ...OURS, active: false }]);
    expect(await webhookSetup(CONFIG, { fetchImpl: fetchImpl as never })).toMatchObject({ state: "inactive" });
  });

  it("refuses without a webhook key, and from a site Shipmondo cannot reach", async () => {
    await expect(registerWebhook({ ...CONFIG, webhookKey: null })).rejects.toThrow(/SHIPMONDO_WEBHOOK_KEY/);
    market.brand.url = "http://localhost:3000";
    await expect(registerWebhook(CONFIG)).rejects.toThrow(/cannot reach/);
    market.brand.url = "https://shop.example.dk/";
  });
});
