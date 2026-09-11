"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import {
  listRedirects,
  createRedirect,
  deleteRedirect,
  type RedirectResult,
} from "@/lib/redirects/store";

export async function getRedirectsForUi() {
  await requireAdmin();
  return listRedirects();
}

export async function addRedirect(
  fromPath: string,
  toPath: string,
  statusCode: number,
): Promise<RedirectResult> {
  const session = await requireAdmin();
  const r = await createRedirect(fromPath, toPath, statusCode, `user:${session.user.id}`);
  if (r.ok) revalidatePath("/admin/redirects");
  return r;
}

export async function removeRedirect(id: string): Promise<RedirectResult> {
  const session = await requireAdmin();
  const r = await deleteRedirect(id, `user:${session.user.id}`);
  if (r.ok) revalidatePath("/admin/redirects");
  return r;
}
