import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { exportDesignMd } from "@/lib/designs/export";

/**
 * GET /api/admin/designs/<slug>/export — download a design as a
 * cartwright-design-v1 `design.md`. Admin-only. Powers the "Download design.md"
 * button in /admin/designs and the share flow.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;
  const { slug } = await params;
  const md = await exportDesignMd(slug);
  if (!md) {
    return NextResponse.json({ error: `Design "${slug}" not found` }, { status: 404 });
  }
  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.design.md"`,
      "Cache-Control": "no-store",
    },
  });
}
