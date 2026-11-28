import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { toggleWishlist } from "@/plugins/wishlist/lib/wishlist";

/** Toggle et produkt på ønskelisten. Kræver login (401 → klient sender til login). */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Login kræves.", loginRequired: true }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }
  const productId = (body as { productId?: unknown }).productId;
  if (typeof productId !== "string" || !productId) {
    return NextResponse.json({ error: "productId mangler." }, { status: 400 });
  }
  try {
    return NextResponse.json(await toggleWishlist(userId, productId));
  } catch {
    return NextResponse.json({ error: "Ukendt produkt." }, { status: 400 });
  }
}
