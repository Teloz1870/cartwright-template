import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      // For now, if the user isn't logged in, redirect them to login first.
      // A full implementation might create a customer on the fly.
      return NextResponse.redirect(new URL("/konto/login?callbackUrl=/priser", req.url));
    }

    const formData = await req.formData().catch(() => null);
    // Vi tager imod formData, fordi vi har en <form action="..."> på /priser
    // I et rigtigt setup kan priceId komme fra form.
    const priceId = process.env.STRIPE_STARTER_PRICE_ID || "price_dummy";

    const stripe = await getStripeClient();
    if (!stripe) {
      return NextResponse.redirect(new URL("/priser?error=StripeNotConfigured", req.url));
    }

    // Tjek om brugeren allerede har et abonnement
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: session.user.id, status: "active" }
    });

    if (existingSub) {
      return NextResponse.redirect(new URL("/konto?message=AlreadySubscribed", req.url));
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: session.user.email!,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/konto?success=subscription_created`,
      cancel_url: `${baseUrl}/priser?cancel=true`,
      metadata: {
        userId: session.user.id,
        type: "subscription",
      }
    });

    if (checkoutSession.url) {
      return NextResponse.redirect(checkoutSession.url, { status: 303 });
    }

    return NextResponse.json({ error: "No URL returned" }, { status: 500 });
  } catch (err) {
    console.error("Subscription checkout error:", err);
    return NextResponse.redirect(new URL("/priser?error=CheckoutFailed", req.url));
  }
}
