import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { generateDesignSpec } from "@/lib/designs/generate";
import { scaffoldDesign } from "@/lib/designs/codegen";
import { getDesign } from "@/designs";

/**
 * POST /api/admin/designs/generate — prompt → design. Admin-only; requires an
 * Anthropic key (structured output) so it's inert without one. Generates a
 * validated cartwright-design-v1 spec from a text description and scaffolds a
 * real DesignPack via the existing codegen (writes files in dev; read-only prod
 * FS is handled by codegen). The AI counterpart of the drag-drop import.
 */
export async function POST(req: Request) {
  await requireAdmin();

  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = String(body?.prompt ?? "").trim();
  } catch {
    /* invalid JSON → empty prompt → 400 below */
  }
  if (prompt.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Describe the design in a sentence or two." },
      { status: 400 },
    );
  }

  try {
    const spec = await generateDesignSpec(prompt);
    // Don't clobber an existing pack — suffix on collision.
    if (getDesign(spec.slug)) {
      spec.slug = `${spec.slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const body = `# ${spec.name}\n\n${spec.description}\n\nGenerated from a prompt via /admin/designs.\n`;
    const result = await scaffoldDesign(spec, body, { force: true });
    return NextResponse.json({ ...result, ok: true, slug: spec.slug, name: spec.name });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
