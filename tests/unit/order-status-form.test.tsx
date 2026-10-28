import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * ORD0 — every operator status change goes through the state machine.
 *
 * The plain order page (the `orderWorkspace` flag off, which is the default)
 * used a form with four fixed statuses and a server action that wrote
 * `Order.status` directly: no transition check, no order note, no audit. A
 * refunded order could be set to paid. The form now calls the same action as
 * the workspace timeline and offers only the moves the machine allows.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/admin/ordrer/actions", () => ({ updateOrderStatusAdmin: vi.fn() }));

import OrderStatusForm, { statusOptions } from "@/components/admin/OrderStatusForm";
import {
  NON_REVENUE_STATUSES,
  ORDER_STATUSES,
  legalNextStates,
  revenueOrderWhere,
} from "@/lib/orders/status";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const optionValues = (html: string) => [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

describe("the plain order page's status form", () => {
  it("offers exactly the legal next statuses of a known status", () => {
    for (const status of ORDER_STATUSES) {
      expect(statusOptions(status)).toEqual(legalNextStates(status));
    }
    const html = renderToStaticMarkup(<OrderStatusForm orderId="o1" currentStatus="paid" />);
    expect(optionValues(html)).toEqual([...legalNextStates("paid")]);
    expect(html).not.toMatch(/value="pending"/); // paid → pending was offered before
  });

  it("a final status offers no move and says why, in English", () => {
    for (const status of ["cancelled", "refunded", "partial_refund"]) {
      const html = renderToStaticMarkup(<OrderStatusForm orderId="o1" currentStatus={status} />);
      expect(optionValues(html)).toEqual([]);
      expect(html).not.toMatch(/<select|<button/);
      expect(html).toMatch(/final\s+status/);
    }
  });

  it("a refund status says, before the click, that no money moves", () => {
    const html = renderToStaticMarkup(<OrderStatusForm orderId="o1" currentStatus="paid" />);
    expect(html).toMatch(/Refunded \(manual — no money moved\)/);
    expect(html).toMatch(/Partially refunded \(manual — no money moved\)/);
  });

  it("a legacy status the machine does not know may go anywhere, as the server allows", () => {
    expect(statusOptions("some_old_value")).toEqual(ORDER_STATUSES);
  });

  it("carries no Danish", () => {
    const html = renderToStaticMarkup(<OrderStatusForm orderId="o1" currentStatus="pending" />);
    expect(html).not.toMatch(/Opdat|Opdaterer/);
    expect(html).toMatch(/Update status/);
  });
});

describe("no operator path writes Order.status around the state machine", () => {
  it("the form calls the guarded action, and the unguarded one is gone", () => {
    const form = read("components/admin/OrderStatusForm.tsx");
    expect(form).toMatch(/from "@\/app\/admin\/ordrer\/actions"/);
    expect(form).not.toMatch(/from "@\/app\/admin\/actions"/);
    const actions = read("app/admin/actions.ts");
    expect(actions).not.toMatch(/export async function updateOrderStatus\b/);
    expect(actions).not.toMatch(/prisma\.order\.update/);
  });

  it("in the admin, its API routes, components and plugins, only the guarded file updates an order at all", () => {
    // Any `order.update(` / `order.updateMany(` — not only the ones whose data
    // literal names `status`: a `data: patch` variable or a nested object would
    // slip past a narrower pattern. The one file allowed holds transitionCore
    // and the refund flow. (Webhooks, crons and order creation live elsewhere
    // and record facts; `lib/tools/orders.ts` is the audited agent tool.)
    const hits = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const p = `${dir}/${name}`;
        if (statSync(join(ROOT, p)).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && /\border\.(update|updateMany|updateManyAndReturn|upsert)\(/.test(read(p))) hits.add(p);
      }
    };
    for (const dir of ["app/admin", "app/api/admin", "components", "plugins"]) walk(dir);
    expect([...hits]).toEqual(["app/admin/ordrer/actions.ts"]);
  });
});

describe("the order page an English admin sees has no Danish on it", () => {
  it("card titles, address labels and totals are English", () => {
    const page = read("app/admin/ordrer/[id]/page.tsx");
    expect(page).not.toMatch(/Kunde|Leveringsadresse|Faktureringsadresse|Varer|Rabat|Fragt|Gratis/);
    for (const word of ["Customer", "Shipping address", "Billing address", "Items", "Discount", "Shipping", "Free"]) {
      expect(page).toContain(word);
    }
    expect(read("app/admin/ordrer/actions.ts")).not.toMatch(/Ulovlig/);
    expect(page).not.toMatch(/pakkeseddel \/ pluk/);
    expect(read("components/admin/OrderTimeline.tsx")).not.toMatch(/Opdat/);
  });
});

describe("what counts as revenue is said once", () => {
  it("the helper excludes exactly the non-revenue statuses", () => {
    expect(NON_REVENUE_STATUSES).toEqual(["cancelled"]);
    expect(revenueOrderWhere()).toEqual({ status: { notIn: ["cancelled"] } });
  });

  it("both totals read it, and neither spells the rule out again", () => {
    for (const p of ["app/admin/page.tsx", "lib/tools/analytics.ts"]) {
      const src = read(p);
      expect(src).toMatch(/revenueOrderWhere\(\)/);
      expect(src).not.toMatch(/not:\s*"cancelled"/);
    }
  });
});
