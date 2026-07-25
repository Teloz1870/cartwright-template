import { getBrand } from "@/lib/brand";
import { exportComposition } from "@/lib/compositions/export";
import { toPublicLook } from "@/lib/compositions/public-look";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, read-only look-sharing endpoint — the remix-loop surface.
 *
 *   GET /api/look → this shop's look as a cartwright-composition-v1 artifact,
 *   installable elsewhere via `composition.apply` / the compositions importer.
 *
 * Gated by brand.features.lookSharing (runtime flag, default false) — 404
 * (not empty 200) when off, mirroring /api/registry. Read through getBrand()
 * so a toggle in /admin/features takes effect without redeploy.
 *
 * SHARING BOUNDARY: cosmetic fields only. The full admin export
 * (/api/admin/compositions/export) carries voice.genomeOverrides (the shop's
 * written copy), voice.identity and homepageLayout (the Visual Builder tree);
 * none of those belong on an unauthenticated surface. This endpoint reuses
 * exportComposition() and then keeps ONLY { skin, palette, scene, chrome } —
 * a remixer gets the look, never the words.
 */

const CORS = { "Access-Control-Allow-Origin": "*" } as const;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}

export async function GET() {
  const brand = await getBrand();
  const features = brand.features as { lookSharing?: boolean };
  if (!features.lookSharing) {
    return new Response("Not found", { status: 404 });
  }

  let look;
  try {
    look = toPublicLook(await exportComposition());
  } catch {
    // Round-trip guard tripped (registry drift) — never serve a file the
    // importer would reject.
    return new Response("Look export unavailable", { status: 503 });
  }

  return Response.json(look, {
    headers: {
      ...CORS,
      "Content-Disposition": 'inline; filename="look.cartwright.json"',
    },
  });
}
