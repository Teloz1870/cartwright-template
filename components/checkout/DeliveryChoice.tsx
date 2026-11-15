"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * Checkout's delivery step (SHIP0-b): the customer picks one of the zone
 * rates that fit the parcel, and the order summary beside the form follows
 * the choice. The server sends every option already priced and formatted
 * (fee and the order total with it), so the client only swaps labels and the
 * order is charged by the server from the chosen id, never from these labels.
 *
 * Without a provider, or with fewer than two options, nothing renders and the
 * summary keeps its server-rendered text: a shop without zones is unchanged.
 */
export type DeliveryOption = {
  id: string;
  name: string;
  /** "1–2 days", or null when the rate has no delivery time. */
  days: string | null;
  feeLabel: string;
  totalLabel: string;
};

type Choice = { options: DeliveryOption[]; selected: DeliveryOption; select: (id: string) => void };

const DeliveryChoiceContext = createContext<Choice | null>(null);

export function DeliveryChoiceProvider({ options, children }: { options: DeliveryOption[]; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const selected = options.find((o) => o.id === selectedId) ?? options[0];
  // Always the same element, with a null value when there is nothing to choose:
  // switching element type would remount the checkout form inside it, and a
  // refresh that moves the options across two would wipe what the customer typed
  // and the message telling them why.
  const value = selected && options.length >= 2 ? { options, selected, select: setSelectedId } : null;
  return <DeliveryChoiceContext.Provider value={value}>{children}</DeliveryChoiceContext.Provider>;
}

/** The chosen rate's id, for the order; null when there is nothing to choose. */
export function useChosenRateId(): string | null {
  return useContext(DeliveryChoiceContext)?.selected.id ?? null;
}

/** The radio list. Renders nothing when there is nothing to choose. */
export function DeliveryOptions({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("Checkout");
  const choice = useContext(DeliveryChoiceContext);
  const name = useId();
  if (!choice) return null;
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-1 block text-sm font-bold text-sol-ink">{t("deliveryMethod")}</legend>
      {choice.options.map((o) => {
        const checked = o.id === choice.selected.id;
        return (
          <label
            key={o.id}
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sol-ink transition ${
              checked ? "border-sol-accent ring-2 ring-sol-accent" : "border-sol-ink/20"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={checked}
              onChange={() => choice.select(o.id)}
              className="mt-1 accent-sol-accent"
            />
            <span className="flex-1">
              <span className="block font-bold">{o.name}</span>
              {o.days ? <span className="block text-sm text-sol-muted">{o.days}</span> : null}
            </span>
            <span className="whitespace-nowrap font-bold">{o.feeLabel}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** The summary's shipping line: the chosen option's, else what the server rendered. */
export function SummaryShipping({ fallback }: { fallback: ReactNode }) {
  const choice = useContext(DeliveryChoiceContext);
  return <>{choice ? choice.selected.feeLabel : fallback}</>;
}

/** The chosen option's name, shown beside "Shipping" in the summary. */
export function SummaryShippingName({ fallback }: { fallback: string | null }) {
  const choice = useContext(DeliveryChoiceContext);
  const name = choice ? choice.selected.name : fallback;
  return name ? <> ({name})</> : null;
}

/** The summary's total: with the chosen option's fee, else what the server rendered. */
export function SummaryTotal({ fallback }: { fallback: ReactNode }) {
  const choice = useContext(DeliveryChoiceContext);
  return <>{choice ? choice.selected.totalLabel : fallback}</>;
}
