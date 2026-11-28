import "server-only";
import { encryptSecret, decryptSecret } from "@/lib/secret-encryption";

export const SHIPPING_COOKIE_NAME = "last_shipping";
export const SHIPPING_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export type LastShipping = {
  name: string;
  address: string;
  zip: string;
  city: string;
  storedAt: number; // unix ms
};

const STORED_AT_MAX_MS = SHIPPING_COOKIE_MAX_AGE * 1000;

export function encodeShippingCookie(data: Omit<LastShipping, "storedAt">): string {
  const payload: LastShipping = { ...data, storedAt: Date.now() };
  return encryptSecret(JSON.stringify(payload));
}

export function decodeShippingCookie(cookieValue: string | undefined): LastShipping | null {
  if (!cookieValue) return null;
  try {
    const json = decryptSecret(cookieValue);
    if (!json) return null;
    const parsed = JSON.parse(json) as Partial<LastShipping>;
    if (
      typeof parsed.name !== "string" ||
      typeof parsed.address !== "string" ||
      typeof parsed.zip !== "string" ||
      typeof parsed.city !== "string" ||
      typeof parsed.storedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.storedAt > STORED_AT_MAX_MS) return null;
    return parsed as LastShipping;
  } catch {
    return null;
  }
}

export function buildShippingCookieHeader(encoded: string): string {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SHIPPING_COOKIE_NAME}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SHIPPING_COOKIE_MAX_AGE}${secureFlag}`;
}

export function buildShippingCookieClearHeader(): string {
  return `${SHIPPING_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
