import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId, quantity = 1 } = body;

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.deletedAt !== null) {
      return NextResponse.json({ error: "Product not found or not available" }, { status: 404 });
    }

    if (product.stock < quantity) {
      return NextResponse.json({ error: "Insufficient inventory" }, { status: 400 });
    }

    const stripe = await getStripeClient();
    if (!stripe) {
      return NextResponse.json({ 
        error: "Store does not have a connected payment processor yet." 
      }, { status: 503 });
    }

    const brand = await getBrand();
    const currency = brand.policies?.currency || "DKK";

    // Opret en Stripe Checkout Session til AI-agenten.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: product.name,
              description: product.description || undefined,
              images: (() => { try { const imgs = JSON.parse(product.images); return imgs[0] ? [imgs[0]] : []; } catch(e) { return []; } })(),
            },
            unit_amount: product.priceDkk, // already in øre / smallest unit
          },
          quantity: quantity,
        },
      ],
      mode: "payment",
      success_url: `${brand.url}/ordre/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${brand.url}/produkt/${product.slug}`,
      metadata: {
        productId: product.id,
        source: "agentic_commerce",
      },
      // Allow Apple Pay / Google Pay automatically if configured in Stripe dashboard
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      expiresAt: session.expires_at,
    });
  } catch (error) {
    console.error("Agent checkout error:", error);
    return NextResponse.json({ error: "Failed to generate checkout link" }, { status: 500 });
  }
}
