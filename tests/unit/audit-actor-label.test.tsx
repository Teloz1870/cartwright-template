// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REPO_ROOT, stripComments, walkCode } from "../helpers/claims";

/**
 * AUDIT-ACTOR-LABEL — `/admin/audit` badges each row by its actor prefix, and
 * knew only some of them. The Stripe webhook's refund, dispute and
 * payment_not_applied rows (`stripe-webhook:system`) — the money rows an
 * owner most needs to find — showed as "Ukendt", a Danish word in an admin
 * that is English by product decision (see admin-surface-language.test.ts).
 *
 * The prefixes are read from the code that WRITES them — the `AuditActor`
 * union and every `actor: "<prefix>:…"` literal — not from a list copied into
 * this file, so a new writer without a badge fails here. A badge is per
 * PREFIX, not per role: `user:` is written for admins and for a signed-in
 * customer's own subscription actions alike, and both are badged
 * "Admin (web)" (the gap is documented in actor-label.ts).
 *
 * The page half renders the real page with its real client leaves — the
 * payload viewer and the revert button, through the real revert server
 * action — and compares every string a reader can see against an exact
 * English list. An allowlist, not a blacklist of Danish words: a new label,
 * or one put back in Danish, is a different string and fails.
 */

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  invokeTool: vi.fn(),
  confirm: vi.fn(() => true),
}));

// The data behind the page (the server action itself stays real).
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin-1", role: "admin" } }) }));
vi.mock("@/lib/audit", () => ({ listAuditEntries: async () => mocks.rows }));
vi.mock("@/lib/tools/registry", () => ({
  getTool: (name: string) => (name === "products.delete" ? { revertible: true } : undefined),
  invokeTool: mocks.invokeTool,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { actorLabel } = await import("@/app/admin/audit/actor-label");
const { default: AdminAuditPage } = await import("@/app/admin/audit/page");

const read = (rel: string) => stripComments(readFileSync(path.join(REPO_ROOT, rel), "utf8"));

/** `| \`apikey:${string}\`` → "apikey" */
function unionPrefixes(): string[] {
  const src = read("lib/audit.ts");
  const start = src.indexOf("export type AuditActor");
  const union = src.slice(start, src.indexOf(";", start));
  return [...union.matchAll(/`([\w-]+):\$\{string\}`/g)].map((m) => m[1]);
}

/** `actor: "stripe-webhook:system"`, `` actor: `user:${id}` `` → the prefix. */
function writtenPrefixes(): Map<string, string> {
  const found = new Map<string, string>();
  for (const rel of ["app", "lib", "plugins"].flatMap((root) => walkCode(root))) {
    if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
    for (const m of read(rel).matchAll(/\bactor:\s*["'`]([a-z][\w-]*):/g)) {
      if (!found.has(m[1])) found.set(m[1], rel);
    }
  }
  return found;
}

/** Every badge, exactly — the English an owner reads, per actor prefix. */
const BADGE: Record<string, string> = {
  apikey: "AI (API-key)",
  user: "Admin (web)",
  admin: "Admin (web)",
  "operator-chat": "Admin (chat)",
  annotation: "Admin (in-place edit)",
  "storefront-chat": "Customer chat",
  "storefront-voice": "Customer voice",
  "oauth-register": "Client registration",
  "stripe-webhook": "Stripe webhook",
  system: "System",
  mystery: "Unknown",
};

describe("/admin/audit has a badge for every actor prefix the engine writes", () => {
  it("the Stripe webhook's rows get their own badge", () => {
    expect(actorLabel("stripe-webhook:system")).toEqual({ label: "Stripe webhook", tone: "neutral" });
  });

  it("reads the writers it claims to (a vacuous scan would pass anything)", () => {
    const union = unionPrefixes();
    expect(union).toEqual(expect.arrayContaining(["apikey", "user", "system", "oauth-register"]));
    expect([...writtenPrefixes().keys()]).toEqual(expect.arrayContaining(["stripe-webhook", "system"]));
    // …and an actor nothing writes still falls through.
    expect(actorLabel("mystery:x").label).toBe("Unknown");
  });

  it("every prefix in the AuditActor union has a label", () => {
    const unknown = unionPrefixes().filter((p) => actorLabel(`${p}:x`).label === "Unknown");
    expect(unknown, "these actors render as Unknown in /admin/audit").toEqual([]);
  });

  it("every prefix a writer puts in the table has a label", () => {
    const unknown = [...writtenPrefixes()]
      .filter(([p]) => actorLabel(`${p}:x`).label === "Unknown")
      .map(([p, rel]) => `${p} (${rel})`);
    expect(unknown, "these actors render as Unknown in /admin/audit").toEqual([]);
  });

  it("each label is exactly the English one listed here", () => {
    const prefixes = [...new Set([...unionPrefixes(), ...writtenPrefixes().keys(), ...Object.keys(BADGE)])];
    const labels = Object.fromEntries(prefixes.map((p) => [p, actorLabel(`${p}:x`).label]));
    expect(labels).toEqual(BADGE);
  });
});

// ── the page ──────────────────────────────────────────────────────────────────

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const row = (id: string, actor: string, tool: string, extra: Record<string, unknown> = {}) => ({
  id,
  actor,
  tool,
  ok: true,
  createdAt: new Date(Date.UTC(2026, 9, 24, 12, 30)),
  requestId: `req-${id}-0000000`,
  argsJson: null,
  beforeJson: null,
  afterJson: null,
  errorMsg: null,
  ...extra,
});

/** The en-GB short date + time, from any time zone: `24/10/2026, 12:30`. */
const EN_GB_DATE = /^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/;

/** Every string on the page a reader can see or hear, in document order. */
function visibleStrings(): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent?.trim();
      if (text) out.push(EN_GB_DATE.test(text) ? "<date>" : text);
      continue;
    }
    for (const attr of ["placeholder", "title", "aria-label", "alt"]) {
      const value = (n as Element).getAttribute(attr)?.trim();
      if (value) out.push(`[${attr}] ${value}`);
    }
  }
  return out;
}

const buttons = (label: string) => [...host.querySelectorAll("button")].filter((b) => b.textContent === label);
const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
  });
};

/** Row by row: badge, tool, [Error], date, request id, the payload toggle. */
const ROWS_CLOSED = [
  "Stripe webhook", "orders.refund", "<date>", "· req:", "req-a1-0", "Show payload",
  "Admin (web)", "products.delete", "<date>", "· req:", "req-a2-0", "Show payload", "Roll back",
  "Customer chat", "cart.add", "Error", "<date>", "· req:", "req-a3-0", "Show payload",
  "Unknown", "misc.thing", "<date>", "· req:", "req-a4-0", "Show payload",
];

const HEADER_AND_FILTERS = [
  "Audit log",
  'Complete history of every tool call (write and destructive operations). Click "Show payload" to see input/before/after snapshots. Destructive tools marked revertible can be rolled back with one click.',
  "Tool prefix",
  "[placeholder] e.g. 'products.' or 'marketing'",
  "Actor prefix",
  "[placeholder] e.g. 'apikey:' or 'user:'",
  "Status",
  "All",
  "Success only",
  "Errors only",
  "Filter",
  "Reset",
  "4 entries",
];

describe("/admin/audit reads in English, every label on it", () => {
  beforeEach(async () => {
    mocks.rows = [
      row("a1", "stripe-webhook:system", "orders.refund", { argsJson: '{"order":"o1"}' }),
      row("a2", "user:admin-1", "products.delete", {
        argsJson: '{"slug":"tea"}',
        beforeJson: '{"name":"Tea"}',
        afterJson: '{"deleted":true}',
      }),
      row("a3", "storefront-chat:s1", "cart.add", { ok: false, errorMsg: "out of stock" }),
      row("a4", "mystery:x", "misc.thing"),
    ];
    mocks.invokeTool.mockReset();
    mocks.confirm.mockClear();
    vi.stubGlobal("confirm", mocks.confirm);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const page = await AdminAuditPage({ searchParams: Promise.resolve({}) });
    await act(async () => root.render(page));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("the page as it opens: header, filters and each row's badge, date and controls", () => {
    expect(visibleStrings()).toEqual([...HEADER_AND_FILTERS, ...ROWS_CLOSED]);
  });

  it("an opened payload: its toggle and every section heading", async () => {
    for (const toggle of buttons("Show payload")) await click(toggle);
    expect(visibleStrings().slice(HEADER_AND_FILTERS.length)).toEqual([
      "Stripe webhook", "orders.refund", "<date>", "· req:", "req-a1-0",
      "Hide ↑", "Input (args)", '{\n  "order": "o1"\n}',
      "Admin (web)", "products.delete", "<date>", "· req:", "req-a2-0",
      "Hide ↑", "Input (args)", '{\n  "slug": "tea"\n}', "Before state", '{\n  "name": "Tea"\n}',
      "After state", '{\n  "deleted": true\n}',
      "Roll back",
      "Customer chat", "cart.add", "Error", "<date>", "· req:", "req-a3-0",
      "Hide ↑", "Error", "out of stock",
      "Unknown", "misc.thing", "<date>", "· req:", "req-a4-0",
      "Hide ↑",
    ]);
  });

  it("a rollback: the confirm prompt, the pending label and the server action's summary", async () => {
    let finish!: (r: unknown) => void;
    mocks.invokeTool.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    await click(buttons("Roll back")[0]);
    expect(mocks.confirm).toHaveBeenCalledWith(
      "Roll back 'products.delete'? This will try to restore the before state from the audit snapshot.",
    );
    expect(buttons("Rolling back…")).toHaveLength(1);

    await act(async () => finish({ ok: true, result: { restored: { slug: "tea", name: "Tea" } } }));
    expect(visibleStrings()).toContain("Restored: Tea");
    expect(mocks.invokeTool).toHaveBeenCalledWith(
      "audit.revert",
      { auditLogId: "a2", confirm: true },
      expect.objectContaining({ actor: "user:admin-1" }),
      expect.any(Array),
    );
  });
});
