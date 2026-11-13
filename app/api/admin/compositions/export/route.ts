import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { exportComposition } from "@/lib/compositions/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/compositions/export
 *
 * Download the CURRENT shop state as a cartwright-composition-v1 JSON file
 * (the read-only inverse of /api/admin/compositions/import). Pure DB read —
 * no LLM, no writes — served as an attachment so the admin "Export look"
 * button is a plain link.
 *
 * Optional: ?homepageSlug=<slug> — which Page's layoutJson to include
 * (default "home").
 */
export async function GET(req: Request) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const homepageSlug =
    new URL(req.url).searchParams.get("homepageSlug") ?? undefined;

  try {
    const composition = await exportComposition({ homepageSlug });
    const filename = `${composition.skin}-composition.json`;
    return new NextResponse(JSON.stringify(composition, null, 2) + "\n", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
