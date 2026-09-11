"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { cancelSubscription } from "@/lib/subscriptions";

export async function cancelSubscriptionAction(
  formData: FormData,
): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Subscription id is missing.");

  await cancelSubscription({
    id,
    actor: `user:${session.user.id}`,
  });
  revalidatePath("/admin/subscriptions");
  revalidatePath("/account/subscriptions");
}
