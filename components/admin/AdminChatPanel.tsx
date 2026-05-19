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
  /** Når true, viser panelet i compact-overlay mode (⌘K-launcher). */
  compact?: boolean;
};

/**
 * Operatør-chat-panel. Lever bag requireAdmin på /admin/ai-siden.
 *
 * Plan-først UX:
 *   AI-svar med 'requiresConfirmation: true' rendres som PlanCard inline i
 *   tråden. Admin klikker Bekræft → sendMessage med samme args + confirm:true
 *   sendes som et nyt user-message ("Bekræfter: tool=products.delete, args=...").
 *   Det udløser en ny stream der eksekverer tool'et og returnerer resultatet.
 *
 * Suggest-mode toggle:
 *   When ON, request body sender suggestMode:true; serveren blokerer write-
 *   tools med 403. AI'en kan stadig søge + foreslå.
 */
export default function AdminChatPanel({ compact = false }: Props) {
  const [input, setInput] = useState("");
  const [suggestMode, setSuggestMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Confirmation tokens, keyed by tool-navn. Når admin klikker bekræft på en
  // plan-card, gemmer vi det server-udstedte token her, og næste request
  // inkluderer det i body. Server consumer'er token og udfører tool'et.
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
    // Send en natural-language besked til AI'en der så kalder
    // products.attach_image (additivt, kræver ikke plan-card)
    sendMessage(
      {
        text: `Brug det billede til produktet — URL: ${candidate.regularUrl} (Unsplash id: ${candidate.id}, foto: ${candidate.photographerName})`,
      },
      chatRequestOptions(),
    );
  }

  function handleConfirmPlan(tool: string, _confirmedArgs: unknown, token: string) {
    setErrorMessage(null);
    // Gem token først så request body er friskt opdateret inden næste request.
    // Server-side validation slår token op i pending-map; AI'en kan IKKE
    // generere et gyldigt token selv (122-bit random UUID + argsHash).
    const confirmations = { ...pendingConfirmations, [tool]: token };
    setPendingConfirmations(confirmations);
    // Sender en kort natural-language besked så chat-tråden ikke afslører
    // tekniske detaljer som JSON-args og confirm:true. AI'en ved fra
    // system-prompten at "Ja" / "Bekræft" betyder retry-sidste-tool.
    sendMessage({ text: "Ja, fortsæt." }, chatRequestOptions(confirmations));
  }

  return (
    <div
      className={`flex flex-col bg-sol-cream ${
        compact ? "h-[600px] w-full max-w-2xl" : "h-[calc(100vh-12rem)] w-full"
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sol-ink/10 bg-white px-5 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sol-muted">
            Operatør-copilot
          </p>
          <h2 className="text-base font-black text-sol-ink">AI-assistent til drift</h2>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-sol-ink">
          <input
            type="checkbox"
            checked={suggestMode}
            onChange={(e) => setSuggestMode(e.target.checked)}
            className="h-4 w-4 rounded border-sol-ink/30 text-sol-accent focus:ring-sol-accent"
          />
          Kun forslag (udfør intet)
          {suggestMode && (
            <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-black uppercase text-yellow-800">
              Sandkasse
            </span>
          )}
        </label>
      </header>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5"
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
            Copilot tænker…
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-black">Fejl.</p>
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
        className="border-t border-sol-ink/10 bg-white p-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              suggestMode
                ? "Foreslå en handling (intet udføres) — fx 'hvad ville være smart at gøre i dag?'"
                : "Hvad skal jeg gøre? — fx 'list 5 seneste ordrer'"
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
    <div className="rounded-2xl border border-sol-ink/10 bg-white px-4 py-3 text-sm text-sol-ink">
      <p className="font-black">Hej 👋</p>
      <p className="mt-1 leading-6">
        Jeg er operatør-copiloten. Jeg kan oprette/opdatere produkter,
        rabatkoder, kampagner, ordrer — og rulle ting tilbage. Destruktive
        handlinger viser en bekræftelses-card før de udføres.
      </p>
      {suggestMode && (
        <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          ⚠️ Suggest-mode er aktiv. Jeg foreslår men udfører intet — slå fra i
          headeren ovenfor for at gå live.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {[
          "Hvor mange ordrer i dag?",
          "Lavt lager — hvilke?",
          "Lav weekend-kampagne -20% Sport",
          "Vis sidste 5 audit-entries",
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
            : "border border-sol-ink/10 bg-white text-sol-ink"
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
  // AI SDK part-type er "tool-<api-name>" hvor api-name har "_" i stedet for ".".
  // Konvertér tilbage til registry-format så case-statements er læselige.
  const toolName = part.type.replace(/^tool-/, "").replace(/_/, ".");
  const output = part.output;

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <p className="text-xs font-mono text-sol-muted">kalder {toolName}…</p>
    );
  }

  // Plan-først: AI returnerede confirmation-anmodning fra server
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
      />
    );
  }

  // Generelle fejl-svar fra executor
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
        {toolName} — vis resultat
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-sol-cream px-2 py-1.5 font-mono text-[10px] text-sol-ink">
        {JSON.stringify(output, null, 2)}
      </pre>
    </details>
  );
}

// Genbruger samme inline-grid som AIStylistPanel (lokal kopi for at undgå
// cross-import af "use client"-komponenter; kan refaktoreres til delt
// component senere hvis vi får brug for det tredje sted).
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
        Ingen produkter matchede.
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
            <p className="text-[10px] text-sol-muted">Lager: {p.stock}</p>
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
  return e.message ?? "Noget gik galt — prøv igen.";
}
