"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import type { AuditActor } from "@/lib/audit";
import { getFeatures } from "@/lib/brand";
import { requireShipmondoConfig } from "../lib/config";
import { sendOrderToShipmondo, sendUnsentOrders } from "../lib/send-order";
import { registerWebhook } from "../lib/webhook-setup";

/**
 * /admin/shipmondo actions. A failed send writes its reason on the order's
 * timeline itself (one line per order, lib/send-order.ts recordFailure).
 */
async function adminActor(): Promise<AuditActor> {
  const session = await requireAdmin();
  return `user:${session.user.id}` as AuditActor;
}

async function assertEnabled(): Promise<void> {
  if (!(await getFeatures()).shipmondo) throw new Error("Shipmondo is turned off in /admin/features.");
}

export async function sendOrderAction(orderId: string): Promise<void> {
  const actor = await adminActor();
  await assertEnabled();
  await sendOrderToShipmondo(orderId, actor);
  revalidatePath("/admin/shipmondo");
  revalidatePath(`/admin/ordrer/${orderId}`);
}

export async function sendAllAction(): Promise<void> {
  const actor = await adminActor();
  await assertEnabled();
  // The page offers failed orders too: an explicit retry does not wait out the sweep's pause.
  await sendUnsentOrders(actor, { retryRecentFailures: true });
  revalidatePath("/admin/shipmondo");
}

/** Registers the "Shipments: create" webhook in the shop's Shipmondo account (idempotent). */
export async function registerWebhookAction(): Promise<void> {
  await adminActor();
  await assertEnabled();
  await registerWebhook(requireShipmondoConfig());
  revalidatePath("/admin/shipmondo");
}
