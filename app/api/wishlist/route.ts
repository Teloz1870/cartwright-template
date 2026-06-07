import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getWishlistProductIds } from "@/lib/wishlist";

/** Brugerens ønskeliste-produkt-id'er. Tom for gæster (200). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ productIds: [] });
  return NextResponse.json({ productIds: await getWishlistProductIds(userId) });
}
