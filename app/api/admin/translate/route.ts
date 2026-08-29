import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { requireAdminApi } from "@/lib/admin";

// Ensure this route only runs on the server
export const dynamic = "force-dynamic";

// We use z.record so the endpoint is flexible and can translate any object
// (e.g. { name: "...", description: "..." } for products, or { title: "..." } for pages)
export async function POST(req: Request) {
  // Admin-only: this invokes an LLM. Without this guard the route was an open,
  // unauthenticated translation/LLM proxy on every deployed shop (parity audit #1).
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const { payload, targetLocale, sourceLocale = "da" } = await req.json();

    if (!payload || !targetLocale) {
      return NextResponse.json({ error: "Missing payload or targetLocale" }, { status: 400 });
    }

    // Build the schema dynamically based on the payload keys.
    // Zod's z.record has no defined properties, so generateObject returns an empty object {}
    // on many models. A dynamic z.object ensures properties are explicitly defined for parsing.
    const schemaFields: Record<string, z.ZodType<string | null>> = {};
    for (const key of Object.keys(payload)) {
      schemaFields[key] = z.string().nullable();
    }
    const TranslationSchema = z.object(schemaFields);

    const resolved = await chatModelResolved("generation");

    const object = await withAuditContext(
      {
        provider: resolved.provider,
        model: resolved.model,
        modality: "text",
      },
      async () => {
        const { object } = await generateObject({
          model: resolved.handle,
          schema: TranslationSchema,
          prompt: `You are an expert, professional native-level translator.
Translate the following JSON object's values from '${sourceLocale}' to '${targetLocale}'.
Preserve all formatting, markdown syntax, HTML tags, and professional tone.
Only translate the values. The keys must remain exactly identical to the input keys.
If a value is null or empty, keep it null or empty.

Input JSON:
${JSON.stringify(payload, null, 2)}
`,
        });
        return object;
      },
    );

    return NextResponse.json(object);
  } catch (error: unknown) {
    console.error("AI Translation Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to translate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
