import "server-only";

/**
 * Where the plugin finds its Shipmondo credentials, and which Shipmondo it
 * talks to. Read at the call, never at import (AGENTS.md "Never construct
 * heavy resources at import time"): a shop without a key loads this module
 * for free and only fails the call that needed Shipmondo.
 *
 * Today the credentials come from the environment, as owner decision B62 has
 * it (the owner fetches the API user + key under Shipmondo → Settings →
 * Integrations → API and puts them in `.env.local`). Encrypted storage in
 * `/admin/integrations` is a later slice and slots in behind this function.
 */
export const SHIPMONDO_BASE_URL = {
  production: "https://app.shipmondo.com/api/public/v3",
  sandbox: "https://sandbox.shipmondo.com/api/public/v3",
} as const;

export type ShipmondoConfig = {
  apiUser: string;
  apiKey: string;
  baseUrl: string;
  /** Shared key Shipmondo signs its webhooks with (HS256 JWT); null = webhooks refused. */
  webhookKey: string | null;
};

export class ShipmondoNotConfiguredError extends Error {
  constructor() {
    super(
      "Shipmondo is not configured: set SHIPMONDO_API_USER and SHIPMONDO_API_KEY (Shipmondo → Settings → Integrations → API).",
    );
    this.name = "ShipmondoNotConfiguredError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/** The config, or null when the shop has not connected Shipmondo. */
export function readShipmondoConfig(env: Env = process.env): ShipmondoConfig | null {
  const apiUser = env.SHIPMONDO_API_USER?.trim();
  const apiKey = env.SHIPMONDO_API_KEY?.trim();
  if (!apiUser || !apiKey) return null;
  return {
    apiUser,
    apiKey,
    baseUrl: env.SHIPMONDO_SANDBOX === "1" ? SHIPMONDO_BASE_URL.sandbox : SHIPMONDO_BASE_URL.production,
    webhookKey: env.SHIPMONDO_WEBHOOK_KEY?.trim() || null,
  };
}

export function requireShipmondoConfig(env: Env = process.env): ShipmondoConfig {
  const config = readShipmondoConfig(env);
  if (!config) throw new ShipmondoNotConfiguredError();
  return config;
}
