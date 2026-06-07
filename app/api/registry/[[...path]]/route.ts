import { NextRequest } from "next/server";
import { brand } from "@/brand.config";
import {
  buildRegistryIndex,
  buildRegistryItem,
  isExportableKey,
} from "@/lib/magic/registry-export";

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
  const features = brand.features as { componentRegistryPublic?: boolean; componentRegistryShipsSource?: boolean };
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
    if (!isExportableKey(key)) {
      return new Response("Unknown section", { status: 404, headers: CORS });
    }
    const withSource = features.componentRegistryShipsSource === true;
    return Response.json(buildRegistryItem(key, withSource), { headers: CORS });
  }

  return new Response("Not found", { status: 404, headers: CORS });
}
