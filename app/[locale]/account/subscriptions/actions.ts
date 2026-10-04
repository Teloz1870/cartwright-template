"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
} from "@/lib/subscriptions";

async function requireCustomer() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Du er ikke logget ind.");
  return session.user.id;
}

function idFrom(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

export async function cancelCustomerSubscriptionAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireCustomer();
  const id = idFrom(formData);
  if (!id) throw new Error("Subscription id mangler.");
  await cancelSubscription({
    id,
    userId,
    actor: `user:${userId}`,
  });
  revalidatePath("/account/subscriptions");
}

export async function pauseCustomerSubscriptionAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireCustomer();
  const id = idFrom(formData);
  if (!id) throw new Error("Subscription id mangler.");
  await pauseSubscription({
    id,
    userId,
    actor: `user:${userId}`,
  });
  revalidatePath("/account/subscriptions");
}

export async function resumeCustomerSubscriptionAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireCustomer();
  const id = idFrom(formData);
  if (!id) throw new Error("Subscription id mangler.");
  await resumeSubscription({
    id,
    userId,
    actor: `user:${userId}`,
  });
  revalidatePath("/account/subscriptions");
}
