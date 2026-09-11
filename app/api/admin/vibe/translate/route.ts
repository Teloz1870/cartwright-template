import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export async function POST(req: Request) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const { targetId, targetLocales } = await req.json();

    if (!targetId || !Array.isArray(targetLocales)) {
      return NextResponse.json({ error: "Missing targetId or targetLocales" }, { status: 400 });
    }

    const page = await prisma.page.findUnique({ where: { slug: targetId } });
    if (!page || !page.vibeHtml) {
      return NextResponse.json({ error: "Page not found or has no vibeHtml" }, { status: 404 });
    }

    const settings = await prisma.integrationSettings.findUnique({ where: { id: 1 } });
    const apiKey = settings?.googleGeminiApiKey || process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "No Google Gemini API key configured" }, { status: 400 });
    }

    const google = createGoogleGenerativeAI({ apiKey });
    const currentTranslations = (page.translations as Record<string, { vibeHtml?: string } & Record<string, unknown>>) || {};

    // For each requested locale, call the LLM
    for (const locale of targetLocales) {
      // Skip if it's the default (assumed Danish or English based on initial prompt)
      // or if we already have it. (Actually we might want to overwrite if forced, but let's just do it)
      const prompt = `You are an expert HTML localizer.
      
Your task is to translate the human-readable text inside the following HTML string into the language code: "${locale}".
CRITICAL RULES:
1. DO NOT change any HTML tags, structure, classes, IDs, or styling (Tailwind).
2. DO NOT translate class names, href attributes (unless they are localized paths), or source URLs.
3. ONLY translate the visible text nodes and alt attributes.
4. Output ONLY the raw translated HTML string. No markdown formatting (\`\`\`html) and no explanations.

HTML to translate:
${page.vibeHtml}
`;

      const { text } = await generateText({
        model: google("gemini-1.5-flash"),
        prompt,
      });

      // Remove markdown blocks if the LLM adds them despite instructions
      let cleanedHtml = text.trim();
      if (cleanedHtml.startsWith("```html")) cleanedHtml = cleanedHtml.replace("```html", "");
      if (cleanedHtml.startsWith("```")) cleanedHtml = cleanedHtml.replace("```", "");
      if (cleanedHtml.endsWith("```")) cleanedHtml = cleanedHtml.slice(0, -3);

      currentTranslations[locale] = {
        ...currentTranslations[locale],
        vibeHtml: cleanedHtml.trim(),
      };
    }

    await prisma.page.update({
      where: { id: page.id },
      data: { translations: currentTranslations as Prisma.InputJsonValue },
    });

    return NextResponse.json({ ok: true, localesTranslated: targetLocales });
  } catch (error: unknown) {
    console.error("Vibe Translate Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
