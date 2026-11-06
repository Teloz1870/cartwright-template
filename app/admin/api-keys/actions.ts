"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/api-auth";
import { isValidScope, type Scope } from "@/lib/scopes";

type CreateResult =
  | { ok: true; plaintext: string; id: string; name: string }
  | { ok: false; error: string };

/**
 * Create a new API key for the signed-in admin user. Returns the plaintext ONCE
 * — it must be shown to the user immediately and can NOT be retrieved later.
 */
export async function createApiKeyAction(formData: FormData): Promise<CreateResult> {
  const session = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Name must be at least 2 characters" };
  }

  const rawScopes = formData.getAll("scopes").map(String);
  if (rawScopes.length === 0) {
    return { ok: false, error: "Choose at least one scope" };
  }
  const scopes: Scope[] = [];
  for (const s of rawScopes) {
    if (!isValidScope(s)) {
      return { ok: false, error: `Ukendt scope: ${s}` };
    }
    scopes.push(s);
  }

  const { plaintext, hash } = generateApiKey();
  const created = await prisma.apiKey.create({
    data: {
      userId: session.user.id,
      name,
      keyHash: hash,
      scopes: JSON.stringify(scopes),
    },
  });

  revalidatePath("/admin/api-keys");
  return { ok: true, plaintext, id: created.id, name: created.name };
}

export async function revokeApiKeyAction(id: string): Promise<void> {
  await requireAdmin();
  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/admin/api-keys");
}

/** Listing for the page — all scopes are returned without plaintext. */
export async function listApiKeys() {
  await requireAdmin();
  return prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

