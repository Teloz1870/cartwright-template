import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { parseComposition } from "@/lib/compositions/spec";
import { applyComposition } from "@/lib/compositions/apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/compositions/import
 *
 * Install a cartwright-composition-v1 artifact on this shop. Mirrors the
 * designs/import contract (multipart + dry-run preview), but where a design
 * import scaffolds CODE (and so only works on a writable filesystem), a
 * composition is pure governed DATA — DB writes only — so it works on any
 * deployed shop too.
 *
 * Accepts multipart FormData:
 *   - file: composition.json (cartwright-composition-v1)
 *   - dryRun: "true" → parse + validate + return a preview WITHOUT writing
 *     (drives the "confirm before install" UX in CompositionPorter).
 *
 * Returns: { ok: true, dryRun: true, preview } | { ok: true, applied } |
 * { ok: false, error }.
 */
export async function POST(req: Request) {
  const session = await requireAdmin();

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Missing "file" in FormData.' },
        { status: 400 },
      );
    }

    const raw = await file.text();
    const parsed = parseComposition(raw);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    const comp = parsed.composition;

    // Dry-run → validated preview, no side-effects (mirror of designs/import).
    if (String(form.get("dryRun")) === "true") {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        preview: {
          name: comp.name,
          description: comp.description ?? "",
          skin: comp.skin,
          palette: comp.palette ?? null,
          identity: comp.voice?.identity ?? null,
          voiceFields: Object.keys(comp.voice?.genomeOverrides ?? {}).length,
          chrome: comp.chrome ?? null,
          scene: comp.scene ?? null,
          homepageSections: comp.homepageLayout?.sections.length ?? 0,
        },
      });
    }

    // Real install — ONE atomic, audited apply (validates again server-side,
    // incl. the strict identity enums, before any write).
    const result = await applyComposition(comp, {}, `user:${session.user.id}`);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, applied: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
