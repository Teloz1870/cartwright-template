import { NextRequest } from "next/server";
import { generateText } from "ai";
import { chatModelResolved, getAnthropicApiKey } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { requireAdmin } from "@/lib/admin";
import { getBrand } from "@/lib/brand";
import {
  generateV0Section,
  V0ApiError,
  V0QuotaExceeded,
  V0RateLimit,
} from "@/lib/v0/client";
import { extractHtmlFromV0Files } from "@/lib/v0/transform/extract";
import { sanitizeVibeHtml } from "@/lib/v0/transform/sanitize";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth Check
    await requireAdmin();

    // 2. Body parsing — `engine` selects the generation backend (default
    //    anthropic so existing callers are 100% unchanged).
    const body = await request.json();
    const { prompt } = body;
    const engine: "anthropic" | "v0" = body.engine === "v0" ? "v0" : "anthropic";

    if (!prompt) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    const brand = await getBrand();

    // 3. System Prompt (VIBE_PROMPTS) — shared by both engines. For v0 it's the
    //    `system` instruction; constraining v0 to plain HTML is what keeps the
    //    code→data transform tractable (no RSC/hooks to strip).
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

    // 4a. v0 engine — gated behind the default-off flag; output normalized +
    //     sanitized to HTML, then persisted as vibeHtml by the caller (doctrine).
    if (engine === "v0") {
      if (!brand.features.v0Generator) {
        return Response.json(
          {
            error:
              "v0-generering er ikke aktiveret. Slå 'v0 UI-generering' til i /admin/features.",
          },
          { status: 403 },
        );
      }

      try {
        const result = await withAuditContext(
          { provider: "vercel-v0", model: "v0", modality: "text" },
          () => generateV0Section({ message: prompt, system: systemPrompt }),
        );

        const html = sanitizeVibeHtml(extractHtmlFromV0Files(result.files));
        if (!html) {
          return Response.json(
            {
              error:
                "v0 returnerede ingen brugbar HTML. Prøv en mere specifik prompt.",
            },
            { status: 502 },
          );
        }

        return Response.json({
          html,
          webUrl: result.webUrl,
          demoUrl: result.demoUrl,
        });
      } catch (err) {
        if (err instanceof V0QuotaExceeded) {
          return Response.json({ error: err.message }, { status: 429 });
        }
        if (err instanceof V0RateLimit) {
          return Response.json(
            { error: "v0 rate limit nået — prøv igen om lidt." },
            { status: 429 },
          );
        }
        if (err instanceof V0ApiError) {
          return Response.json(
            { error: err.message },
            { status: err.status ?? 502 },
          );
        }
        throw err;
      }
    }

    // 4b. Anthropic engine (default, unchanged) — kræver Anthropic-key.
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return Response.json(
        { error: "AI API nøglen mangler. Gå til /admin/integrations for at tilføje den." },
        { status: 400 }
      );
    }

    // intent="vibe" så Anthropic tvinges (lokal model håndterer ikke dette
    // prompt-præcisionsniveau pålideligt)
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

    // Clean up output (just in case the LLM wrapped it in markdown)
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
