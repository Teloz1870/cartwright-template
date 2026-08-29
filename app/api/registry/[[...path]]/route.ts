import { NextRequest } from "next/server";
import { getFeatures } from "@/lib/brand";
import { brand } from "@/brand.config";
import {
  buildRegistryIndex,
  buildRegistryItem,
  buildSvgItemRegistryItem,
  isExportableKey,
  isExportableSvgItemKey,
} from "@/lib/magic/registry-export";
import { scheduleRegistryHit } from "@/lib/registry-stats";

export const runtime = "nodejs";

/**
 * Public, read-only shadcn-compatible component registry.
 *
 *   GET /api/registry            → registry.json (index of catalog sections)
 *   GET /api/registry/r/<key>.json → registry-item.json (prop JSON-Schema contract)
 *
 * Gated by brand.features.componentRegistryPublic — 404 (not empty 200) when off,
 * so canaries with the flag off expose nothing. No auth (discovery surface, like
 * /api/v1/tools); CORS-open so browser-based agents can read it too. Shipping
 * real TSX source is the separate componentRegistryShipsSource opt-in.
 */

const CORS = { "Access-Control-Allow-Origin": "*" } as const;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  // Resolved: componentRegistryPublic is runtime-tier. Reading the compile
  // -time value meant a shop that enabled the registry still got 404 here, so
  // scheduleRegistryHit never fired and /admin/registry-stats reported "No
  // registry installs recorded yet" indefinitely — with both flags showing On.
  const features = await getFeatures();
  if (!features.componentRegistryPublic) {
    return new Response("Not found", { status: 404 });
  }

  const origin = _req.nextUrl.origin;
  const path = (await params).path ?? [];

  // Index: /api/registry  or  /api/registry/registry.json
  if (path.length === 0 || (path.length === 1 && path[0] === "registry.json")) {
    return Response.json(buildRegistryIndex(origin), { headers: CORS });
  }

  // Item: /api/registry/r/<key>.json
  if (path.length === 2 && path[0] === "r") {
    const key = path[1].replace(/\.json$/, "");
    // Boolean(), not `=== true`: the resolved features type keeps the literal
    // `false` from brand.config, where the old `as {…?: boolean}` cast widened
    // it. The runtime value can still be true via an override.
    const withSource = Boolean(features.componentRegistryShipsSource);
    if (isExportableKey(key)) {
      // Anonymous install-counting (registryStats): fire-and-forget AFTER the
      // response, item-slug only, no-op when the flag is off. Never blocks or
      // fails the registry response.
      scheduleRegistryHit(key);
      return Response.json(buildRegistryItem(key, withSource), { headers: CORS });
    }
    // SVG item library — plain installable components under the `svg-` namespace.
    if (isExportableSvgItemKey(key)) {
      scheduleRegistryHit(key);
      return Response.json(buildSvgItemRegistryItem(key, withSource), { headers: CORS });
    }
    return new Response("Unknown section", { status: 404, headers: CORS });
  }

  return new Response("Not found", { status: 404, headers: CORS });
}
