import {
  getIntegrationStatus,
  getGoogleOAuthStatus,
  getStripeStatus,
  getResendStatus,
  getAiSettingsForUi,
  getVoiceShopSettingsForUi,
} from "./actions";
import { getSetupStatus } from "@/lib/setup-status";
import AnthropicKeyForm from "./AnthropicKeyForm";
import GeminiKeyForm from "./GeminiKeyForm";
import GoogleOAuthForm from "./GoogleOAuthForm";
import StripeKeyForm from "./StripeKeyForm";
import ResendKeyForm from "./ResendKeyForm";
import VideoKeyForm from "./VideoKeyForm";
import V0KeyForm from "./V0KeyForm";
import SetupRunbook from "./SetupRunbook";
import AdminTabs from "@/components/admin/AdminTabs";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";
import ImportConnectors from "./ImportConnectors";
import LocalAiForm from "./LocalAiForm";
import VoiceShopForm from "./VoiceShopForm";
import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  const voiceShopFeature = (brand.features ?? {}) as Record<string, boolean | undefined>;
  const showVoiceShop = !!voiceShopFeature.voiceShop;

  const [
    { anthropic, gemini, video, v0 },
    stripe,
    googleOAuth,
    resend,
    setupStatus,
    aiSettings,
    voiceShopUi,
    liveBrand,
  ] = await Promise.all([
    getIntegrationStatus(),
    getStripeStatus(),
    getGoogleOAuthStatus(),
    getResendStatus(),
    getSetupStatus(),
    getAiSettingsForUi(),
    showVoiceShop ? getVoiceShopSettingsForUi() : Promise.resolve(null),
    getBrand(),
  ]);

  // Runtime-flags (DB-merged) til "Import & sync"-connector-kortene.
  const liveFeatures = (liveBrand.features ?? {}) as Record<string, boolean | undefined>;

  const videoStatus = video || { isSet: false, preview: null, provider: "luma" };
  const v0Status = v0 || {
    isSet: false,
    preview: null,
    envFallback: false,
    privacyTier: "opt-out",
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Integrations"
        subtitle="Connect external services that do not run locally. Keys are stored in the database so changes take effect instantly without restarting the server."
      />

      <AdminTabs
        tabs={[
          {
            id: "keys",
            label: "API keys",
            content: (
          <div className="flex flex-col gap-6">
            <AdminCard
              title="AI provider"
              description="Choose between cloud (Anthropic) or local AI (Ollama on your own Mac). Auto mode tries local first and falls back to cloud if Ollama is down."
            >
              <LocalAiForm initial={aiSettings} />
            </AdminCard>

            {showVoiceShop && voiceShopUi && (
              <AdminCard
                title="Voice Shop (Gemini Live)"
                description="Let customers talk directly to the shop by voice. Requires a Google Gemini API key (above) and brand.features.voiceShop=true. Tools are executed server-side with the same audit log as text chat."
              >
                <VoiceShopForm initial={voiceShopUi} />
              </AdminCard>
            )}

            <AdminCard title="Anthropic (Claude)">
              <p className="mb-5 -mt-1 text-sm text-sol-muted">
                Used by{" "}
                <code className="rounded bg-sol-cream px-1.5 py-0.5">
                  /api/assistant/chat
                </code>{" "}
                - customer-facing AI stylist on the storefront. Without a key,
                the endpoint returns 503 and the chat window shows a clean error.
              </p>

              <AnthropicKeyForm
                isSet={anthropic.isSet}
                preview={anthropic.preview}
                envFallback={anthropic.envFallback}
              />
            </AdminCard>

            <AdminCard
              title="Google Gemini"
              description="Used for AI virtual try-on on product pages. Without a key, customers cannot generate try-on images."
            >
              <GeminiKeyForm initialStatus={gemini} />
            </AdminCard>

            <AdminCard
              title="Google Workspace OAuth2"
              description="Shared server-side connector for Google Sheets, Drive and Docs. This is not the customers’ “Sign in with Google”."
            >
              <GoogleOAuthForm initial={googleOAuth} />
            </AdminCard>

            <AdminCard title="Stripe (payment)">
              <p className="mb-5 -mt-1 text-sm text-sol-muted">
                Real payment via Stripe — cards, Apple Pay, Google Pay, MobilePay
                and Stripe Link. <strong>Phase 2 prep:</strong> keys are stored
                encrypted but NOT used at runtime yet. Mock payment continues
                until Phase 3 where we wire up PaymentIntents + webhook.
              </p>

              <StripeKeyForm initial={stripe} />
            </AdminCard>

            <AdminCard title="Resend (email)">
              <p className="mb-5 -mt-1 text-sm text-sol-muted">
                Production mailer for magic links + order confirmations. Without a
                key, emails are only written to <code>.mail-previews/</code> locally -
                no real emails are delivered.
              </p>
              <ResendKeyForm initial={resend} />
            </AdminCard>

            <AdminCard
              title="AI Cinematic Video (Luma)"
              description="Used for generating 5-second cinematic video banners from static product images. Without a key, the video generation button in the Category/Product admin will be disabled."
            >
              <VideoKeyForm initialStatus={videoStatus} />
            </AdminCard>

            <AdminCard title="Vercel v0 (UI generation)">
              <p className="mb-5 -mt-1 text-sm text-sol-muted">
                Generate storefront sections via the v0 Platform API (text→UI) as an alternative
                AI engine in <strong>Vibe Sandbox</strong>. v0&apos;s code is normalized + sanitized
                to HTML and stored as <code>vibeHtml</code> (never source code on disk). Turn on{" "}
                <strong>v0 UI generation</strong> in <code>/admin/features</code> to show the
                engine selector.
              </p>
              <V0KeyForm initialStatus={v0Status} />
            </AdminCard>

            <section className="rounded-2xl border border-dashed border-sol-ink/15 p-6">
              <h2 className="text-lg font-black text-sol-muted">Coming later</h2>
              <ul className="mt-3 space-y-2 text-sm text-sol-muted">
                <li>
                  <strong>Voyage AI / OpenAI embeddings</strong> — for semantic
                  catalog search if the catalog grows beyond 100+ products
                </li>
              </ul>
            </section>
          </div>
            ),
          },
          {
            id: "import",
            label: "Import & sync",
            content: (
              <ImportConnectors
                sheetsSync={Boolean(liveFeatures.sheetsSync)}
                googleDrive={Boolean(liveFeatures.googleDrive)}
                docsImport={Boolean(liveFeatures.docsImport)}
              />
            ),
          },
          {
            id: "setup",
            label: "Setup-guide",
            content: (
              <SetupRunbook
                items={setupStatus.items}
                totalRequired={setupStatus.totalRequired}
                okCount={setupStatus.okCount}
                pctComplete={setupStatus.pctComplete}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
