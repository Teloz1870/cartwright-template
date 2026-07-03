-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "vibeHtml" TEXT,
    "heroImage" TEXT,
    "heroVideo" TEXT,
    "heroImageAssetId" TEXT,
    "heroVideoAssetId" TEXT,
    "descriptionLong" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "faq" TEXT,
    "translations" JSONB,
    CONSTRAINT "Category_heroImageAssetId_fkey" FOREIGN KEY ("heroImageAssetId") REFERENCES "MediaAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Category_heroVideoAssetId_fkey" FOREIGN KEY ("heroVideoAssetId") REFERENCES "MediaAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyFormat" TEXT,
    "heroImage" TEXT,
    "heroImageAssetId" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "showInNav" BOOLEAN NOT NULL DEFAULT false,
    "navOrder" INTEGER NOT NULL DEFAULT 0,
    "translations" JSONB,
    "updatedAt" DATETIME NOT NULL,
    "vibeHtml" TEXT,
    "layoutJson" TEXT,
    CONSTRAINT "Page_heroImageAssetId_fkey" FOREIGN KEY ("heroImageAssetId") REFERENCES "MediaAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "priceString" TEXT,
    "heroImage" TEXT,
    "heroImageAssetId" TEXT,
    "features" JSONB,
    "body" TEXT NOT NULL,
    "vibeHtml" TEXT,
    "showInNav" BOOLEAN NOT NULL DEFAULT false,
    "navOrder" INTEGER NOT NULL DEFAULT 0,
    "translations" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_heroImageAssetId_fkey" FOREIGN KEY ("heroImageAssetId") REFERENCES "MediaAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceDkk" INTEGER NOT NULL,
    "videoUrl" TEXT,
    "videoGenerationId" TEXT,
    "images" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "frameColor" TEXT,
    "lensColor" TEXT,
    "brand" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB,
    "answerSummary" TEXT,
    "faq" TEXT,
    "useCases" JSONB,
    "comparisonFacts" JSONB,
    "categoryId" TEXT NOT NULL,
    "translations" JSONB,
    "weightGram" INTEGER,
    "supplierId" TEXT,
    "sheetRowRef" TEXT,
    "deletedAt" DATETIME,
    "vibeHtml" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "priceDkk" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" DATETIME,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'customer',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "shippingName" TEXT,
    "shippingAddress" TEXT,
    "shippingZip" TEXT,
    "shippingCity" TEXT,
    "phoneNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AbandonedCartLog" (
    "cartId" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailMessageId" TEXT,
    CONSTRAINT "AbandonedCartLog_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pauseCollectionBehavior" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "shippingName" TEXT NOT NULL,
    "shippingAddress" TEXT NOT NULL,
    "shippingZip" TEXT NOT NULL,
    "shippingCity" TEXT NOT NULL,
    "billingName" TEXT,
    "billingAddress" TEXT,
    "billingZip" TEXT,
    "billingCity" TEXT,
    "billingCountry" TEXT,
    "phoneNumber" TEXT,
    "subtotalDkk" INTEGER NOT NULL,
    "shippingDkk" INTEGER NOT NULL,
    "discountDkk" INTEGER NOT NULL DEFAULT 0,
    "totalDkk" INTEGER NOT NULL,
    "vatOere" INTEGER,
    "invoiceProvider" TEXT,
    "invoiceId" TEXT,
    "invoicePdfUrl" TEXT,
    "discountCode" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiAgentSource" TEXT,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "estDeliveryFrom" DATETIME,
    "estDeliveryTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripePaymentIntentId" TEXT,
    "paymentMethod" TEXT,
    "paidAt" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'DKK',
    "fxRate" REAL NOT NULL DEFAULT 1,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "acpSessionId" TEXT,
    "confirmationEmailSentAt" DATETIME,
    "refundedAt" DATETIME,
    "disputedAt" DATETIME,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'private',
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "refundDkk" INTEGER NOT NULL DEFAULT 0,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "stripeRefundId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Return_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "variantId" TEXT,
    CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AcpCheckoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'not_ready_for_payment',
    "currency" TEXT NOT NULL DEFAULT 'dkk',
    "lineItemsJson" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "shippingName" TEXT,
    "shippingAddress" TEXT,
    "shippingZip" TEXT,
    "shippingCity" TEXT,
    "shippingCountry" TEXT,
    "fulfillmentOption" TEXT,
    "discountCode" TEXT,
    "subtotalDkk" INTEGER NOT NULL DEFAULT 0,
    "shippingDkk" INTEGER NOT NULL DEFAULT 0,
    "discountDkk" INTEGER NOT NULL DEFAULT 0,
    "totalDkk" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AcpIdempotencyKey" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitPriceDkk" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "variantId" TEXT,
    "variantSku" TEXT,
    "variantAttributes" JSONB,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "validUntil" DATETIME,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "description" TEXT,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    "lastUsedIp" TEXT,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "argsJson" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "ok" BOOLEAN NOT NULL,
    "errorMsg" TEXT,
    "requestId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "modality" TEXT,
    "sessionMinutes" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShippingSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "shippingFeeOere" INTEGER NOT NULL,
    "freeShippingThresholdOere" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrandingSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "storeName" TEXT NOT NULL,
    "heroImage" TEXT NOT NULL,
    "heroImageAssetId" TEXT,
    "announcement" TEXT NOT NULL,
    "agenticPolicyJson" TEXT,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "tagline" TEXT,
    "domain" TEXT,
    "emailFrom" TEXT,
    "emailFromName" TEXT,
    "emailSupport" TEXT,
    "emailAdmin" TEXT,
    "industryTemplate" TEXT,
    "designSlug" TEXT,
    "themeJson" TEXT,
    "layoutJson" TEXT,
    "ecommerceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "websiteHeadline" TEXT,
    "heroCta" TEXT,
    "logoImageUrl" TEXT,
    "logoMarkPaths" TEXT,
    "logoMarkViewBox" TEXT,
    "logoMarkStrokeWidth" INTEGER,
    "logoMarkClass" TEXT,
    "logoTransform" TEXT,
    "faviconBg" TEXT,
    "faviconFg" TEXT,
    "defaultLocale" TEXT DEFAULT 'da',
    "featureOverridesJson" TEXT,
    "threeDConfigJson" TEXT,
    "genomeJson" TEXT,
    "seoIndexing" TEXT DEFAULT 'public',
    "aiCrawlers" TEXT DEFAULT 'allow',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandingSettings_heroImageAssetId_fkey" FOREIGN KEY ("heroImageAssetId") REFERENCES "MediaAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "aiProvider" TEXT DEFAULT 'anthropic',
    "localAiEndpoint" TEXT DEFAULT 'http://localhost:11434/v1',
    "localAiModel" TEXT DEFAULT 'gemma:7b',
    "anthropicModel" TEXT DEFAULT 'claude-haiku-4-5',
    "localAiFallbackMode" TEXT DEFAULT 'on-error',
    "lastDegradedAt" DATETIME,
    "lastModelDetectedAt" DATETIME,
    "aiUsageJson" TEXT,
    "anthropicApiKey" TEXT,
    "googleGeminiApiKey" TEXT,
    "voiceShopEnabled" BOOLEAN DEFAULT false,
    "voiceShopModel" TEXT DEFAULT 'gemini-2.5-flash-live',
    "voiceShopVoice" TEXT DEFAULT 'Puck',
    "voiceShopAllowedToolsJson" TEXT,
    "voiceShopMaxMinutesPerSession" INTEGER DEFAULT 5,
    "voiceShopMaxMinutesPerDay" INTEGER DEFAULT 60,
    "voiceShopVisionEnabled" BOOLEAN DEFAULT true,
    "voiceShopLastDailyUsageJson" TEXT,
    "stripeSecretKey" TEXT,
    "stripePublishableKey" TEXT,
    "stripeWebhookSecret" TEXT,
    "resendApiKey" TEXT,
    "setupChecklist" TEXT,
    "videoGenerationApiKey" TEXT,
    "videoGenProvider" TEXT DEFAULT 'luma',
    "phoneIncWorkspaceId" TEXT,
    "phoneIncApiKey" TEXT,
    "vercelToken" TEXT,
    "vercelProjectId" TEXT,
    "vibeApiKey" TEXT,
    "v0ApiKey" TEXT,
    "v0UsageJson" TEXT,
    "v0PrivacyTier" TEXT DEFAULT 'opt-out',
    "v0DefaultDesignSystemId" TEXT,
    "googleOAuthClientId" TEXT,
    "googleOAuthClientSecret" TEXT,
    "driveFolderId" TEXT,
    "driveBackupFolderId" TEXT,
    "sheetsSpreadsheetId" TEXT,
    "sheetsLastSyncAt" DATETIME,
    "sheetsLastSyncResultJson" TEXT,
    "fxRatesJson" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "accountEmail" TEXT,
    "grantedScopesJson" TEXT,
    "refreshTokenEnc" TEXT,
    "accessTokenEnc" TEXT,
    "tokenExpiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastError" TEXT,
    "connectedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductEmbedding" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "vectorJson" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductEmbedding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageSearchCache" (
    "queryHash" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'unsplash',
    "query" TEXT NOT NULL,
    "resultsJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "projectType" TEXT NOT NULL,
    "budget" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "aiPriority" TEXT,
    "aiSummary" TEXT,
    "aiSuggestedReply" TEXT,
    "attachmentUrls" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MigrationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceUrl" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "storeName" TEXT,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "logJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 1,
    "signedJson" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EscrowTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "buyerAgentId" TEXT NOT NULL,
    "shopId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DKK',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "disputeReason" TEXT,
    "fundedAt" DATETIME,
    "releasedAt" DATETIME,
    "refundedAt" DATETIME,
    "disputedAt" DATETIME,
    "paymentRail" TEXT NOT NULL DEFAULT 'stripe',
    "paymentRefId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PoTEProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "escrowTxId" TEXT NOT NULL,
    "proofType" TEXT NOT NULL,
    "proofPayloadJson" TEXT NOT NULL,
    "expectedHash" TEXT,
    "submittedHash" TEXT,
    "verifierResult" TEXT NOT NULL DEFAULT 'pending',
    "verifierMessage" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PoTEProof_escrowTxId_fkey" FOREIGN KEY ("escrowTxId") REFERENCES "EscrowTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgenticJWT" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jti" TEXT NOT NULL,
    "issuerAgentId" TEXT NOT NULL,
    "audienceShop" TEXT,
    "scopes" TEXT NOT NULL,
    "capabilitiesJson" TEXT NOT NULL,
    "signedJwt" TEXT NOT NULL,
    "verifyResult" TEXT NOT NULL DEFAULT 'pending',
    "verifyError" TEXT,
    "requestPath" TEXT NOT NULL,
    "requestMethod" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "blobPathname" TEXT,
    "sha256" TEXT,
    "altDa" TEXT,
    "altEn" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "geoSnippet" TEXT,
    "dominantColors" TEXT,
    "suggestedSlug" TEXT,
    "aiStatus" TEXT NOT NULL DEFAULT 'pending',
    "aiModel" TEXT,
    "aiAttempts" INTEGER NOT NULL DEFAULT 0,
    "aiLastError" TEXT,
    "uploadedBy" TEXT,
    "driveFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductMedia" (
    "productId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'gallery',

    PRIMARY KEY ("productId", "assetId"),
    CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductMedia_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'da',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderatorNote" TEXT,
    "moderatedBy" TEXT,
    "moderatedAt" DATETIME,
    "reviewToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewPromptLog" (
    "orderId" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailMessageId" TEXT,
    CONSTRAINT "ReviewPromptLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeoSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "page" TEXT,
    "query" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "position" REAL,
    "ctr" REAL
);

-- CreateTable
CREATE TABLE "GeoSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engine" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "cited" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "SeoExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fieldKey" TEXT NOT NULL,
    "beforeValue" TEXT,
    "afterValue" TEXT NOT NULL,
    "baselineJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluatedAt" DATETIME,
    "resultNote" TEXT
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "unsubscribedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DataErasureRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT NOT NULL,
    "summaryJson" TEXT,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "bodyFormat" TEXT,
    "coverImage" TEXT,
    "author" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" DATETIME,
    "tags" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "translations" JSONB,
    "vibeHtml" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "countries" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feeDkk" INTEGER NOT NULL,
    "freeThresholdDkk" INTEGER,
    "minWeightGram" INTEGER,
    "maxWeightGram" INTEGER,
    "deliveryDaysMin" INTEGER NOT NULL DEFAULT 2,
    "deliveryDaysMax" INTEGER NOT NULL DEFAULT 5,
    CONSTRAINT "ShippingRate_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ShippingZone" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FulfillmentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "token" TEXT NOT NULL,
    "lineJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FulfillmentOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FulfillmentOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "WishlistItem_userId_idx" ON "WishlistItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_userId_productId_key" ON "WishlistItem"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubId_key" ON "Subscription"("stripeSubId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_sessionId_key" ON "Cart"("sessionId");

-- CreateIndex
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_variantId_key" ON "CartItem"("cartId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_email_idx" ON "Order"("email");

-- CreateIndex
CREATE INDEX "OrderNote_orderId_createdAt_idx" ON "OrderNote"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Return_orderId_idx" ON "Return"("orderId");

-- CreateIndex
CREATE INDEX "Return_status_idx" ON "Return"("status");

-- CreateIndex
CREATE INDEX "ReturnItem_returnId_idx" ON "ReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_createdAt_idx" ON "ProcessedWebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcpCheckoutSession_orderId_key" ON "AcpCheckoutSession"("orderId");

-- CreateIndex
CREATE INDEX "AcpCheckoutSession_status_idx" ON "AcpCheckoutSession"("status");

-- CreateIndex
CREATE INDEX "AcpCheckoutSession_expiresAt_idx" ON "AcpCheckoutSession"("expiresAt");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tool_idx" ON "AuditLog"("tool");

-- CreateIndex
CREATE INDEX "AuditLog_actor_idx" ON "AuditLog"("actor");

-- CreateIndex
CREATE INDEX "AuditLog_provider_idx" ON "AuditLog"("provider");

-- CreateIndex
CREATE INDEX "ImageSearchCache_expiresAt_idx" ON "ImageSearchCache"("expiresAt");

-- CreateIndex
CREATE INDEX "AgentCard_revokedAt_createdAt_idx" ON "AgentCard"("revokedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AgentCard_version_idx" ON "AgentCard"("version");

-- CreateIndex
CREATE INDEX "EscrowTransaction_status_idx" ON "EscrowTransaction"("status");

-- CreateIndex
CREATE INDEX "EscrowTransaction_buyerAgentId_idx" ON "EscrowTransaction"("buyerAgentId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_sessionId_idx" ON "EscrowTransaction"("sessionId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_createdAt_idx" ON "EscrowTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "PoTEProof_escrowTxId_idx" ON "PoTEProof"("escrowTxId");

-- CreateIndex
CREATE INDEX "PoTEProof_verifierResult_idx" ON "PoTEProof"("verifierResult");

-- CreateIndex
CREATE INDEX "AgenticJWT_issuerAgentId_createdAt_idx" ON "AgenticJWT"("issuerAgentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgenticJWT_createdAt_idx" ON "AgenticJWT"("createdAt");

-- CreateIndex
CREATE INDEX "AgenticJWT_verifyResult_idx" ON "AgenticJWT"("verifyResult");

-- CreateIndex
CREATE UNIQUE INDEX "AgenticJWT_issuerAgentId_jti_key" ON "AgenticJWT"("issuerAgentId", "jti");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_blobPathname_key" ON "MediaAsset"("blobPathname");

-- CreateIndex
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "MediaAsset_driveFileId_idx" ON "MediaAsset"("driveFileId");

-- CreateIndex
CREATE INDEX "MediaAsset_aiStatus_createdAt_idx" ON "MediaAsset"("aiStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ProductMedia_productId_position_idx" ON "ProductMedia"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_reviewToken_key" ON "ProductReview"("reviewToken");

-- CreateIndex
CREATE INDEX "ProductReview_productId_status_idx" ON "ProductReview"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductReview_status_createdAt_idx" ON "ProductReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_orderId_idx" ON "ProductReview"("orderId");

-- CreateIndex
CREATE INDEX "SeoSnapshot_capturedAt_idx" ON "SeoSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "GeoSnapshot_capturedAt_idx" ON "GeoSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "SeoExperiment_status_idx" ON "SeoExperiment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_token_key" ON "Subscriber"("token");

-- CreateIndex
CREATE INDEX "Subscriber_status_idx" ON "Subscriber"("status");

-- CreateIndex
CREATE INDEX "DataErasureRequest_email_idx" ON "DataErasureRequest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "ShippingRate_zoneId_idx" ON "ShippingRate"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentOrder_token_key" ON "FulfillmentOrder"("token");

-- CreateIndex
CREATE INDEX "FulfillmentOrder_orderId_idx" ON "FulfillmentOrder"("orderId");

-- CreateIndex
CREATE INDEX "FulfillmentOrder_supplierId_idx" ON "FulfillmentOrder"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_fromPath_key" ON "Redirect"("fromPath");

