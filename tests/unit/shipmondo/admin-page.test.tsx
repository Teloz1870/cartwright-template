import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** /admin/shipmondo (plugins/shipmondo/admin/ShipmondoAdminPage.tsx), rendered with its data mocked. */
const mocks = vi.hoisted(() => ({
  features: { shipmondo: true } as Record<string, boolean>,
  findMany: vi.fn(),
  endpoint: "https://shop.example.dk/api/shipmondo/webhook",
  webhook: { state: "missing" } as Record<string, unknown>,
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "a1" } }) }));
vi.mock("@/lib/db", () => ({ prisma: { order: { findMany: mocks.findMany } } }));
vi.mock("@/lib/brand", () => ({ getFeatures: async () => mocks.features }));
vi.mock("@/plugins/shipmondo/admin/actions", () => ({
  sendOrderAction: async () => {},
  sendAllAction: async () => {},
  registerWebhookAction: async () => {},
}));
vi.mock("@/plugins/shipmondo/lib/webhook-setup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/plugins/shipmondo/lib/webhook-setup")>()),
  webhookEndpoint: () => mocks.endpoint,
  webhookSetup: async () => mocks.webhook,
}));

const row = (id: string, status: string, note?: string) => ({
  id,
  orderNumber: Number(id.replace(/\D/g, "")),
  shippingName: `Kunde ${id}`,
  status,
  totalDkk: 12500,
  paidAt: new Date("2026-11-05T09:00:00Z"),
  notes: note ? [{ body: note, createdAt: note.startsWith("Sending") && id === "o5" ? new Date(Date.now() - 60 * 60_000) : new Date() }] : [],
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SHIPMONDO_API_USER", "u");
  vi.stubEnv("SHIPMONDO_API_KEY", "k");
  vi.stubEnv("SHIPMONDO_SANDBOX", "1");
  mocks.features = { shipmondo: true };
  mocks.endpoint = "https://shop.example.dk/api/shipmondo/webhook";
  mocks.webhook = { state: "missing" };
  vi.stubEnv("SHIPMONDO_WEBHOOK_KEY", "wk");
  const all = [
    row("o1", "paid"),
    row("o2", "paid", "Sent to Shipmondo as sales order 501"),
    row("o3", "processing", "Could not send to Shipmondo: Shipmondo answered 422"),
    row("o4", "shipped"),
    row("o5", "paid", "Sending to Shipmondo…"),
    row("o6", "paid", "Sending to Shipmondo…"),
  ];
  // The page asks three things: which orders Send all would send (ids only), those
  // orders, and the latest of the rest. Unsent = paid/processing with no "sent" note.
  // o6's claim is live (being sent right now), so neither the sweep nor Send all takes it.
  const unsent = all
    .filter((r) => r.status !== "shipped" && !r.notes[0]?.body.startsWith("Sent") && r.id !== "o6")
    .map((r) => r.id);
  mocks.findMany.mockReset().mockImplementation(async (args: { where: { id?: { in?: string[]; notIn?: string[] } }; select: Record<string, unknown> }) => {
    if (Object.keys(args.select).length === 1) return unsent.map((id) => ({ id }));
    if (args.where.id?.in) return all.filter((r) => args.where.id!.in!.includes(r.id));
    return all.filter((r) => !(args.where.id?.notIn ?? []).includes(r.id));
  });
});

async function html() {
  const { default: Page } = await import("@/plugins/shipmondo/admin/ShipmondoAdminPage");
  return renderToStaticMarkup(await Page());
}

describe("/admin/shipmondo", () => {
  it("shows the connection and each order's state, with Send only where it can go", async () => {
    const page = await html();
    // What Send all would send is listed first, so no unsent order hides behind newer rows.
    expect(page.indexOf("#1")).toBeLessThan(page.indexOf("#2"));
    expect(page).toContain("Connected (sandbox)");
    expect(page).toContain("#1");
    expect(page).toContain("In Shipmondo");
    expect(page).toContain("Failed — see the order");
    // o1 (not sent), o3 (failed, still paid) and o5 (a claim an hour old: a dead run's) can be sent;
    // o2 is there, o4 has shipped, o6 is being sent right now.
    expect(page.match(/>Send</g)?.length).toBe(3);
    expect(page).toContain("Send 3 unsent");
    expect(page).toContain("Stuck — send again");
    expect(page).toContain("Sending…");
  });

  it("says how orders are sent, and keeps Send by hand when the shop sends by hand", async () => {
    expect(await html()).toContain("Automatic");
    vi.stubEnv("SHIPMONDO_SEND_MODE", "manual");
    const page = await html();
    expect(page).toContain("By hand");
    expect(page).not.toContain("Automatic");
    expect(page.match(/>Send</g)?.length).toBe(3);
    expect(page).toContain("Send 3 unsent");
  });

  it("offers no sending while the flag is off or no account is connected", async () => {
    mocks.features = { shipmondo: false };
    let page = await html();
    expect(page).toContain("Off");
    expect(page).not.toMatch(/>Send</);
    expect(page).not.toContain("unsent");

    mocks.features = { shipmondo: true };
    vi.stubEnv("SHIPMONDO_API_KEY", "");
    page = await html();
    expect(page).toContain("Not connected");
    expect(page).not.toMatch(/>Send</);
  });

  it("says what the tracking webhook needs, and offers to register it only when it can work", async () => {
    expect(await html()).toContain("Register webhook");

    mocks.webhook = { state: "registered", webhook: { id: 5 } };
    expect(await html()).toContain("Registered");

    mocks.webhook = { state: "inactive", webhook: { id: 4, active: false } };
    const inactive = await html();
    expect(inactive).toContain("Inactive in Shipmondo");
    expect(inactive).toContain("Register it again");

    mocks.webhook = { state: "missing" };
    vi.stubEnv("SHIPMONDO_WEBHOOK_KEY", "");
    let page = await html();
    expect(page).toContain("SHIPMONDO_WEBHOOK_KEY");
    expect(page).not.toContain("Register webhook");

    vi.stubEnv("SHIPMONDO_WEBHOOK_KEY", "wk");
    mocks.endpoint = "http://localhost:3000/api/shipmondo/webhook";
    page = await html();
    expect(page).toContain("Not reachable");
    expect(page).not.toContain("Register webhook");
  });

  it("offers to send exactly the batch Send all sends, not every unsent row it shows", async () => {
    // Send all takes one batch (here: only o1); o3 and o5 are listed, sendable one by one.
    mocks.findMany.mockImplementation(async (args: { where: { id?: { in?: string[]; notIn?: string[] } }; select: Record<string, unknown> }) => {
      const rows = [row("o1", "paid"), row("o3", "processing", "Could not send to Shipmondo: x")];
      if (Object.keys(args.select).length === 1) return [{ id: "o1" }];
      if (args.where.id?.in) return rows.filter((r) => args.where.id!.in!.includes(r.id));
      return rows.filter((r) => !(args.where.id?.notIn ?? []).includes(r.id));
    });
    const page = await html();
    expect(page).toContain("Send 1 unsent");
    expect(page.match(/>Send</g)?.length).toBe(2);
  });
});
