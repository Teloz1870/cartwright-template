import "server-only";

import { brand } from "@/brand.config";
import { createWebhook, listWebhooks, type Webhook } from "./client";
import type { ShipmondoConfig } from "./config";

/**
 * The one webhook the plugin needs in the shop's Shipmondo account: "Shipments:
 * create", pointed at this site's /api/shipmondo/webhook and signed with
 * SHIPMONDO_WEBHOOK_KEY. Registering twice finds the first active one and
 * leaves it; one Shipmondo has deactivated counts as missing.
 */
export const WEBHOOK_PATH = "/api/shipmondo/webhook";

export function webhookEndpoint(siteUrl: string = brand.url): string {
  return `${siteUrl.replace(/\/+$/, "")}${WEBHOOK_PATH}`;
}

/** Shipmondo must reach it: an http(s) URL that is not this machine. */
export function isPublicEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname);
  } catch {
    return false;
  }
}

const isOurs = (w: Webhook, endpoint: string) =>
  w.endpoint === endpoint && w.resource_name === "Shipments" && w.action === "create";

/** Our webhook, an active one first; an inactive match is returned only when there is no active one. */
export function findOurWebhook(webhooks: Webhook[], endpoint = webhookEndpoint()): Webhook | null {
  const ours = webhooks.filter((w) => isOurs(w, endpoint));
  return ours.find((w) => w.active !== false) ?? ours[0] ?? null;
}

export type WebhookSetup =
  | { state: "registered"; webhook: Webhook }
  | { state: "inactive"; webhook: Webhook }
  | { state: "missing" }
  | { state: "unreachable"; error: string };

export async function webhookSetup(config: ShipmondoConfig, opts: { fetchImpl?: typeof fetch } = {}): Promise<WebhookSetup> {
  try {
    const ours = findOurWebhook(await listWebhooks({ config, fetchImpl: opts.fetchImpl }));
    if (!ours) return { state: "missing" };
    return ours.active === false ? { state: "inactive", webhook: ours } : { state: "registered", webhook: ours };
  } catch (err) {
    return { state: "unreachable", error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function registerWebhook(
  config: ShipmondoConfig,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<Webhook> {
  if (!config.webhookKey) throw new Error("Set SHIPMONDO_WEBHOOK_KEY first (a long random string, e.g. `openssl rand -hex 32`).");
  const endpoint = webhookEndpoint();
  if (!isPublicEndpoint(endpoint)) {
    throw new Error(`Shipmondo cannot reach ${endpoint}: the site's URL (brand.url) must be public https.`);
  }
  // An inactive one delivers nothing: register a fresh one beside it.
  const existing = findOurWebhook(await listWebhooks({ config, fetchImpl: opts.fetchImpl }), endpoint);
  if (existing && existing.active !== false) return existing;
  return createWebhook(
    {
      name: `${brand.storeName} (Cartwright)`,
      endpoint,
      key: config.webhookKey,
      action: "create",
      resource_name: "Shipments",
    },
    { config, fetchImpl: opts.fetchImpl },
  );
}
