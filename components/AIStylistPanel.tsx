"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useLocale } from "next-intl";
import { brand } from "@/brand.config";
import { supportsDialog } from "@/lib/features";
import { useFeature } from "@/lib/feature-flags/context";
import { formatPriceDkk } from "@/lib/format";
import PlanCard from "@/components/shared/PlanCard";
import dynamicImport from "next/dynamic";

// Stripe.js ~120KB — lazy-load kun når orders.create returnerer stripe-mode
const StripePaymentPanel = dynamicImport(
  () => import("@/components/StripePaymentPanel"),
  {
    ssr: false,
    loading: () => (
      <p className="text-xs text-sol-muted">Loading payment...</p>
    ),
  },
);

type Props = { open: boolean; onClose: () => void; ecommerceEnabled?: boolean };

/**
 * Slide-in chat-panel fra højre. Bruger AI SDK's useChat-hook med UI-message
 * streaming. Tool-results (fra products.search, cart.add osv.) parses ud og
 * rendres som rigtige produktkort INDE I tråden — ikke kun som tekst.
 */
export default function AIStylistPanel({ open, onClose, ecommerceEnabled = true }: Props) {
  const en = useLocale() === "en";
  const ui = en
    ? {
        eyebrow: "AI Assistant",
        title: "Sales & Advice",
        close: "Close",
        thinking: "The AI assistant is thinking...",
        errorTitle: "Something went wrong.",
        placeholder: "Ask the assistant about...",
        send: "Send",
        footer: "The assistant can book meetings, find cases and advise on technology.",
        dialogAria: "AI assistant chat",
      }
    : {
        eyebrow: "AI-Konsulent",
        title: "Salg & Rådgivning",
        close: "Luk",
        thinking: "AI-assistenten tænker...",
        errorTitle: "Noget gik galt.",
        placeholder: "Spørg konsulenten om...",
        send: "Send",
        footer: "Konsulenten kan booke møder, finde cases og rådgive om teknologi.",
        dialogAria: "AI-konsulent chat",
      };
  const [input, setInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Confirmation-tokens keyed by tool-name. Gemmes når kunde klikker
  // Bekræft på et PlanCard; næste request inkluderer dem i body så server
  // kan consumeConfirmation og udføre tool'et. Samme pattern som AdminChatPanel.
  const [pendingConfirmations, setPendingConfirmations] = useState<
    Record<string, string>
  >({});

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant/chat",
        body: () => ({ confirmations: pendingConfirmations }),
      }),
    [pendingConfirmations],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onError(err) {
      // useChat eksponerer ikke response.body fra fejlede requests. Vi
      // henter det manuelt så vi kan vise fejlbesked til kunden.
      tryShowErrorBody(err).then((msg) => setErrorMessage(msg));
    },
  });

  function chatRequestOptions(
    confirmations: Record<string, string> = pendingConfirmations,
  ) {
    return { body: { confirmations } };
  }

  function handleConfirmPlan(tool: string, _args: unknown, token: string) {
    setErrorMessage(null);
    const next = { ...pendingConfirmations, [tool]: token };
    setPendingConfirmations(next);
    // Naturlig besked så chat-tråden ikke afslører JSON-args eller token.
    // System-prompten forklarer at "Yes, continue" = retry-sidste-tool.
    sendMessage({ text: "Yes, continue." }, chatRequestOptions(next));
  }

  // Hvis hooket har en error men onError ikke har kørt endnu (race)
  useEffect(() => {
    if (error && !errorMessage) {
      tryShowErrorBody(error).then((msg) => setErrorMessage(msg));
    }
  }, [error, errorMessage]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll til bund når der kommer ny besked
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, status]);

  // Phase B4 follow-up: when `brand.features.popoverApi` is on AND the
  // browser supports native `<dialog>`, render the panel as a `<dialog>`
  // so the browser handles focus trap, Escape, and the ::backdrop
  // surface. Otherwise fall back to the original React-state + manual
  // Escape listener path.
  const popoverApi = useFeature("popoverApi");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [useNative, setUseNative] = useState(false);
  useEffect(() => {
    if (popoverApi && supportsDialog()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard: supportsDialog() is browser-only; starts false for SSR parity then flips to native <dialog> after mount.
      setUseNative(true);
    }
  }, [popoverApi]);

  // Sync React `open` prop with the native dialog element.
  useEffect(() => {
    if (!useNative) return;
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open, useNative]);

  // Fallback Escape handler — only needed in the React-state path; the
  // native <dialog> handles Escape internally.
  useEffect(() => {
    if (useNative || !open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, useNative]);

  // Native <dialog> always renders (so the ref is stable across open/close);
  // React-state fallback only renders when open. Combined gate handles both.
  if (!open && !useNative) return null;

  const busy = status === "submitted" || status === "streaming";

  const body = (
    <aside className="relative flex h-full w-full max-w-md flex-col bg-[#050A19] shadow-2xl border-l border-[#d4af37]/20">
        <header className="bg-[#050A19]/80 backdrop-blur-md relative flex items-center justify-between rounded-none border-b border-[#d4af37]/20 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d4af37]/80">
              {ui.eyebrow}
            </p>
            <h2 className="mt-0.5 text-lg font-black text-white">
              {ui.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui.close}
            className="rounded-full p-1 text-[#d4af37]/70 transition hover:bg-[#d4af37]/10 hover:text-[#d4af37]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 scrollbar-thin scrollbar-thumb-sol-ink/20 scrollbar-track-transparent"
        >
          {messages.length === 0 && <WelcomeBubble ecommerceEnabled={ecommerceEnabled} en={en} />}

          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onConfirmPlan={handleConfirmPlan}
            />
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs font-bold text-sol-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sol-accent" />
              {ui.thinking}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-black">{ui.errorTitle}</p>
              <p className="mt-1 leading-6">{errorMessage}</p>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || busy) return;
            setErrorMessage(null);
            sendMessage({ text: input }, chatRequestOptions());
            setInput("");
          }}
          className="border-t border-[#d4af37]/20 bg-[#050A19]/90 backdrop-blur-md p-4"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ui.placeholder}
              className="flex-1 rounded-xl border border-[#d4af37]/20 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-[#d4af37]/50 focus:bg-white/10 transition-all placeholder:text-white/30"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#f3e5ab] px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-50 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
            >
              {ui.send}
            </button>
          </div>
          <p className="mt-3 text-[10px] text-white/40 text-center">
            {ui.footer}
          </p>
        </form>
      </aside>
  );

  if (useNative) {
    return (
      <dialog
        ref={dialogRef}
        aria-label={ui.dialogAria}
        onClose={onClose}
        onClick={(e) => {
          // Native <dialog> backdrop click: e.target equals the dialog
          // element itself when the user clicked the ::backdrop pseudo.
          if (e.target === dialogRef.current) onClose();
        }}
        className="ml-auto mr-0 h-full max-h-none w-full max-w-md bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-md"
      >
        {body}
      </dialog>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-label={ui.dialogAria}
    >
      <button
        type="button"
        aria-label="Close chat"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />
      {body}
    </div>
  );
}

function WelcomeBubble({
  ecommerceEnabled = true,
  en = false,
}: {
  ecommerceEnabled?: boolean;
  en?: boolean;
}) {
  if (!ecommerceEnabled) {
    const greeting = en ? "Hi 👋" : "Hej 👋";
    const body = en
      ? `I am the AI consultant for ${brand.storeName}. Tell me about your project, budget or specific requirements, and I can advise you on the best solution.`
      : `Jeg er AI Konsulent for ${brand.storeName}. Fortæl mig om dit projekt, budget eller specifikke krav, så kan jeg rådgive dig om den bedste løsning.`;
    const chips = en
      ? ["Webshop solutions", "Website (The Golden Stack)", "AI integrations"]
      : ["Webshop løsninger", "Website (The Golden Stack)", "AI Integrationer"];
    return (
      <div className="rounded-2xl border border-sol-ink/10 bg-[#050A19] px-4 py-3 text-sm text-white">
        <p className="font-black text-[#d4af37]">{greeting}</p>
        <p className="mt-1 leading-6 text-white/80">{body}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((p) => (
            <span
              key={p}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const greeting = en ? "Hi." : "Hej.";
  const body = en
    ? `I am ${brand.ai.assistantLabel} for ${brand.storeName}. Tell me what you are looking for, such as your use case, budget, or preferences, and I will find options that fit.`
    : `Jeg er ${brand.ai.assistantLabel} for ${brand.storeName}. Fortæl mig hvad du leder efter — fx anvendelse, budget eller præferencer — så finder jeg muligheder der passer.`;
  const chips = en
    ? ["Best everyday products under 500 DKK", "Gift ideas", "Lightweight options"]
    : ["Bedste hverdagsprodukter under 500 kr", "Gaveidéer", "Lette muligheder"];
  return (
    <div className="rounded-2xl border border-sol-ink/10 dark:border-white/10 bg-white dark:bg-sol-sand px-4 py-3 text-sm text-sol-ink">
      <p className="font-black">{greeting}</p>
      <p className="mt-1 leading-6">{body}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((p) => (
          <span
            key={p}
            className="rounded-full bg-sol-sand px-3 py-1 text-xs font-bold text-sol-ink"
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onConfirmPlan,
}: {
  message: UIMessage;
  onConfirmPlan: (tool: string, args: unknown, token: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "bg-gradient-to-br from-[#d4af37] to-[#f3e5ab] text-black font-medium"
            : "border border-[#d4af37]/20 bg-white/5 text-white"
        }`}
      >
        {message.parts.map((part, idx) => {
          if (part.type === "text") {
            return (
              <p key={idx} className="whitespace-pre-wrap">
                {part.text}
              </p>
            );
          }
          if (part.type.startsWith("tool-")) {
            // AI SDK 6: tool-{toolname} parts indeholder state + input + output.
            // Discriminated union dækker mange varianter af tool-state — vi
            // bruger en bred cast og lader ToolResultRenderer håndtere
            // missing-fields runtime-sikkert.
            return (
              <ToolResultRenderer
                key={idx}
                part={part as unknown as ToolPart}
                onConfirmPlan={onConfirmPlan}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

type ToolPart = UIMessage["parts"][number] & {
  type: `tool-${string}`;
  state?: string;
  input?: unknown;
  output?: unknown;
};

function ToolResultRenderer({
  part,
  onConfirmPlan,
}: {
  part: ToolPart;
  onConfirmPlan: (tool: string, args: unknown, token: string) => void;
}) {
  // AI SDK part-type er "tool-<api-name>" hvor api-name har "_" i stedet for ".".
  // Konvertér tilbage til registry-format så case-statements er læselige.
  const toolName = part.type.replace(/^tool-/, "").replace(/_/, ".");
  const output = part.output;

  // Loading-tilstand
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <p className="text-xs font-mono text-sol-muted">
        calling {toolName}...
      </p>
    );
  }

  // Plan-først: orders.create returnerer {requiresConfirmation, token, preview}
  // før den faktisk udfører. Rendrer PlanCard så kunden kan klikke Bekræft.
  if (
    output &&
    typeof output === "object" &&
    "requiresConfirmation" in output &&
    (output as { requiresConfirmation: boolean }).requiresConfirmation
  ) {
    const conf = output as unknown as {
      tool: string;
      args: unknown;
      preview: string;
      confirmationToken: string;
    };
    return (
      <PlanCard
        tool={conf.tool}
        args={conf.args}
        preview={conf.preview}
        confirmationToken={conf.confirmationToken}
        onConfirm={onConfirmPlan}
      />
    );
  }

  // Fejl fra executor (returneret som {error: ...})
  if (output && typeof output === "object" && "error" in output) {
    return (
      <p className="text-xs italic text-sol-muted">
        ({(output as { error: string }).error})
      </p>
    );
  }

  // orders.create success → enten Stripe Payment Element (rigtig betaling)
  // eller OrderSuccessInline (mock-payment / ordre allerede paid).
  if (
    toolName === "orders.create" &&
    output &&
    typeof output === "object" &&
    "ok" in output &&
    (output as { ok: boolean }).ok
  ) {
    const order = output as unknown as {
      orderId: string;
      totalDkk: number;
      paymentMode?: "stripe" | "mock";
      paymentIntentClientSecret?: string;
      publishableKey?: string;
    };
    if (
      order.paymentMode === "stripe" &&
      order.paymentIntentClientSecret &&
      order.publishableKey
    ) {
      return (
        <StripePaymentPanel
          clientSecret={order.paymentIntentClientSecret}
          publishableKey={order.publishableKey}
          totalDkk={order.totalDkk}
          orderId={order.orderId}
        />
      );
    }
    // mock-mode eller paymentMode missing (legacy) → success card direkt
    return <OrderSuccessInline orderId={order.orderId} totalDkk={order.totalDkk} />;
  }

  // customer.lookup_by_email → mini-info-card hvis returnerende
  if (
    toolName === "customer.lookup_by_email" &&
    output &&
    typeof output === "object" &&
    "hasOrders" in output
  ) {
    const lookup = output as unknown as {
      hasOrders: boolean;
      lastShipping?: { name: string; address: string; zip: string; city: string } | null;
      orderCount: number;
    };
    if (lookup.hasOrders && lookup.lastShipping) {
      return (
        <div className="rounded-lg border border-sol-accent/30 bg-sol-accent/5 px-3 py-2 text-xs text-sol-ink">
          <p className="font-bold">✓ Velkommen tilbage!</p>
          <p className="mt-1 leading-5 text-sol-muted">
            Seneste leveringsadresse: {lookup.lastShipping.name},{" "}
            {lookup.lastShipping.address}, {lookup.lastShipping.zip}{" "}
            {lookup.lastShipping.city}
          </p>
        </div>
      );
    }
    return null; // ny kunde — AI håndterer flow, ingen UI nødvendig
  }

  // products.search → produktkort
  if (toolName === "products.search" && Array.isArray(output)) {
    return <ProductGridInline products={output as InlineProduct[]} />;
  }

  // cart.get_summary → kurv-oversigt
  if (toolName === "cart.get_summary" && output && typeof output === "object") {
    return <CartSummaryInline summary={output as CartSummary} />;
  }

  // cart.add → bekræftelse
  if (toolName === "cart.add" && output && typeof output === "object" && "added" in output) {
    const added = (output as { added: { name: string; quantity: number } }).added;
    return (
      <p className="rounded-lg bg-sol-sand px-3 py-2 text-xs font-bold text-sol-ink">
        ✓ Lagt i kurven: {added.name} (×{added.quantity}){" "}
        <Link href="/cart" className="underline">
          view cart
        </Link>
      </p>
    );
  }

  return null; // andre tool-results vises ikke direkte
}

function OrderSuccessInline({ orderId, totalDkk }: { orderId: string; totalDkk: number }) {
  return (
    <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-green-700">
        ✓ Order created
      </p>
      <p className="mt-1 text-sm font-bold text-green-900">
        Thanks. Your order is on its way.
      </p>
      <p className="mt-2 text-xs text-green-800">
        Total: <strong>{formatPriceDkk(totalDkk)}</strong>
      </p>
      <p className="mt-1 text-xs text-green-800">
        Order ID: <code className="font-mono">{orderId}</code>
      </p>
      <p className="mt-2 text-xs text-green-700">
        You will receive a confirmation email shortly.
      </p>
      <Link
        href={`/order/${orderId}`}
        className="mt-3 inline-block rounded-full bg-green-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-green-700"
      >
        View order
      </Link>
    </div>
  );
}

type InlineProduct = {
  slug: string;
  name: string;
  brand: string;
  priceDkk: number;
  stock: number;
  firstImage: string | null;
};

function ProductGridInline({ products }: { products: InlineProduct[] }) {
  if (products.length === 0) {
    return (
      <p className="text-xs italic text-sol-muted">
        No products matched. Try a broader search.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {products.slice(0, 6).map((p) => (
        <Link
          key={p.slug}
          href={`/product/${p.slug}`}
          className="group block overflow-hidden rounded-xl border border-sol-ink/10 bg-sol-sand transition hover:shadow"
        >
          <div className="relative aspect-square bg-sol-cream">
            {p.firstImage && (
              <Image
                src={p.firstImage}
                alt={p.name}
                fill
                sizes="(max-width:640px) 50vw, 200px"
                className="object-contain p-2 transition group-hover:scale-105"
              />
            )}
          </div>
          <div className="p-2">
            <p className="text-[10px] uppercase tracking-wide text-sol-muted">
              {p.brand}
            </p>
            <p className="text-xs font-black leading-tight text-sol-ink">
              {p.name}
            </p>
            <p className="mt-0.5 text-xs font-black text-sol-accent">
              {formatPriceDkk(p.priceDkk)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

type CartSummary = {
  empty?: boolean;
  items?: { slug: string; name: string; quantity: number; lineTotalDkk: number }[];
  subtotalDkk?: number;
  shippingDkk?: number;
  totalDkk?: number;
};

/**
 * useChat surface'er ikke response-body for failed requests. Vi opfanger
 * Error-objektet og prøver at parse JSON-body med vores fejlbesked.
 * Falls back til generisk besked hvis intet kan hentes.
 */
async function tryShowErrorBody(err: unknown): Promise<string> {
  // AI SDK pakker fejlen i en property 'cause' eller 'response' afhængigt
  // af version. Vi prøver de mest sandsynlige stier.
  const e = err as { message?: string; cause?: { response?: Response }; response?: Response };
  const resp = e.cause?.response ?? e.response;
  if (resp) {
    try {
      const body = (await resp.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      // ignore
    }
  }
  return (
    e.message ??
    "Something went wrong. Try again in a moment, or refresh the page."
  );
}

function CartSummaryInline({ summary }: { summary: CartSummary }) {
  if (summary.empty) {
    return <p className="text-xs italic text-sol-muted">Your cart is empty.</p>;
  }
  return (
    <div className="space-y-2 rounded-lg bg-sol-sand p-3 text-xs">
      <p className="text-[10px] font-black uppercase tracking-wider text-sol-muted">
        Your cart
      </p>
      {summary.items?.map((it) => (
        <div key={it.slug} className="flex justify-between gap-3">
          <span className="text-sol-ink">
            {it.quantity}× {it.name}
          </span>
          <span className="font-bold text-sol-ink">
            {formatPriceDkk(it.lineTotalDkk)}
          </span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-sol-ink/15 pt-2 font-black text-sol-accent">
        <span>Total</span>
        <span>{formatPriceDkk(summary.totalDkk ?? 0)}</span>
      </div>
      <Link
        href="/checkout"
        className="block rounded-full bg-sol-accent py-1.5 text-center font-black uppercase tracking-wider text-white"
      >
        Go to checkout
      </Link>
    </div>
  );
}
