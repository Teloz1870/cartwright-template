import {
  getIntegrationStatus,
  getStripeStatus,
  getResendStatus,
} from "./actions";
import { getSetupStatus } from "@/lib/setup-status";
import AnthropicKeyForm from "./AnthropicKeyForm";
import GeminiKeyForm from "./GeminiKeyForm";
import StripeKeyForm from "./StripeKeyForm";
import ResendKeyForm from "./ResendKeyForm";
import VideoKeyForm from "./VideoKeyForm";
import SetupRunbook from "./SetupRunbook";
import SetupTabs from "./SetupTabs";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  const [{ anthropic, gemini, video }, stripe, resend, setupStatus] = await Promise.all([
    getIntegrationStatus(),
    getStripeStatus(),
    getResendStatus(),
    getSetupStatus(),
  ]);

  const videoStatus = video || { isSet: false, preview: null, provider: "luma" };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Integrationer</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Connect external services that do not run locally. Keys are stored in
          the database so changes take effect instantly without restarting
          serveren.
        </p>
      </header>

      <SetupTabs
        keys={
          <div className="flex flex-col gap-8">
            <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">
                  Anthropic (Claude)
                </h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Bruges af{" "}
                  <code className="rounded bg-sol-cream px-1.5 py-0.5">
                    /api/assistant/chat
                  </code>{" "}
                  - customer-facing AI stylist on the storefront. Without a key,
                  the endpoint returns 503 and the chat window shows a clean error.
                </p>
              </div>

              <AnthropicKeyForm
                isSet={anthropic.isSet}
                preview={anthropic.preview}
                envFallback={anthropic.envFallback}
              />
            </section>

            <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">
                  Google Gemini
                </h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Used for AI virtual try-on on product pages. Without a key,
                  kunder ikke generere try-on-billeder.
                </p>
              </div>

              <GeminiKeyForm initialStatus={gemini} />
            </section>

            <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">Stripe (betaling)</h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Real payment via Stripe — kort, Apple Pay, Google Pay, MobilePay
                  og Stripe Link. <strong>Phase 2-prep:</strong> keys gemmes
                  encrypted but NOT used at runtime yet. Mock payment continues
                  indtil Phase 3 hvor vi wire&apos;er PaymentIntents + webhook op.
                </p>
              </div>

              <StripeKeyForm initial={stripe} />
            </section>

            <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">Resend (email)</h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Production mailer for magic links + order confirmations. Without a
                  key, emails are only written to <code>.mail-previews/</code> locally -
                  ingen rigtige emails leveres.
                </p>
              </div>
              <ResendKeyForm initial={resend} />
            </section>

            <section className="rounded-2xl border border-sol-ink/10 bg-sol-sand p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">AI Cinematic Video (Luma)</h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Used for generating 5-second cinematic video banners from static product images. Without a key,
                  the video generation button in the Category/Product admin will be disabled.
                </p>
              </div>
              <VideoKeyForm initialStatus={videoStatus} />
            </section>

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
        }
        runbook={
          <SetupRunbook
            items={setupStatus.items}
            totalRequired={setupStatus.totalRequired}
            okCount={setupStatus.okCount}
            pctComplete={setupStatus.pctComplete}
          />
        }
      />
    </div>
  );
}
