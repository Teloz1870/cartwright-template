import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  createSubscriptionCheckoutSession,
  resolveSubscriptionPriceId,
  subscriptionsFeatureEnabled,
} from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

function wantsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  return accept.includes("application/json") || contentType.includes("application/json");
}

async function readPriceId(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return resolveSubscriptionPriceId((body as { priceId?: unknown }).priceId);
  }

  const formData = await request.formData().catch(() => null);
  return resolveSubscriptionPriceId(formData?.get("priceId"));
}

export async function POST(request: Request) {
  const json = wantsJson(request);

  if (!subscriptionsFeatureEnabled()) {
    return NextResponse.json(
      { error: "Subscriptions are not enabled." },
      { status: 404 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    if (json) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    return NextResponse.redirect(
      new URL("/account/login?callbackUrl=/account/subscriptions", request.url),
      { status: 303 },
    );
  }

  if (!session.user.email) {
    return NextResponse.json(
      { error: "Your account needs an email address before subscribing." },
      { status: 400 },
    );
  }

  try {
    const priceId = await readPriceId(request);
    const checkoutSession = await createSubscriptionCheckoutSession({
      userId: session.user.id,
      email: session.user.email,
      priceId,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 500 },
      );
    }

    if (json) {
      return NextResponse.json({ url: checkoutSession.url });
    }
    return NextResponse.redirect(checkoutSession.url, { status: 303 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed.";
    if (json) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const url = new URL("/account/subscriptions", request.url);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, { status: 303 });
  }
}
