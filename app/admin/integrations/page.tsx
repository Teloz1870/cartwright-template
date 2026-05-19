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
import SetupRunbook from "./SetupRunbook";
import SetupTabs from "./SetupTabs";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  const [{ anthropic, gemini }, stripe, resend, setupStatus] = await Promise.all([
    getIntegrationStatus(),
    getStripeStatus(),
    getResendStatus(),
    getSetupStatus(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-black text-sol-ink">Integrationer</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-sol-muted">
          Tilslut eksterne tjenester der ikke kører lokalt. Keys gemmes i
          databasen så ændringer slår igennem instant uden at restarte
          serveren.
        </p>
      </header>

      <SetupTabs
        keys={
          <div className="flex flex-col gap-8">
            <section className="rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">
                  Anthropic (Claude)
                </h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Bruges af{" "}
                  <code className="rounded bg-sol-cream px-1.5 py-0.5">
                    /api/assistant/chat
                  </code>{" "}
                  — kunde-vendt AI-stylist på storefront. Uden en key returnerer
                  endpointet 503 og chat-vinduet viser en pæn fejl.
                </p>
              </div>

              <AnthropicKeyForm
                isSet={anthropic.isSet}
                preview={anthropic.preview}
                envFallback={anthropic.envFallback}
              />
            </section>

            <section className="rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">
                  Google Gemini
                </h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Bruges til AI-virtual-try-on på produktsider. Uden en nøgle kan
                  kunder ikke generere try-on-billeder.
                </p>
              </div>

              <GeminiKeyForm initialStatus={gemini} />
            </section>

            <section className="rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">Stripe (betaling)</h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Real payment via Stripe — kort, Apple Pay, Google Pay, MobilePay
                  og Stripe Link. <strong>Phase 2-prep:</strong> keys gemmes
                  krypteret men bruges IKKE i runtime endnu. Mock-payment fortsætter
                  indtil Phase 3 hvor vi wire&apos;er PaymentIntents + webhook op.
                </p>
              </div>

              <StripeKeyForm initial={stripe} />
            </section>

            <section className="rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-black text-sol-ink">Resend (email)</h2>
                <p className="mt-1 text-sm text-sol-muted">
                  Production-mailer til magic-links + ordrebekræftelser. Uden en
                  nøgle skrives mails kun til <code>.mail-previews/</code> lokalt —
                  ingen rigtige emails leveres.
                </p>
              </div>
              <ResendKeyForm initial={resend} />
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
