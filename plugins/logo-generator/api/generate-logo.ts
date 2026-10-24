/**
 * logo-generator plugin (cartwright-plugin-v1) — SVG outline-logo handler.
 * Mounted at app/api/admin/generate-logo/route.ts (POST). Moved verbatim from
 * that route file; the requireAdminApi() guard below is load-bearing
 * (parity audit #1, hardened in #236/#241) and must stay exactly as-is.
 */
import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/client";
import { requireAdminApi } from "@/lib/admin";

// Ensure this route only runs on the server
export const dynamic = "force-dynamic";

const LogoSchema = z.object({
  markPaths: z.array(z.string()).describe("Array of SVG path 'd' attribute strings. Must be clean, minimalist outlines."),
  markViewBox: z.string().describe("The viewBox for the SVG paths, e.g., '0 0 24 24' or '0 0 100 100'."),
  markStrokeWidth: z.number().describe("The suggested strokeWidth for the paths, typically between 1.5 and 3."),
});

export async function POST(req: Request) {
  // Admin-only: this invokes an LLM. Without this guard the route was an open,
  // unauthenticated LLM proxy on every deployed shop (parity audit #1).
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    const model = await chatModel();

    const { object } = await generateObject({
      model,
      schema: LogoSchema,
      prompt: `You are an expert graphic designer specializing in minimalist, stroke-based SVG icons and logos.
      
A user has requested a logo concept: "${prompt}"

Generate a clean, professional outline logo. The logo MUST be stroke-based (not filled shapes), similar to modern line-art icons (like Lucide or Feather icons but slightly more distinct).
It should be scalable and use standard SVG path syntax.
Do NOT include the <svg> wrapper, just provide the raw "d" attributes for the <path> elements, the viewBox, and an appropriate stroke-width.

Important constraints:
- Paths must be relatively simple but recognizable.
- Use a square viewBox (e.g., '0 0 100 100' or '0 0 24 24').
- It must look good as a small icon in a header.`,
    });

    return NextResponse.json(object);
  } catch (error: unknown) {
    console.error("AI Logo Generation Error:", error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : "") || "Failed to generate logo" }, { status: 500 });
  }
}
