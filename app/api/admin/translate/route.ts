import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/client";

// Ensure this route only runs on the server
export const dynamic = "force-dynamic";

// We use z.record so the endpoint is flexible and can translate any object 
// (e.g. { name: "...", description: "..." } for products, or { title: "..." } for pages)
export async function POST(req: Request) {
  try {
    const { payload, targetLocale, sourceLocale = "da" } = await req.json();

    if (!payload || !targetLocale) {
      return NextResponse.json({ error: "Missing payload or targetLocale" }, { status: 400 });
    }

    // Build the schema dynamically based on the payload keys.
    // Zod's z.record has no defined properties, so generateObject returns an empty object {}
    // on many models. A dynamic z.object ensures properties are explicitly defined for parsing.
    const schemaFields: Record<string, any> = {};
    for (const key of Object.keys(payload)) {
      schemaFields[key] = z.string().nullable();
    }
    const TranslationSchema = z.object(schemaFields);

    const model = await chatModel();

    const { object } = await generateObject({
      model,
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

    return NextResponse.json(object);
  } catch (error: any) {
    console.error("AI Translation Error:", error);
    return NextResponse.json({ error: error.message || "Failed to translate" }, { status: 500 });
  }
}
