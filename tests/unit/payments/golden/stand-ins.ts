import { vi } from "vitest";

import { network, world } from "./world";

/**
 * PAY-F1-0, the golden record: what stands in for the world outside the shop.
 *
 * Stripe's network calls and the mail provider, as in on-order-paid-replay-db. Beside
 * them only what has no shop in it: the request (cookie, session, the signed-in admin),
 * the two things that leave the process (the marketing event, Sentry), Next's cache,
 * and the shop's config, for its flags, its shipping policy and a test currency.
 *
 * Everything between those and the database is the real code. lib/stripe.ts is real,
 * so the SDK receives what production sends it, and the SDK's own signature check
 * runs on every delivery.
 *
 * Imported first by shop.ts, so these are registered before anything loads the modules
 * they replace. It imports nothing they replace, so no factory can wait on itself.
 */

vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  const NOT_NETWORK = new Set(["webhooks", "errors"]);

  /** One resource: every method records its arguments, then asks `network`. */
  const resource = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method) => {
          const path = `${name}.${String(method)}`;
          return (...args: unknown[]) => {
            world.sdk.push([path, ...args]);
            return network(path)(...args);
          };
        },
      },
    );

  // The real SDK, signature check included, with no way onto the network: every
  // resource it has is replaced, so a call nobody planned for is recorded rather
  // than sent.
  class StandIn extends actual.default {
    constructor(...args: ConstructorParameters<typeof actual.default>) {
      super(...args);
      world.clients.push(args);
      for (const key of Object.keys(this)) {
        const value = (this as unknown as Record<string, unknown>)[key];
        if (key.startsWith("_") || NOT_NETWORK.has(key)) continue;
        if (typeof value !== "object" || value === null) continue;
        (this as unknown as Record<string, unknown>)[key] = resource(key);
      }
    }
  }
  return { ...actual, default: StandIn, Stripe: StandIn };
});

// The real client, with one seam: a step can run just before a call, to put
// another path in between a read and its write, or to make the call fail.
vi.mock("@/lib/db", () => {
  const run = (step: string) => {
    const hook = world.before.get(step);
    world.before.delete(step);
    return hook?.();
  };
  return {
    /** Read by shop.ts: a test file that imported anything before it is refused. */
    standIn: true,
    isPostgresDriver: () => false,
    get prisma() {
      return new Proxy(world.prisma, {
        get(target, key) {
          if (key === "$transaction" && world.before.has("$transaction")) {
            return async (arg: never) => {
              await run("$transaction");
              return target.$transaction(arg);
            };
          }
          const value = Reflect.get(target, key, target);
          if (typeof key !== "string" || key.startsWith("$") || typeof value !== "object" || value === null) {
            return typeof value === "function" ? value.bind(target) : value;
          }
          return new Proxy(value as object, {
            get(delegate, method) {
              const original = Reflect.get(delegate, method);
              const step = `${key}.${String(method)}`;
              // Untouched unless a step is set: an array `$transaction` needs the
              // client's own lazy promises.
              if (!world.before.has(step)) return original;
              return async (args: never) => {
                await run(step);
                return (original as (a: never) => unknown).call(delegate, args);
              };
            },
          });
        },
      });
    },
  };
});

vi.mock("@/lib/mailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mailer")>();
  // The lines of a mail come from rows that promise no order, so the record sorts them.
  const inOrder = (data: { items?: { productName: string }[] }) =>
    data.items
      ? { ...data, items: [...data.items].sort((a, b) => a.productName.localeCompare(b.productName)) }
      : data;
  const mail = (name: string) => async (data: object) => {
    world.mails.push([name, inOrder(data)]);
    const fault = world.mailFaults.get(name);
    if (fault) throw fault;
  };
  const sends = Object.keys(actual).filter((key) => /^send[A-Z]/.test(key));
  return {
    ...actual,
    ...Object.fromEntries(sends.map((key) => [key, mail(key)])),
    mailer: { sendOrderConfirmation: mail("sendOrderConfirmation") },
  };
});

vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: async (...args: unknown[]) => {
    world.events.push(args);
    return false;
  },
  MARKETING_EVENTS: { orderPlaced: "cartwright.order.placed" },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => {
    world.sentry.push(args);
  },
}));

// The real notifyOwnerOfPaidOrder, on a shop with its flag on. The shipping-zone flag
// is the runtime one (lib/shipping/zones.ts reads getBrand), off unless a test turns it on.
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({
    features: { ownerOrderEmail: true, shippingZones: world.shippingZonesOn },
    emails: { admin: "owner@shop.example.test" },
    url: "https://shop.example.test",
  }),
  getFeatures: async () => ({ fxAutoUpdate: world.fxAutoUpdate }),
}));

// The shipping policy and a currency are fixed, so the figures in the record hold
// in any fork. XTS is ISO 4217's code reserved for tests: no shop has it as its own.
vi.mock("@/brand.config", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/brand.config")>();
  return {
    ...real,
    brand: {
      ...real.brand,
      ecommerceEnabled: true,
      features: {
        ...real.brand.features,
        get subscriptions() {
          return world.subscriptionsOn;
        },
        // A customer's own currency comes the real way: these two flags and a cookie.
        get currencySwitcher() {
          return world.checkoutCurrency !== null;
        },
        get multiCurrency() {
          return world.checkoutCurrency !== null;
        },
      },
      policies: {
        ...real.brand.policies,
        shippingDefaultDkk: 4900,
        shippingFreeThresholdDkk: 200000,
        supportedCurrencies: {
          ...real.brand.policies.supportedCurrencies,
          [real.brand.policies.currency]: { rate: 1, label: "The shop's own" },
          XTS: { rate: 0.5, label: "Test currency" },
        },
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = { cart_session: world.cartSession, cw_currency: world.checkoutCurrency }[name];
      return value ? { value } : undefined;
    },
    set: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", () => ({
  auth: async () => (world.signedIn ? { user: { id: world.signedIn } } : null),
}));
// The real one redirects anyone else away, which a server action meets as a throw.
vi.mock("@/lib/admin", () => ({
  requireAdmin: async () => {
    if (!world.admin) throw new Error("not an admin");
    return { user: { id: world.admin } };
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    world.revalidated.push(args);
  },
}));
