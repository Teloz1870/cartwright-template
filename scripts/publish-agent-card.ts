/**
 * Publish (or rotate) this shop's signed A2A Agent Card.
 *
 * The card libraries (lib/a2a/agent-card.ts) have existed since the A2A
 * phase, but nothing ever CALLED them — every shop answered the honest
 * `503 no_agent_card_configured`. This script is the missing publishing
 * flow: build the payload from brand.config + live products, sign with a
 * fresh ed25519 key pair, and insert the row `/api/agent-card` (and
 * `/.well-known/agent-card.json`) serves.
 *
 * Key model — deliberately ephemeral: each publish generates a NEW key
 * pair, embeds the public key in the stored row, and DISCARDS the private
 * key. Buyer agents verify offline against the embedded key, and rotation
 * is simply publishing again (the previous card is revoked in the same
 * transaction). No long-lived signing secret to store, leak or rotate.
 *
 * Run (locally, against the target shop's DATABASE_URL/TURSO_* env):
 *
 *   pnpm exec tsx --conditions react-server scripts/publish-agent-card.ts
 *
 * Optional env:
 *   AGENT_CARD_EXPIRES_DAYS  — expiry horizon (default 90 days)
 *   AGENT_CARD_MAX_ROUNDS    — negotiation rounds hint (default 6)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

async function main() {
  const { brand } = await import("../brand.config");
  const { prisma } = await import("../lib/db");
  const {
    canonicalJson,
    generateAgentCardKeyPair,
    signAgentCard,
    verifyAgentCard,
  } = await import("../lib/a2a/agent-card");
  type Payload = import("../lib/a2a/agent-card").AgentCardPayload;

  if (!brand.features?.a2a) {
    console.warn(
      "note: brand.features.a2a is currently false — publishing anyway so the card is ready the moment the flag flips.",
    );
  }

  const currency = brand.policies?.currency || "DKK";
  const shopId = new URL(brand.url).hostname;

  // Capabilities from the live catalogue: the cheapest visible product's
  // price anchors a genuine "order products" capability — informational for
  // buyer agents (the negotiation engine enforces its own limits regardless).
  const range = await prisma.product
    .aggregate({
      where: { deletedAt: null },
      _min: { priceDkk: true },
      _count: { _all: true },
    })
    .catch(() => null);
  const anchor = range?._min?.priceDkk ?? null;

  const previous = await prisma.agentCard.findFirst({
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (previous?.version ?? 0) + 1;

  const expiresDays = Number(process.env.AGENT_CARD_EXPIRES_DAYS || 90);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + expiresDays * 86_400_000);

  const payload: Payload = {
    version,
    shopId,
    shopName: brand.storeName,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    capabilities: [
      {
        id: "catalogue-order",
        name: `Order from the ${brand.storeName} catalogue`,
        anchorPriceMinor: anchor,
        floorPriceMinor: null,
        currency,
      },
    ],
    paymentRails: ["stripe"],
    negotiationPolicy: {
      concessionRate: 0.1,
      maxRounds: Number(process.env.AGENT_CARD_MAX_ROUNDS || 6),
    },
  };

  const { privateKeyPem } = { ...generateAgentCardKeyPair() };
  const { signature, publicKey } = signAgentCard(payload, privateKeyPem);
  // The private key lives only in this process — verify before we discard it.
  if (!verifyAgentCard({ payload, signature, publicKey })) {
    throw new Error("Self-verification failed — refusing to publish.");
  }

  const [, created] = await prisma.$transaction([
    prisma.agentCard.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: issuedAt },
    }),
    prisma.agentCard.create({
      data: {
        version,
        signedJson: canonicalJson(payload),
        signature,
        publicKey,
        signedAt: issuedAt,
        expiresAt,
      },
    }),
  ]);

  console.log(
    `Published Agent Card v${created.version} for ${shopId} (${range?._count._all ?? "?"} products, anchor ${anchor ?? "none"} ${currency}, expires ${expiresAt.toISOString().slice(0, 10)}). Previous cards revoked.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
