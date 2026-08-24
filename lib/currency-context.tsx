"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { CURRENCY_COOKIE_NAME } from "@/lib/currency-shared";
import type { FxRatesOverridePayload } from "@/lib/money";

/**
 * Klient-side currency-state. Mounted i app/[locale]/layout.tsx med
 * initial-værdi læst server-side via getCurrency() så SSR-HTML matcher
 * post-hydration state (ingen flash).
 *
 * setCurrency() opdaterer cookie (1-års TTL) + lokal state. Storefront-
 * komponenter (ProductCard, PDP, cart, checkout) bruger useCurrency() til
 * at hente aktiv currency + server-primed FX overrides og sende dem til
 * formatPrice().
 *
 * Page reload efter currency-skift er IKKE påkrævet — alle priser re-rendrer
 * via React state. SSR'ed pages efter skift læser nye cookie + matcher.
 */

type CurrencyContextValue = {
  currency: string;
  fxRateOverrides: FxRatesOverridePayload | null;
  setCurrency: (next: string) => void;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  initial,
  fxRateOverrides = null,
  children,
}: {
  initial: string;
  fxRateOverrides?: FxRatesOverridePayload | null;
  children: ReactNode;
}) {
  const [currency, setCurrencyState] = useState(initial);

  const setCurrency = useCallback((next: string) => {
    setCurrencyState(next);
    if (typeof document !== "undefined") {
      const oneYearSec = 365 * 24 * 60 * 60;
      const secure =
        typeof window !== "undefined" && window.location.protocol === "https:"
          ? "; Secure"
          : "";
      document.cookie = `${CURRENCY_COOKIE_NAME}=${next}; Path=/; Max-Age=${oneYearSec}; SameSite=Lax${secure}`;
    }
  }, []);

  return (
    <CurrencyContext.Provider
      value={{ currency, fxRateOverrides, setCurrency }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Defensive fallback for komponenter der renderes uden for provider
    // (fx isolerede storybook-snapshots) — returnér base-currency.
    return { currency: "DKK", fxRateOverrides: null, setCurrency: () => {} };
  }
  return ctx;
}
