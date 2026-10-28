"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { formatPriceDkk } from "@/lib/format";
import PlanCard from "@/components/admin/PlanCard";
import OrderTableInline from "@/components/admin/OrderTableInline";
import AuditTimelineInline from "@/components/admin/AuditTimelineInline";
import ImageCandidatesInline from "@/components/admin/ImageCandidatesInline";

type Props = {
  /** When true, renders the panel in compact overlay mode (⌘K launcher). */
  compact?: boolean;
};

/**
 * Operator chat panel. Lives behind requireAdmin on the /admin/ai page.
 *
 * Plan-first UX:
 *   AI replies carrying 'requiresConfirmation: true' render as a PlanCard inline
 *   in the thread. The admin clicks Confirm → sendMessage with the same args +
 *   confirm:true is sent as a new user message ("Confirming: tool=products.delete, args=...").
 *   That kicks off a new stream which executes the tool and returns the result.
 *
 * Suggest-mode toggle:
 *   When ON, the request body sends suggestMode:true; the server blocks write
 *   tools with a 403. The AI can still search + suggest.
 */
export default function AdminChatPanel({ compact = false }: Props) {
  const [input, setInput] = useState("");
  const [suggestMode, setSuggestMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Confirmation tokens, keyed by tool name. When the admin clicks confirm on a
  // plan card, we store the server-issued token here, and the next request
  // includes it in the body. The server consumes the token and runs the tool.
  const [pendingConfirmations, setPendingConfirmations] = useState<
    Record<string, string>
  >({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/admin/chat",
        body: () => ({
          suggestMode,
          confirmations: pendingConfirmations,
        }),
      }),
    [pendingConfirmations, suggestMode],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onError(err) {
      tryShowErrorBody(err).then((msg) => setErrorMessage(msg));
    },
  });

  useEffect(() => {
    if (error && !errorMessage) {
      tryShowErrorBody(error).then((msg) => setErrorMessage(msg));
    }
  }, [error, errorMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  function chatRequestOptions(
    confirmations: Record<string, string> = pendingConfirmations,
  ) {
    return { body: { suggestMode, confirmations } };
  }

  function handleImageSelected(candidate: {
    id: string;
    regularUrl: string;
    photographerName: string;
  }) {
    setErrorMessage(null);
    // Send a natural-language message to the AI, which then calls
    // products.attach_image (additive, does not require a plan card)
    sendMessage(
      {
        text: `Use this image for the product: ${candidate.regularUrl} (Unsplash id: ${candidate.id}, photo: ${candidate.photographerName})`,
      },
      chatRequestOptions(),
    );
  }

  function handleConfirmPlan(tool: string, _confirmedArgs: unknown, token: string) {
    setErrorMessage(null);
    // Store the token first so the request body is freshly updated before the
    // next request. Server-side validation looks the token up in the pending map;
    // the AI CANNOT generate a valid token itself (122-bit random UUID + argsHash).
    const confirmations = { ...pendingConfirmations, [tool]: token };
    setPendingConfirmations(confirmations);
    // Sends a short natural-language message so the chat thread does not reveal
    // technical details such as JSON args and confirm:true. The AI knows from
    // system-prompten at "Yes" / "Confirm" betyder retry-sidste-tool.
    sendMessage({ text: "Yes, continue." }, chatRequestOptions(confirmations));
  }

  return (
    <div
      className={`flex flex-col bg-sol-cream ${
        compact ? "h-[600px] w-full max-w-2xl" : "h-[calc(100vh-12rem)] w-full"
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sol-ink/10 bg-sol-cream px-5 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sol-muted">
            Operator copilot
          </p>
          <h2 className="text-base font-black text-sol-ink">AI operations assistant</h2>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-sol-ink">
          <input
            type="checkbox"
            checked={suggestMode}
            onChange={(e) => setSuggestMode(e.target.checked)}
            className="h-4 w-4 rounded border-sol-ink/30 text-sol-accent focus:ring-sol-accent"
          />
          Suggest only (do not run anything)
          {suggestMode && (
            <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-black uppercase text-yellow-800">
              Sandbox
            </span>
          )}
        </label>
      </header>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 scrollbar-thin scrollbar-thumb-sol-ink/20 scrollbar-track-transparent"
      >
        {messages.length === 0 && <WelcomeBubble suggestMode={suggestMode} />}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onConfirmPlan={handleConfirmPlan}
            onImageSelected={handleImageSelected}
            suggestModeActive={suggestMode}
          />
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs font-bold text-sol-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sol-accent" />
            Copilot is thinking...
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-black">Error.</p>
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
        className="border-t border-sol-ink/10 bg-sol-cream p-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              suggestMode
                ? "Suggest an action (nothing will run), e.g. 'what should we do today?'"
                : "What should I do? e.g. 'list the 5 latest orders'"
            }
            className="flex-1 rounded-full border border-sol-ink/15 bg-sol-cream px-4 py-2 text-sm text-sol-ink outline-none focus:border-sol-accent"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-full bg-sol-accent px-5 py-2 text-sm font-black text-white transition hover:bg-sol-accent/90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function WelcomeBubble({ suggestMode }: { suggestMode: boolean }) {
  return (
    <div className="rounded-2xl border border-sol-ink/10 bg-sol-sand px-4 py-3 text-sm text-sol-ink">
      <p className="font-black">Hi.</p>
      <p className="mt-1 leading-6">
        I am the operator copilot. I can create and update products, discount
        codes, campaigns, and orders, and roll changes back. Destructive
        actions show a confirmation card before they run.
      </p>
      {suggestMode && (
        <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          Suggest mode is active. I will suggest actions but run nothing. Turn
          it off in the header above to go live.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {[
          "How many orders today?",
          "Low stock: which products?",
          "Create a weekend campaign: 20% off",
          "Show the latest 5 audit entries",
        ].map((p) => (
          <span
            key={p}
            className="rounded-full bg-sol-sand px-3 py-1 font-bold text-sol-ink"
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
  onImageSelected,
  suggestModeActive,
}: {
  message: UIMessage;
  onConfirmPlan: (tool: string, args: unknown, token: string) => void;
  onImageSelected: (candidate: {
    id: string;
    regularUrl: string;
    photographerName: string;
  }) => void;
  suggestModeActive: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] space-y-2 rounded-2xl px-4 py-3 text-sm leading-6 ${
          isUser
            ? "bg-sol-accent text-white"
            : "border border-sol-ink/10 bg-sol-sand text-sol-ink"
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
            return (
              <ToolResultRenderer
                key={idx}
                part={part as unknown as ToolPart}
                onConfirmPlan={onConfirmPlan}
                onImageSelected={onImageSelected}
                suggestModeActive={suggestModeActive}
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
  onImageSelected,
  suggestModeActive,
}: {
  part: ToolPart;
  onConfirmPlan: (tool: string, args: unknown, token: string) => void;
  onImageSelected: (candidate: {
    id: string;
    regularUrl: string;
    photographerName: string;
  }) => void;
  suggestModeActive: boolean;
}) {
  // The AI SDK part type is "tool-<api-name>" where api-name has "_" instead of ".".
  // Convert back to registry format so the case statements stay readable.
  const toolName = part.type.replace(/^tool-/, "").replace(/_/, ".");
  const output = part.output;

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <p className="text-xs font-mono text-sol-muted">calling {toolName}...</p>
    );
  }

  // Plan-first: the AI returned a confirmation request from the server
  if (
    output &&
    typeof output === "object" &&
    "requiresConfirmation" in output &&
    (output as { requiresConfirmation?: boolean }).requiresConfirmation
  ) {
    const o = output as unknown as {
      tool: string;
      args: unknown;
      preview: string;
      confirmationToken: string;
    };
    return (
      <PlanCard
        tool={o.tool}
        args={o.args}
        preview={o.preview}
        confirmationToken={o.confirmationToken}
        disabled={suggestModeActive}
        onConfirm={onConfirmPlan}
        // `app/admin/` has no NextIntlClientProvider, so nothing in this tree
        // may call a translation hook. The admin surface is English-only by
        // design (the admin→English sweep), so these are literals on purpose.
        paymentLabels={{
          securePayment: "Secure payment",
          paymentMethodsAria: "Accepted payment methods",
        }}
        // The admin tree is not locale-routed, so the unprefixed route is the
        // correct one here — same reason the labels above are literals.
        returnsHref="/info/returns"
      />
    );
  }

  // General error responses from the executor
  if (output && typeof output === "object" && "error" in output) {
    return (
      <p className="text-xs italic text-sol-muted">
        ({(output as { error: string }).error})
      </p>
    );
  }

  // Tool-specifikke renderers
  if (toolName === "products.search" && Array.isArray(output)) {
    return (
      <ProductGridInline
        products={
          output as Array<{
            slug: string;
            name: string;
            brand: string;
            priceDkk: number;
            stock: number;
            firstImage: string | null;
          }>
        }
      />
    );
  }

  if (toolName === "orders.list" && Array.isArray(output)) {
    return (
      <OrderTableInline
        orders={
          output as Array<{
            id: string;
            email: string;
            shippingName: string;
            status: string;
            totalDkk: number;
            itemCount: number;
            createdAt: string;
          }>
        }
      />
    );
  }

  if (toolName === "audit.list" && Array.isArray(output)) {
    return (
      <AuditTimelineInline
        entries={
          output as Array<{
            id: string;
            actor: string;
            tool: string;
            ok: boolean;
            createdAt: string;
            errorMsg?: string | null;
          }>
        }
      />
    );
  }

  if (toolName === "images.search_unsplash" && Array.isArray(output)) {
    return (
      <ImageCandidatesInline
        candidates={
          output as Array<{
            id: string;
            thumbUrl: string;
            regularUrl: string;
            photographerName: string;
            photographerUrl: string;
          }>
        }
        onSelect={onImageSelected}
        disabled={suggestModeActive}
      />
    );
  }

  // Generisk fallback: kort JSON-preview
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-bold text-sol-muted">
        {toolName} — show result
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-sol-cream px-2 py-1.5 font-mono text-[10px] text-sol-ink scrollbar-thin scrollbar-thumb-sol-ink/20 scrollbar-track-transparent">
        {JSON.stringify(output, null, 2)}
      </pre>
    </details>
  );
}

// Reuses the same inline grid as AIStylistPanel (a local copy to avoid
// cross-importing "use client" components; can be refactored into a shared
// component later if we need it in a third place).
function ProductGridInline({
  products,
}: {
  products: Array<{
    slug: string;
    name: string;
    brand: string;
    priceDkk: number;
    stock: number;
    firstImage: string | null;
  }>;
}) {
  if (products.length === 0) {
    return (
      <p className="text-xs italic text-sol-muted">
        No products matched.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {products.slice(0, 9).map((p) => (
        <Link
          key={p.slug}
          href={`/admin/produkter`}
          className="group block overflow-hidden rounded-xl border border-sol-ink/10 bg-sol-sand transition hover:shadow"
        >
          <div className="relative aspect-square bg-sol-cream">
            {p.firstImage && (
              <Image
                src={p.firstImage}
                alt={p.name}
                fill
                sizes="(max-width:640px) 50vw, 150px"
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
            <p className="text-[10px] text-sol-muted">Stock: {p.stock}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

async function tryShowErrorBody(err: unknown): Promise<string> {
  const e = err as {
    message?: string;
    cause?: { response?: Response };
    response?: Response;
  };
  const resp = e.cause?.response ?? e.response;
  if (resp) {
    try {
      const body = (await resp.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {}
  }
  return e.message ?? "Something went wrong. Try again.";
}
