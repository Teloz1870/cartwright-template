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
 * Opret en ny API-key for den loggede admin-bruger. Returnerer plaintext ÉN
 * gang — den skal vises straks til brugeren og kan IKKE genfindes senere.
 */
export async function createApiKeyAction(formData: FormData): Promise<CreateResult> {
  const session = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Navn skal være mindst 2 tegn" };
  }

  const rawScopes = formData.getAll("scopes").map(String);
  if (rawScopes.length === 0) {
    return { ok: false, error: "Vælg mindst én scope" };
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

/** List for siden — alle scopes returneres uden plaintext. */
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

