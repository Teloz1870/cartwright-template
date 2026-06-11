import { auth } from "@/lib/auth";
import { getFeatures } from "@/lib/brand";
import { listRegistryHits } from "@/lib/registry-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/registry-stats — sorteret readout af de anonyme registry-
 * install-tællere (RegistryHit). Admin-only (401 uden admin-session — samme
 * mønster som /api/admin/ai/health). Flag-off ⇒ { enabled: false, items: [] }
 * uden at røre RegistryHit-tabellen (som måske ikke findes før `pnpm db:push`).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const features = await getFeatures();
  if (!features.registryStats) {
    return Response.json({ enabled: false, items: [] });
  }

  const items = await listRegistryHits();
  return Response.json({
    enabled: true,
    items: items.map((row) => ({
      item: row.item,
      count: row.count,
      updatedAt: row.updatedAt,
    })),
  });
}
