import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import {
  ORDER_STATUSES,
  STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  STATUS_LABELS,
  isTerminal,
  legalNextStates,
} from "@/lib/orders/status";

/**
 * ORD1-a1 — the admin's order list and order page read labels, colours and order
 * through the reader. Rendered here for real, in both states of the
 * `orderWorkspace` flag, for every status and a legacy string, on a real libSQL
 * file: an empty table (every live shop today) and a table seeded 1:1 must give
 * the same bytes, and those bytes must carry today's labels, colours, order and
 * sentences.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const state = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  orderWorkspace: false,
}));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return state.prisma;
  },
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }));
vi.mock("@/lib/brand", () => ({
  getFeatures: async () => ({
    orderWorkspace: state.orderWorkspace,
    orderAi: false,
    fulfillmentPdf: true,
    returns: true,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import AdminOrderPage from "@/app/admin/ordrer/[id]/page";
import AdminOrdersPage from "@/app/admin/ordrer/page";
import { seedOrderStatuses } from "@/lib/orders/status-seed";

// Each test runs real routes or renders real pages on a real database file: a
// busy runner must not turn slow into red.
vi.setConfig({ testTimeout: 30_000 });

const LEGACY = "legacy_weird";
const EVERY_STATUS = [...ORDER_STATUSES, LEGACY];
const FLAG_STATES = [
  ["the plain pages (orderWorkspace off, the default)", false],
  ["the workspace (orderWorkspace on)", true],
] as const;

const orderId = (status: string) => `order-${status}`;

let dir = "";
let raw: Client;

beforeEach(async () => {
  if (!sqlite) return;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  dir = mkdtempSync(join(tmpdir(), "cw-order-status-admin-"));
  const url = `file:${join(dir, "shop.db")}`;
  raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  state.orderWorkspace = false;

  const db = state.prisma;
  await db.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  await db.product.create({
    data: { id: "mug", slug: "mug", name: "Plain Mug", description: "", priceDkk: 12900, images: "[]", categoryId: "cat", stock: 5 },
  });
  let minute = 0;
  for (const status of EVERY_STATUS) await addOrder(status, minute++);
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  if (!sqlite) return;
  await state.prisma.$disconnect();
  raw.close();
  rmSync(dir, { recursive: true, force: true });
});

function addOrder(status: string, minute = 60) {
  return state.prisma.order.create({
    data: {
      id: orderId(status),
      email: "buyer@shop.example.test",
      shippingName: "Buyer Example",
      shippingAddress: "Example Road 12",
      shippingZip: "1234",
      shippingCity: "Exampleton",
      subtotalDkk: 12900,
      shippingDkk: 0,
      totalDkk: 12900,
      status,
      createdAt: new Date(Date.UTC(2026, 9, 1, 10, minute)),
      items: { create: { productId: "mug", productName: "Plain Mug", unitPriceDkk: 12900, quantity: 1 } },
    },
  });
}

const listPage = async () =>
  renderToStaticMarkup(await AdminOrdersPage({ searchParams: Promise.resolve({}) }));
const orderPage = async (status: string) =>
  renderToStaticMarkup(await AdminOrderPage({ params: Promise.resolve({ id: orderId(status) }) }));

/** Every page this slice touches, on the table as it stands now. */
async function everyPage() {
  const pages: Record<string, string> = { list: await listPage() };
  for (const status of EVERY_STATUS) pages[status] = await orderPage(status);
  return pages;
}

/** The status select's options, in the order they stand: [value, text]. */
function options(html: string): [string, string][] {
  const select = /<select[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1] ?? "";
  return [...select.matchAll(/<option value="([^"]*)"[^>]*>(.*?)<\/option>/g)].map((m) => [m[1], m[2]]);
}

const expectedOptions = (keys: readonly (typeof ORDER_STATUSES)[number][]): [string, string][] =>
  keys.map((key) => [
    key,
    `${STATUS_LABELS[key]}${key === "refunded" || key === "partial_refund" ? " (manual — no money moved)" : ""}`,
  ]);

/** The option the status select opens on, which one click on Update writes. */
function preselected(html: string): string | undefined {
  const select = /<select[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1] ?? "";
  return /<option value="([^"]*)"[^>]*\bselected\b/.exec(select)?.[1];
}

describe.skipIf(!sqlite).each(FLAG_STATES)("%s", (_name, orderWorkspace) => {
  beforeEach(() => {
    state.orderWorkspace = orderWorkspace;
  });

  it("the same bytes on an empty table, a table seeded 1:1 and a table that is not there", async () => {
    expect(await state.prisma.orderStatus.count()).toBe(0);
    const empty = await everyPage();

    await seedOrderStatuses(state.prisma);
    expect(await state.prisma.orderStatus.count()).toBe(ORDER_STATUSES.length);
    expect(await everyPage()).toEqual(empty);

    await raw.execute('DROP TABLE "OrderStatus"');
    expect(await everyPage()).toEqual(empty);
  });

  it("the order page offers the machine's next steps, in the machine's order, with today's labels", async () => {
    for (const status of ORDER_STATUSES) {
      const html = await orderPage(status);
      expect(options(html), status).toEqual(expectedOptions(legalNextStates(status)));
    }
  });

  it("a shop's row shows: its label on the list and the order page, its colour on the badge", async () => {
    await state.prisma.orderStatus.create({
      data: { key: "paid", label: "Betalt", color: "bg-pink-100 text-pink-800", sortOrder: 20 },
    });

    const list = await listPage();
    expect(list).toContain("Betalt");
    expect(list).not.toMatch(/>Paid</);
    // The shop's colour takes the badge: on the plain table it replaces the tone, not joins it.
    const badge = /class="([^"]*)">Betalt</.exec(list)?.[1] ?? "";
    expect(badge).toContain("bg-pink-100 text-pink-800");
    expect(badge).not.toMatch(/bg-emerald|text-emerald/);

    const page = await orderPage("paid");
    expect(page).toContain("Betalt");
    if (orderWorkspace) expect(page).toContain("bg-pink-100 text-pink-800");

    // The row one step back offers it under that label too.
    expect(options(await orderPage("pending_payment"))).toContainEqual(["paid", "Betalt"]);
    // And a status with no row of its own is as it was.
    expect(list).toContain(STATUS_LABELS.shipped);
  });

  it("a shop's order moves the next steps, and only once it has changed the order", async () => {
    await seedOrderStatuses(state.prisma);
    expect(options(await orderPage("paid")).map(([key]) => key)).toEqual(legalNextStates("paid"));

    await state.prisma.orderStatus.update({ where: { key: "refunded" }, data: { sortOrder: -1 } });

    expect(options(await orderPage("paid")).map(([key]) => key)).toEqual([
      "refunded",
      "shipped",
      "cancelled",
      "partial_refund",
      "processing",
    ]);
  });

  it("a changed order moves the options, never the one the control opens on", async () => {
    // Only a label, as a shop would fill the row in by hand: no number, so the column's 0.
    await state.prisma.orderStatus.create({ data: { key: "paid", label: "Settled" } });

    expect(options(await orderPage("shipped")).map(([key]) => key)).toEqual([
      "refunded",
      "partial_refund",
      "delivered",
      "completed",
    ]);
    for (const status of ORDER_STATUSES) {
      expect(preselected(await orderPage(status)), status).toBe(legalNextStates(status)[0]);
    }
    expect(preselected(await orderPage(LEGACY))).toBe(orderWorkspace ? undefined : ORDER_STATUSES[0]);
  });

  it("an order in a status of the shop's own shows that row's label and colour, and the status is not offered as a move", async () => {
    await state.prisma.orderStatus.create({
      data: { key: "mine", label: "My own status", color: "bg-lime-100 text-lime-800", sortOrder: 15, isPaid: true },
    });
    await addOrder("mine");

    const list = await listPage();
    expect(list).toContain("My own status");
    expect(list).toContain("bg-lime-100 text-lime-800");

    const page = await orderPage("mine");
    expect(page).toContain("My own status");
    if (orderWorkspace) expect(page).toContain("bg-lime-100 text-lime-800");

    for (const html of [page, await orderPage(LEGACY), await orderPage("paid")]) {
      expect(options(html).map(([key]) => key)).not.toContain("mine");
    }
  });

  it("a row's label is text, wherever it stands", async () => {
    await state.prisma.orderStatus.create({
      data: { key: "paid", label: "<img src=x onerror=alert(1)>", sortOrder: 20 },
    });
    for (const html of [await listPage(), await orderPage("paid"), await orderPage("pending_payment")]) {
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    }
  });
});

// "The same bytes" above compares this code with itself, so a wrong word is equal on
// all three tables. These say what the pages said before the table.
describe.skipIf(!sqlite)("what the pages show on an empty table is what they showed before the table", () => {
  it("the plain list: today's label on a tone per status, nothing of the old STATUS_COLORS", async () => {
    const list = await listPage();
    for (const status of ORDER_STATUSES) expect(list).toContain(`>${STATUS_LABELS[status]}</span>`);
    expect(list).toContain(`>${LEGACY}</span>`);
    expect(list).not.toContain(STATUS_COLORS.paid);
    expect(list).toContain("bg-emerald-50 text-emerald-700"); // the success tone, paid and completed
  });

  it("the workspace list: today's label on today's colour; a legacy string on the neutral one", async () => {
    state.orderWorkspace = true;
    const list = await listPage();
    for (const status of ORDER_STATUSES) {
      expect(list).toContain(`font-bold ${STATUS_COLORS[status]}">${STATUS_LABELS[status]}</span>`);
    }
    expect(list).toContain(`font-bold ${STATUS_COLOR_FALLBACK}">${LEGACY}</span>`);
  });

  it("the plain order page: a legacy string may go to any of the 12, in the order of ORDER_STATUSES", async () => {
    const page = await orderPage(LEGACY);
    expect(options(page)).toEqual(expectedOptions(ORDER_STATUSES));
    expect(page).toContain(`Change status from ${LEGACY} to`);
  });

  it("the plain order page: a final status says so in today's words, by its label and not its key", async () => {
    for (const status of ORDER_STATUSES.filter(isTerminal)) {
      expect(await orderPage(status), status).toContain(
        `>This order is ${STATUS_LABELS[status].toLowerCase()}. That is a final status, so it cannot be changed.</p>`,
      );
    }
    // The one final status whose label in lower case is not its key, so the one that tells them apart.
    expect(await orderPage("partial_refund")).toContain(">This order is partially refunded. ");
  });

  it("the plain order page: any other status names itself in today's words, by its label and not its key", async () => {
    for (const status of ORDER_STATUSES.filter((key) => !isTerminal(key))) {
      expect(await orderPage(status), status).toContain(`>Change status from ${STATUS_LABELS[status]} to</label>`);
    }
    expect(await orderPage("flagged_review")).toContain(">Change status from Needs review to</label>");
  });

  it("the workspace order page: today's badge", async () => {
    state.orderWorkspace = true;
    for (const status of ORDER_STATUSES) {
      expect(await orderPage(status)).toContain(`font-bold ${STATUS_COLORS[status]}">${STATUS_LABELS[status]}</span>`);
    }
    expect(await orderPage(LEGACY)).toContain(`font-bold ${STATUS_COLOR_FALLBACK}">${LEGACY}</span>`);
  });

  it("the workspace order page: a status with no way out says so in today's words, and no other does", async () => {
    state.orderWorkspace = true;
    const noWayOut = ">No further status changes are possible (terminal or unknown status).</p>";
    for (const status of ORDER_STATUSES) {
      const page = await orderPage(status);
      if (isTerminal(status)) expect(page, status).toContain(noWayOut);
      else expect(page, status).not.toContain(noWayOut);
    }
    expect(await orderPage(LEGACY)).toContain(noWayOut);
  });
});

describe.skipIf(!sqlite)("the plain order page's sentences under a shop's row", () => {
  it("a final status takes the shop's label, lowered as today's are, and the machine says it is final, not the row", async () => {
    // Only a label, so the column's `isFinal: false`, and no word of it is in the key.
    await state.prisma.orderStatus.create({ data: { key: "partial_refund", label: "Part Refund Agreed" } });

    const page = await orderPage("partial_refund");
    expect(page).toContain(">This order is part refund agreed. That is a final status, so it cannot be changed.</p>");
    expect(options(page)).toEqual([]);
  });

  it("any other status takes the shop's label as written, also when its row says it is final", async () => {
    await state.prisma.orderStatus.create({ data: { key: "paid", label: "Money In", isFinal: true } });
    await state.prisma.orderStatus.create({ data: { key: "mine", label: "My Own Status" } });
    await addOrder("mine");

    const paid = await orderPage("paid");
    expect(paid).toContain(">Change status from Money In to</label>");
    expect(paid).not.toContain("That is a final status");
    expect(await orderPage("mine")).toContain(">Change status from My Own Status to</label>");
  });
});
