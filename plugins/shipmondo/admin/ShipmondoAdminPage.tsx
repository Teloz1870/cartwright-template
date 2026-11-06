import Link from "next/link";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getFeatures } from "@/lib/brand";
import { formatPriceDkk } from "@/lib/format";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminPageHeader,
  AdminTable,
  AdminTableEmpty,
  AdminTbody,
  AdminTd,
  AdminTh,
  AdminThead,
  AdminTr,
  type BadgeTone,
} from "@/components/admin/ui";
import { readShipmondoConfig, SHIPMONDO_BASE_URL } from "../lib/config";
import {
  BATCH,
  CLAIM_NOTE,
  CLAIM_STALE_MS,
  FAILED_NOTE,
  SENT_NOTE,
  SHIPPABLE_STATUSES,
  SWEEP_DAYS,
  paidWithin,
  unsentOrderIds,
} from "../lib/send-order";
import { webhookEndpoint, webhookSetup, isPublicEndpoint, type WebhookSetup } from "../lib/webhook-setup";
import { registerWebhookAction, sendAllAction, sendOrderAction } from "./actions";

/**
 * /admin/shipmondo — the shop's view of what has reached Shipmondo: whether
 * it is connected, and the paid orders of the last SWEEP_DAYS days (the window
 * "Send all" and the sweep work in, so the count it offers is what one click sends).
 * Orders are sent one by one or all at once; the label is then booked in
 * Shipmondo itself.
 */
const DAYS = SWEEP_DAYS;

type Row = {
  id: string;
  orderNumber: number | null;
  shippingName: string;
  status: string;
  totalDkk: number;
  paidAt: Date | null;
  notes: { body: string; createdAt: Date }[];
};

function stateOf(row: Row, now: number): { label: string; tone: BadgeTone; canSend: boolean } {
  const note = row.notes[0]?.body ?? "";
  const shippable = (SHIPPABLE_STATUSES as readonly string[]).includes(row.status);
  if (note.startsWith(SENT_NOTE)) return { label: "In Shipmondo", tone: "success", canSend: false };
  if (note.startsWith(CLAIM_NOTE)) {
    // A claim this old was left by a run that died: the next send clears it.
    return now - row.notes[0].createdAt.getTime() < CLAIM_STALE_MS
      ? { label: "Sending…", tone: "info", canSend: false }
      : { label: "Stuck — send again", tone: "critical", canSend: shippable };
  }
  if (note.startsWith(FAILED_NOTE)) return { label: "Failed — see the order", tone: "critical", canSend: shippable };
  return shippable
    ? { label: "Not sent", tone: "attention", canSend: true }
    : { label: "Not sent", tone: "neutral", canSend: false };
}

const ROW_SELECT = {
  id: true,
  orderNumber: true,
  shippingName: true,
  status: true,
  totalDkk: true,
  paidAt: true,
  notes: {
    where: {
      type: "system",
      OR: [
        { body: { startsWith: SENT_NOTE } },
        { body: { startsWith: CLAIM_NOTE } },
        { body: { startsWith: FAILED_NOTE } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { body: true, createdAt: true },
  },
} satisfies Prisma.OrderSelect;

/** The last DAYS days of paid orders, newest first, each with its latest Shipmondo note; and when they were read. */
async function recentPaidOrders(): Promise<{ rows: Row[]; readAt: number; batch: number }> {
  const readAt = Date.now();
  return { ...(await recentPaidOrderRows(readAt)), readAt };
}

/**
 * The orders "Send all" would send come first — the oldest unsent, as many as
 * one click sends — so none hides behind newer rows; then the latest of the rest.
 */
async function recentPaidOrderRows(readAt: number): Promise<{ rows: Row[]; batch: number }> {
  const unsent = await unsentOrderIds(BATCH, new Date(readAt), { retryRecentFailures: true });
  const [first, rest] = await Promise.all([
    prisma.order.findMany({ where: { id: { in: unsent } }, orderBy: { paidAt: "asc" }, select: ROW_SELECT }),
    prisma.order.findMany({
      where: {
        id: { notIn: unsent },
        status: { in: [...SHIPPABLE_STATUSES, "shipped"] },
        ...paidWithin(new Date(readAt - DAYS * 86_400_000)),
      },
      orderBy: { paidAt: "desc" },
      take: BATCH,
      select: ROW_SELECT,
    }),
  ]);
  // "Send all" sends exactly `unsent`: that, not every unsent row shown, is the count it offers.
  return { rows: [...first, ...rest], batch: unsent.length };
}

export default async function ShipmondoAdminPage() {
  await requireAdmin();
  const [features, config] = [await getFeatures(), readShipmondoConfig()];

  const { rows, readAt, batch } = await recentPaidOrders();
  const webhook: WebhookSetup | null = features.shipmondo && config ? await webhookSetup(config) : null;
  const endpoint = webhookEndpoint();
  const ready = features.shipmondo && config !== null;
  const unsent = batch;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Shipmondo"
        subtitle="Paid orders go to Shipmondo as sales orders; book the label there."
        primaryAction={
          ready && unsent > 0 ? (
            <form action={sendAllAction}>
              <AdminButton type="submit">Send {unsent} unsent</AdminButton>
            </form>
          ) : null
        }
      />

      <AdminCard title="Connection">
        <ul className="space-y-1 text-sm text-sol-ink">
          <li>
            Feature flag:{" "}
            {features.shipmondo ? (
              <AdminBadge tone="success">On</AdminBadge>
            ) : (
              <>
                <AdminBadge tone="neutral">Off</AdminBadge> — turn on <code>shipmondo</code> in{" "}
                <Link className="underline" href="/admin/features">
                  Features
                </Link>
              </>
            )}
          </li>
          <li>
            Account:{" "}
            {config ? (
              <AdminBadge tone="success">
                {config.baseUrl === SHIPMONDO_BASE_URL.sandbox ? "Connected (sandbox)" : "Connected"}
              </AdminBadge>
            ) : (
              <>
                <AdminBadge tone="warning">Not connected</AdminBadge> — set <code>SHIPMONDO_API_USER</code> and{" "}
                <code>SHIPMONDO_API_KEY</code> (Shipmondo → Settings → Integrations → API)
              </>
            )}
          </li>
          {webhook ? (
            <li>
              Tracking webhook:{" "}
              {webhook.state === "registered" ? (
                <AdminBadge tone="success">Registered</AdminBadge>
              ) : webhook.state === "inactive" && config?.webhookKey && isPublicEndpoint(endpoint) ? (
                <form action={registerWebhookAction} className="inline">
                  <AdminBadge tone="critical">Inactive in Shipmondo</AdminBadge>{" "}
                  <AdminButton type="submit" variant="secondary" size="sm">
                    Register it again
                  </AdminButton>
                </form>
              ) : webhook.state === "unreachable" ? (
                <>
                  <AdminBadge tone="critical">Shipmondo did not answer</AdminBadge> {webhook.error}
                </>
              ) : !config?.webhookKey ? (
                <>
                  <AdminBadge tone="warning">Not set up</AdminBadge> — set <code>SHIPMONDO_WEBHOOK_KEY</code> (a long
                  random string, e.g. <code>openssl rand -hex 32</code>), then register it here
                </>
              ) : !isPublicEndpoint(endpoint) ? (
                <>
                  <AdminBadge tone="warning">Not reachable</AdminBadge> — Shipmondo cannot call <code>{endpoint}</code>;
                  register it from the live site
                </>
              ) : (
                <form action={registerWebhookAction} className="inline">
                  <AdminBadge tone="attention">Not registered</AdminBadge>{" "}
                  <AdminButton type="submit" variant="secondary" size="sm">
                    Register webhook
                  </AdminButton>
                </form>
              )}
            </li>
          ) : null}
        </ul>
      </AdminCard>

      <AdminCard title={`Paid orders, last ${DAYS} days`} padding="none">
        <AdminTable>
          <AdminThead>
            <AdminTr>
              <AdminTh>Order</AdminTh>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Total</AdminTh>
              <AdminTh>Shipmondo</AdminTh>
              <AdminTh>
                <span className="sr-only">Action</span>
              </AdminTh>
            </AdminTr>
          </AdminThead>
          <AdminTbody>
            {rows.length === 0 ? (
              <AdminTableEmpty colSpan={6}>No paid orders in the last {DAYS} days.</AdminTableEmpty>
            ) : (
              rows.map((row) => {
                const state = stateOf(row, readAt);
                return (
                  <AdminTr key={row.id}>
                    <AdminTd>
                      <Link className="underline" href={`/admin/ordrer/${row.id}`}>
                        {row.orderNumber !== null ? `#${row.orderNumber}` : row.id.slice(0, 8)}
                      </Link>
                    </AdminTd>
                    <AdminTd>{row.shippingName}</AdminTd>
                    <AdminTd>{row.status}</AdminTd>
                    <AdminTd>{formatPriceDkk(row.totalDkk)}</AdminTd>
                    <AdminTd>
                      <AdminBadge tone={state.tone}>{state.label}</AdminBadge>
                    </AdminTd>
                    <AdminTd>
                      {ready && state.canSend ? (
                        <form action={sendOrderAction.bind(null, row.id)}>
                          <AdminButton type="submit" variant="secondary" size="sm">
                            Send
                          </AdminButton>
                        </form>
                      ) : null}
                    </AdminTd>
                  </AdminTr>
                );
              })
            )}
          </AdminTbody>
        </AdminTable>
      </AdminCard>
    </div>
  );
}
