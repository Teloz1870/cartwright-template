import { NextRequest } from "next/server";
import { generateText } from "ai";
import { chatModelResolved, getAnthropicApiKey } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { requireAdmin } from "@/lib/admin";
import { getBrand } from "@/lib/brand";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth Check
    await requireAdmin();

    // 2. Body parsing
    const body = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    // 3. API Key Check
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return Response.json(
        { error: "AI API nøglen mangler. Gå til /admin/integrations for at tilføje den." },
        { status: 400 }
      );
    }

    const brand = await getBrand();

    // 4. System Prompt (VIBE_PROMPTS)
    const systemPrompt = `You are an expert Frontend Developer and Designer building a component for ${brand.storeName}.
You must output ONLY raw HTML with Tailwind CSS v4 classes.
Do NOT output Markdown code blocks (like \`\`\`html).
Do NOT output any React components, functions, or hooks.
Use ONLY the following semantic colors for dark mode:
- Backgrounds: bg-[#0A0A0A], bg-sol-sand, bg-sol-cream
- Text: text-white, text-gray-300, text-sol-ink, text-sol-muted
- Accents: bg-sol-accent, text-sol-accent
- Glassmorphism: bg-white/5 backdrop-blur-md border border-white/10
Ensure all tags are closed. Replace 'className=' with 'class=' and 'htmlFor=' with 'for='.
Return ONLY the pure HTML markup.`;

    // 5. Generate Text — intent="vibe" så Anthropic tvinges (lokal model
    // håndterer ikke dette prompt-præcisionsniveau pålideligt)
    const resolved = await chatModelResolved("vibe");
    const { text } = await withAuditContext(
      {
        provider: resolved.provider,
        model: resolved.model,
        modality: "text",
      },
      () =>
        generateText({
          model: resolved.handle,
          system: systemPrompt,
          prompt: prompt,
        }),
    );

    // 6. Clean up output (just in case the LLM wrapped it in markdown)
    let cleanText = text.trim();
    if (cleanText.startsWith("```html")) cleanText = cleanText.replace("```html", "");
    if (cleanText.startsWith("```")) cleanText = cleanText.replace("```", "");
    if (cleanText.endsWith("```")) cleanText = cleanText.slice(0, -3);

    return Response.json({ html: cleanText.trim() });
  } catch (error: unknown) {
    console.error("Vibe Generation Error:", error);
    return Response.json({ error: "Kunne ikke generere designet." }, { status: 500 });
  }
}
