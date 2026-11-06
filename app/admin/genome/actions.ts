"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { applyFieldOverride } from "@/lib/genome/apply";
import { resolveField, type ResolveResult } from "@/lib/genome/resolve";
import { inspectGenome, type GenomeSnapshot } from "@/lib/genome/inspect";
import {
  applyIdentityAnchor,
  reharmonizeAll,
  type ReharmonizeEntry,
  type SetIdentityResult,
} from "@/lib/genome/identity";
import { describeBusiness, type DescribeResult } from "@/lib/genome/describe";
import type { GenomeFieldKey } from "@/lib/genome/fields";
import type { GenomeAnchorKey } from "@/lib/genome/types";

/**
 * Admin server actions for /admin/genome. Shares the apply/resolve core with
 * AI-tool'et (lib/tools/genome.ts) — ét kodespor. revalidatePath("/","layout")
 * lets the footer (and future fields) re-resolve on the next render.
 */

export async function getGenomeForUi(): Promise<GenomeSnapshot> {
  await requireAdmin();
  return inspectGenome();
}

export type SetGenomeResult =
  | { ok: true; key: GenomeFieldKey; value: string | null }
  | { ok: false; error: string };

export async function setGenomeOverride(
  key: GenomeFieldKey,
  value: string | null,
): Promise<SetGenomeResult> {
  const session = await requireAdmin();
  const result = await applyFieldOverride(key, value, `user:${session.user.id}`);
  if (!result.ok) return result;
  revalidatePath("/admin/genome");
  revalidatePath("/", "layout");
  return result;
}

export async function triggerGenomeResolve(
  key: GenomeFieldKey,
): Promise<ResolveResult> {
  const session = await requireAdmin();
  const result = await resolveField(key, `user:${session.user.id}`);
  if (result.ok) {
    revalidatePath("/admin/genome");
    revalidatePath("/", "layout");
  }
  return result;
}

export async function setIdentityAnchor(
  key: GenomeAnchorKey,
  value: string,
): Promise<SetIdentityResult> {
  const session = await requireAdmin();
  const result = await applyIdentityAnchor(key, value, `user:${session.user.id}`);
  if (result.ok) {
    revalidatePath("/admin/genome");
    revalidatePath("/", "layout");
  }
  return result;
}

export async function reharmonizeGenome(): Promise<ReharmonizeEntry[]> {
  const session = await requireAdmin();
  const results = await reharmonizeAll(`user:${session.user.id}`);
  revalidatePath("/admin/genome");
  revalidatePath("/", "layout");
  return results;
}

export async function describeBusinessAction(
  sentence: string,
): Promise<DescribeResult> {
  const session = await requireAdmin();
  const result = await describeBusiness(sentence, `user:${session.user.id}`);
  if (result.ok) {
    revalidatePath("/admin/genome");
    revalidatePath("/", "layout");
  }
  return result;
}
