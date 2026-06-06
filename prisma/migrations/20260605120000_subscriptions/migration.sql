-- Track T7 subscriptions. Additive state fields for Stripe Billing lifecycle
-- rendering/actions. Existing Subscription rows remain valid.

ALTER TABLE "Subscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "pauseCollectionBehavior" TEXT;
