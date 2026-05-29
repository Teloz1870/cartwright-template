import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { parseDesignMd } from "@/lib/designs/parser";
import { scaffoldDesign } from "@/lib/designs/codegen";
import { fromStitchMd } from "@/lib/designs/adapters/stitch";
import { fromClaudeDesign } from "@/lib/designs/adapters/claude-design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/designs/import
 *
 * Accepts multipart FormData:
 *   - file: design.md eller raw .tsx (Claude Design)
 *   - adapter: "auto" | "cartwright" | "stitch" | "claude-design"
 *
 * Pipeline:
 *   1. Read file → string
 *   2. Auto-detect adapter hvis "auto"
 *   3. Adapter normaliserer til cartwright-design-v1 hvis ikke allerede
 *   4. Parse + validate via parseDesignMd
 *   5. Scaffold designs/<slug>/ filer via scaffoldDesign
 *
 * Returnerer: { ok: true, slug, files } eller { ok: false, error }
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();

    const form = await req.formData();
    const file = form.get("file");
    const adapterChoice = (form.get("adapter") as string) ?? "auto";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Mangler "file" i FormData.' },
        { status: 400 },
      );
    }

    const raw = await file.text();
    const filename = file.name.toLowerCase();

    // Auto-detect adapter baseret på fil-indhold + extension.
    const adapter =
      adapterChoice === "auto" ? detectAdapter(raw, filename) : adapterChoice;

    // Normalisér til cartwright-design-v1 hvis nødvendigt
    let normalized: string;
    switch (adapter) {
      case "cartwright":
        normalized = raw;
        break;
      case "stitch":
        normalized = fromStitchMd(raw);
        break;
      case "claude-design":
        normalized = fromClaudeDesign({ source: raw });
        break;
      default:
        return NextResponse.json(
          { ok: false, error: `Ukendt adapter: ${adapter}` },
          { status: 400 },
        );
    }

    // Parse + validate
    const { spec, body } = parseDesignMd(normalized);

    // Scaffold filer på disk (--force så re-import af eksisterende design
    // ikke fejler — admin har bevidst valgt at uploade igen).
    const result = await scaffoldDesign(spec, body, { force: true });

    return NextResponse.json({
      ok: true,
      slug: result.slug,
      files: result.createdFiles.map((p) => p.replace(process.cwd() + "/", "")),
      registryUpdated: result.registryUpdated,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

function detectAdapter(
  raw: string,
  filename: string,
): "cartwright" | "stitch" | "claude-design" {
  // Direct cartwright-design-v1
  if (raw.includes("schema: cartwright-design-v1")) return "cartwright";
  // Stitch typically has `stitch_version: <n>` in frontmatter
  if (raw.includes("stitch_version:") || raw.includes("brand:\n  name:")) {
    return "stitch";
  }
  // Default for .tsx/.jsx files → claude-design adapter
  if (/\.(tsx|jsx)$/.test(filename)) return "claude-design";
  // Default for .md without explicit schema → assume cartwright (vil fejle
  // i parser hvis ikke valid — admin får tydelig error)
  return "cartwright";
}
