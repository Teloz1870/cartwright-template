"use client";

import { useState } from "react";
import {
  PaymentMethodMarks,
  type PaymentMethodLabels,
} from "@/components/payments/PaymentMethodMarks";

// This is the §8 price-before-payment display, and it hand-rolled its own
// formatter: US grouping plus a literal " DKK" suffix, so a EUR-based shop
// announced euros as kroner. It goes through the one formatter now, which
// reads brand.policies.currency. No locale is threaded: this component renders
// in the ADMIN too, which has no request locale — faking one here would be
// worse than the currency default, and the reading-locale pass is tracked
// separately.
import { formatPriceDkk } from "@/lib/format";

type Props = {
  tool: string;
  args: unknown;
  preview: string;
  paymentMode?: "stripe" | "mock";
  /** Server-udstedt confirmation-token. Sendes tilbage via onConfirm for at
   *  verificere at det er menneske-bekræftet (ikke AI selv-bekræftet). */
  confirmationToken: string;
  /** Når true, knappen er deaktiveret (suggest-mode aktiv) */
  disabled?: boolean;
  /** Kaldes når admin klikker Bekræft. Klient gemmer token + sender ny request. */
  onConfirm: (tool: string, args: unknown, token: string) => void;
  /**
   * Labels for the payment row, resolved by the CALLER — this component renders
   * in two trees with different i18n contracts: the storefront AI panel lives
   * under `app/[locale]/layout.tsx` and its NextIntlClientProvider, while the
   * admin chat lives under `app/admin/`, which has NO provider at all. Calling
   * a translation hook here would throw in the admin the moment the AI returns
   * any confirmation request. The admin is English-only by design and passes
   * literals; the storefront passes translations.
   */
  paymentLabels: PaymentMethodLabels;
};

/**
 * Renderes inline i chat-tråden når AI'en har foreslået en destructive
 * operation. Admin scanner planen og klikker Bekræft for at eksekvere
 * (sendMessage med confirm:true tilføjet), eller Annullér for at droppe.
 *
 * Visuelt: rød accent for destructive ops, gul advarsel for audit.revert.
 */
export default function PlanCard({
  tool,
  args,
  paymentLabels,
  preview,
  paymentMode,
  confirmationToken,
  disabled,
  onConfirm,
}: Props) {
  const [state, setState] = useState<"pending" | "confirmed" | "cancelled">(
    "pending",
  );

  const isExtraDestructive = tool === "audit.revert";
  const isCampaign = tool === "marketing.create_campaign";
  const isDelete = tool.endsWith(".delete");
  // DK Forbrugeraftaleloven §8: ordre-placering kræver eksplicit "Køb nu"-
  // knaptekst (ikke "Bekræft", "Næste", "Fortsæt"). Vi mærker orders.create
  // specifikt så vi kan customize knap-label + tilføje TEST-BUTIK-banner.
  const isOrderCreate = tool === "orders.create";

  // Farve-koder baseret på destructive-grad
  let toneClasses = "border-sol-accent bg-sol-sand"; // default — modify
  if (isExtraDestructive) toneClasses = "border-orange-500 bg-orange-50";
  else if (isDelete) toneClasses = "border-red-500 bg-red-50";
  else if (isCampaign) toneClasses = "border-sol-accent bg-sol-accent/5";
  // Phase 7 Task B: stripe-mode får frosted glass for premium-checkout-følelse
  // — sol-card-glass-utility (defineret i Phase 6) + accent-edge for definition.
  // Mock-mode beholder den hvide baggrund så TEST-BUTIK-banner kontrasterer.
  else if (isOrderCreate && paymentMode === "stripe")
    toneClasses = "sol-card-glass border-sol-accent/30";
  else if (isOrderCreate) toneClasses = "border-sol-accent bg-white";

  // Total fra args hvis tilstede (orders.create-flow)
  const totalDkk =
    isOrderCreate && args && typeof args === "object" && "totalDkk" in args
      ? (args as { totalDkk: number }).totalDkk
      : null;

  if (state === "confirmed") {
    return (
      <div className="rounded-xl border border-green-500 bg-green-50 px-4 py-2 text-xs font-bold text-green-800">
        ✓ Confirmed. Running {tool}...
      </div>
    );
  }

  if (state === "cancelled") {
    return (
      <div className="rounded-xl border border-sol-ink/15 bg-white px-4 py-2 text-xs text-sol-muted">
        Cancelled. {tool} was not run
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${toneClasses} overflow-hidden`}>
      {/* TEST-BUTIK-banner — vises på orders.create indtil Phase 3 (Stripe).
          Mock-payment må ikke forveksles med rigtig betaling for kunden. */}
      {isOrderCreate && (
        paymentMode === "stripe" ? (
          <div className="border-b border-sol-glass-border-dark bg-white/45 px-4 py-3 backdrop-blur-sm">
            <PaymentMethodMarks
              size="small"
              showPrefix
              labels={paymentLabels}
            />
          </div>
        ) : (
          <div className="bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900">
            Demo store: no real money is charged
          </div>
        )
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-sol-muted">
              {isExtraDestructive
                ? "Revert operation: unusual"
                : isDelete
                  ? "Destructive operation"
                  : isOrderCreate
                    ? "Confirm your order"
                    : "Confirmation required"}
            </p>
            {!isOrderCreate && (
              <p className="mt-1 font-mono text-[11px] text-sol-ink">{tool}</p>
            )}
            <p className="mt-2 text-sm font-medium leading-6 text-sol-ink">
              {preview}
            </p>
            {/* Total inkl. moms — DK lovkrav: klar pris vist før betaling */}
            {isOrderCreate && totalDkk !== null && (
              <p className="mt-3 text-base font-black text-sol-ink">
                Total incl. VAT: {formatPriceDkk(totalDkk)}
              </p>
            )}
            {/* Fortrydelsesret-info — Forbrugeraftaleloven §18 lovkrav */}
            {isOrderCreate && (
              <p className="mt-2 text-[10px] leading-5 text-sol-muted">
                You have a <strong>14-day right of withdrawal</strong> under
                applicable law. Read more on{" "}
                <a
                  href="/info/returns"
                  className="underline hover:text-sol-ink"
                  target="_blank"
                  rel="noopener"
                >
                  our returns page
                </a>
                .
              </p>
            )}
          </div>
        </div>

        {/* Args-detaljer kollapsibel — skjult for orders.create (kunden behøver
            ikke se JSON-argumenter, det er for admin/debugging) */}
        {!isOrderCreate && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-bold text-sol-muted hover:text-sol-ink">
              View full arguments
            </summary>
            <pre className="mt-1 overflow-auto rounded bg-white px-2 py-1.5 font-mono text-[10px] leading-tight text-sol-ink">
              {JSON.stringify(args, null, 2)}
            </pre>
          </details>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setState("confirmed");
              // Send tool-args og token tilbage — confirmation håndhæves
              // server-side via consumeConfirmation, ikke args.confirm-flag
              onConfirm(tool, args, confirmationToken);
            }}
            className={`rounded-full px-5 py-2 text-xs font-black uppercase tracking-wider text-white transition disabled:opacity-50 ${
              isDelete || isExtraDestructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-sol-accent hover:bg-sol-accent/90"
            }`}
          >
            {disabled
              ? "Disabled (suggest mode)"
              : isOrderCreate
                ? "Buy now"
                : "Confirm and run"}
          </button>
          <button
            type="button"
            onClick={() => setState("cancelled")}
            className="rounded-full border border-sol-ink/15 px-4 py-2 text-xs font-bold text-sol-muted transition hover:bg-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
