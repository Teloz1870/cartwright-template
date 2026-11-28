import { vi, type Mock } from "vitest";

import type { PrismaClient } from "@/app/generated/prisma/client";

/** PAY-F1-0: what the stand-ins (./stand-ins.ts) recorded, and what they are told to do. */

export type SdkCall = [method: string, ...args: unknown[]];
export type MailSent = [mail: string, data: unknown];

export const world = {
  prisma: null as unknown as PrismaClient,
  /** Every Stripe method the code called, in order. */
  sdk: [] as [string, ...unknown[]][],
  /** The stand-in behind each Stripe method, by "resource.method". */
  network: new Map<string, Mock>(),
  /** `new Stripe(...)`, each time lib/stripe.ts built a client. */
  clients: [] as unknown[][],
  /** Every mail handed to the provider, in order. */
  mails: [] as [string, unknown][],
  /** Mails the provider refuses, by name: the error it throws. */
  mailFaults: new Map<string, Error>(),
  events: [] as unknown[][],
  sentry: [] as unknown[][],
  revalidated: [] as unknown[][],
  /** Runs once before a database call, by "$transaction" or "model.method". */
  before: new Map<string, () => unknown>(),
  /** The request. Null means no cookie or no session. */
  cartSession: "sess-1" as string | null,
  signedIn: null as string | null,
  /** The signed-in admin; null is a request from anyone else. */
  admin: "admin" as string | null,
  /** The customer's currency cookie, and multi-currency on; null is neither. */
  checkoutCurrency: null as string | null,
  /** `features.fxAutoUpdate`: today's rates, saved in the database, beat the static table. */
  fxAutoUpdate: false,
  /** `brand.features.subscriptions`. */
  subscriptionsOn: false,
  /** The runtime flag `shippingZones`, as getBrand() reads it: zone rates price the order. */
  shippingZonesOn: false,
};

/** The stand-in for one Stripe method, created on first use. */
export function network(method: string) {
  let fn = world.network.get(method);
  if (!fn) {
    fn = vi.fn();
    world.network.set(method, fn);
  }
  return fn;
}
