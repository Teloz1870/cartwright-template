"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { ADMIN_CHAT_SCOPES } from "@/lib/scopes";
import { invokeTool } from "@/lib/tools/registry";

export type DocsImportActionResult =
  | {
      ok: true;
      target: "post" | "page";
      id: string;
      slug: string;
      title: string;
      adminUrl: string;
      publicUrl: string;
    }
  | { ok: false; error: string };

type DocsImportPayload = Omit<Extract<DocsImportActionResult, { ok: true }>, "ok">;

function isImportResult(value: unknown): value is DocsImportPayload {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    (result.target === "post" || result.target === "page") &&
    typeof result.id === "string" &&
    typeof result.slug === "string" &&
    typeof result.title === "string" &&
    typeof result.adminUrl === "string" &&
    typeof result.publicUrl === "string"
  );
}

export async function importGoogleDocAction(args: {
  documentId: string;
  target: "post" | "page";
}): Promise<DocsImportActionResult> {
  const session = await requireAdmin();

  const result = await invokeTool(
    "docs.import",
    args,
    {
      actor: `user:${session.user.id}`,
      requestId: randomUUID(),
    },
    ADMIN_CHAT_SCOPES,
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  if (!isImportResult(result.result)) {
    return { ok: false, error: "Importværktøjet returnerede et uventet svar." };
  }

  if (result.result.target === "post") {
    revalidatePath("/admin/blog");
    revalidatePath("/blog", "layout");
  } else {
    revalidatePath("/admin/sider");
    revalidatePath(result.result.publicUrl);
    revalidatePath("/");
  }
  revalidatePath("/admin/docs-import");

  return { ok: true, ...result.result };
}
