/**
 * reviews — cartwright-plugin-v1 (plugin wave 2, core-audit §6b №4).
 *
 * The ProductReview system: PDP review list + write form, customer submit API
 * (session / email-token / anonymous), post-purchase review-prompt cron +
 * email, unauth token landing page, logged-in order-review page, and the
 * `/admin/anmeldelser` moderation queue. Audit scope: `lib/reviews.ts`
 * inbound 8; PDP mount = the spec's `product.afterDescription` slot.
 *
 * PURE DATA module: imports nothing but the contract type, so the
 * marketplace-manifest generator (client-safe) and the drift test can read it.
 *
 * Storefront mount note: the PDP (`app/[locale]/product/[slug]/page.tsx`)
 * renders `<ReviewList>` / `<WriteReviewForm>` and the AggregateRating JSON-LD
 * (`getAggregateRating`) behind `brand.features.reviews` — reached through the
 * `@/components/*` + `@/lib/reviews` shims. v1 keeps those hand-wired mounts;
 * slot-host mounting is the parked Phase-1 spec's follow-up.
 *
 * Schema note: `ProductReview` + `ReviewPromptLog` are plugin-exclusive (no
 * core code reads them), so they are declared honestly below. The
 * back-relation FIELDS they need (`Product.reviews`, `User.reviews`,
 * `Order.reviews`, `Order.reviewPromptLog`) live on core models in
 * prisma/schema.prisma and stay there — v1 install never mutates schema; the
 * fragment surfaces as a "run pnpm db:push" note.
 */
import { PLUGIN_SCHEMA_ID, type CartwrightPluginManifest } from "@/lib/plugins/spec";

export const reviewsPlugin: CartwrightPluginManifest = {
  schema: PLUGIN_SCHEMA_ID,
  slug: "reviews",
  name: "Product reviews",
  description:
    "Verified-purchase product reviews: PDP review list + form, AggregateRating JSON-LD, post-purchase email prompts (cron), and an admin moderation queue.",
  version: "1.0.0",
  flag: "reviews",
  files: [
    // Self-contained module (source of truth).
    { path: "plugins/reviews/manifest.ts" },
    { path: "plugins/reviews/lib/reviews.ts" },
    { path: "plugins/reviews/lib/review-token.ts" },
    { path: "plugins/reviews/lib/mailer-review-prompt.ts" },
    { path: "plugins/reviews/components/ReviewList.tsx" },
    { path: "plugins/reviews/components/WriteReviewForm.tsx" },
    { path: "plugins/reviews/pages/ReviewTokenPage.tsx" },
    { path: "plugins/reviews/pages/OrderReviewPage.tsx" },
    { path: "plugins/reviews/api/submit.ts" },
    { path: "plugins/reviews/api/review-prompt-cron.ts" },
    { path: "plugins/reviews/admin/AdminReviewsPage.tsx" },
    { path: "plugins/reviews/admin/ReviewDetailPage.tsx" },
    { path: "plugins/reviews/admin/ModerationActions.tsx" },
    { path: "plugins/reviews/admin/actions.ts" },
    // Import-path shims (existing scaffolds + the core PDP import these).
    { path: "lib/reviews.ts" },
    { path: "lib/review-token.ts" },
    { path: "lib/mailer/review-prompt.ts" },
    { path: "components/ReviewList.tsx" },
    { path: "components/WriteReviewForm.tsx" },
    { path: "app/admin/anmeldelser/actions.ts" },
    { path: "app/admin/anmeldelser/[id]/ModerationActions.tsx" },
    // Route mounts (also listed under routeMounts below).
    { path: "app/api/reviews/route.ts" },
    { path: "app/api/cron/review-prompt/route.ts" },
    { path: "app/[locale]/review/[token]/page.tsx" },
    { path: "app/[locale]/account/orders/[id]/review/page.tsx" },
    { path: "app/admin/anmeldelser/page.tsx" },
    { path: "app/admin/anmeldelser/[id]/page.tsx" },
  ],
  routeMounts: [
    {
      mount: "app/api/reviews/route.ts",
      from: "plugins/reviews/api/submit.ts",
      exports: ["POST"],
    },
    {
      mount: "app/api/cron/review-prompt/route.ts",
      from: "plugins/reviews/api/review-prompt-cron.ts",
      exports: ["GET"],
    },
    {
      mount: "app/[locale]/review/[token]/page.tsx",
      from: "plugins/reviews/pages/ReviewTokenPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/[locale]/account/orders/[id]/review/page.tsx",
      from: "plugins/reviews/pages/OrderReviewPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/admin/anmeldelser/page.tsx",
      from: "plugins/reviews/admin/AdminReviewsPage.tsx",
      exports: ["default"],
    },
    {
      mount: "app/admin/anmeldelser/[id]/page.tsx",
      from: "plugins/reviews/admin/ReviewDetailPage.tsx",
      exports: ["default"],
    },
  ],
  adminNav: [{ href: "/admin/anmeldelser", label: "Reviews" }],
  prismaFragment: `// orderId-link bevares for verified-purchase-badge. authorName + authorEmail
// gemmes som snapshot så reviews er læselige selvom user/order slettes.
// NOTE: the back-relation fields Product.reviews, User.reviews, Order.reviews
// and Order.reviewPromptLog live on the core models and stay in the core schema.
model ProductReview {
  id            String    @id @default(cuid())
  productId     String
  product       Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  userId        String?
  user          User?     @relation(fields: [userId], references: [id])
  orderId       String?
  order         Order?    @relation(fields: [orderId], references: [id])
  authorName    String
  authorEmail   String
  rating        Int // 1-5
  title         String?
  body          String
  language      String    @default("da")
  status        String    @default("pending") // pending | approved | rejected | spam
  moderatorNote String?
  moderatedBy   String?
  moderatedAt   DateTime?
  reviewToken   String?   @unique // for unauth via email-link
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([productId, status])
  @@index([status, createdAt])
  @@index([orderId])
}

// Idempotens-tabel for post-purchase review-prompt mails. orderId som PK
// så samme ordre aldrig får to prompts (matcher ProcessedWebhookEvent-pattern).
model ReviewPromptLog {
  orderId        String   @id
  order          Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  sentAt         DateTime @default(now())
  emailMessageId String?
}`,
  // `resend` is used by the review-prompt mailer. It is a CORE dep today
  // (lib/mailer/* also imports it); declared here so the light scaffold knows
  // the plugin needs it if core ever drops it.
  deps: [{ name: "resend" }],
};
