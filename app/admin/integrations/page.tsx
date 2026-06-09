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
        title="Integrationer"
        subtitle="Connect external services that do not run locally. Keys are stored in the database so changes take effect instantly without restarting serveren."
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
              description="Vælg mellem cloud (Anthropic) eller lokal AI (Ollama på din egen Mac). Auto-mode prøver lokal først og falder tilbage til cloud hvis Ollama er nede."
            >
              <LocalAiForm initial={aiSettings} />
            </AdminCard>

            {showVoiceShop && voiceShopUi && (
              <AdminCard
                title="Voice Shop (Gemini Live)"
                description="Lad kunder snakke direkte med shoppen via stemmen. Kræver Google Gemini API-key (ovenfor) og brand.features.voiceShop=true. Tools eksekveres server-side med samme audit-log som text-chat."
              >
                <VoiceShopForm initial={voiceShopUi} />
              </AdminCard>
            )}

            <AdminCard title="Anthropic (Claude)">
              <p className="mb-5 -mt-1 text-sm text-sol-muted">
                Bruges af{" "}
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
              description="Used for AI virtual try-on on product pages. Without a key, kunder ikke generere try-on-billeder."
            >
              <GeminiKeyForm initialStatus={gemini} />
            </AdminCard>

            <AdminCard
              title="Google Workspace OAuth2"
              description="Shared server-side connector for Google Sheets, Drive og Docs. Dette er ikke kundernes “Sign in with Google”."
            >
              <GoogleOAuthForm initial={googleOAuth} />
            </AdminCard>

            <AdminCard title="Stripe (betaling)">
              <p className="mb-5 -mt-1 text-sm text-sol-muted">
                Real payment via Stripe — kort, Apple Pay, Google Pay, MobilePay
                og Stripe Link. <strong>Phase 2-prep:</strong> keys gemmes
                encrypted but NOT used at runtime yet. Mock payment continues
                indtil Phase 3 hvor vi wire&apos;er PaymentIntents + webhook op.
              </p>

              <StripeKeyForm initial={stripe} />
            </AdminCard>

            <AdminCard title="Resend (email)">
              <p className="mb-5 -mt-1 text-sm text-sol-muted">
                Production mailer for magic links + order confirmations. Without a
                key, emails are only written to <code>.mail-previews/</code> locally -
                ingen rigtige emails leveres.
              </p>
              <ResendKeyForm initial={resend} />
            </AdminCard>

            <AdminCard
              title="AI Cinematic Video (Luma)"
              description="Used for generating 5-second cinematic video banners from static product images. Without a key, the video generation button in the Category/Product admin will be disabled."
            >
              <VideoKeyForm initialStatus={videoStatus} />
            </AdminCard>

            <AdminCard title="Vercel v0 (UI-generering)">
              <p className="mb-5 -mt-1 text-sm text-sol-muted">
                Generér storefront-sektioner via v0 Platform API (text→UI) som alternativ
                AI-motor i <strong>Vibe Sandbox</strong>. v0&apos;s kode normaliseres + saniteres
                til HTML og gemmes som <code>vibeHtml</code> (aldrig kildekode på disk). Slå{" "}
                <strong>v0 UI-generering</strong> til i <code>/admin/features</code> for at vise
                motor-vælgeren.
              </p>
              <V0KeyForm initialStatus={v0Status} />
            </AdminCard>

            <section className="rounded-2xl border border-dashed border-sol-ink/15 p-6">
              <h2 className="text-lg font-black text-sol-muted">Kommer senere</h2>
              <ul className="mt-3 space-y-2 text-sm text-sol-muted">
                <li>
                  <strong>Voyage AI / OpenAI embeddings</strong> — for semantic
                  catalog-search hvis kataloget vokser over 100+ produkter
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
