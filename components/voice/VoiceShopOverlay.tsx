"use client";

import { useEffect, useRef, useState } from "react";
import {
  VoiceShopClient,
  type ToolCallFrame,
  type VoiceShopState,
} from "@/lib/voice/client";

/**
 * Voice-plan Fase 1.7: slide-up overlay (mobile) / right-side panel (desktop).
 *
 * Sections (top-to-bottom):
 *   1. Top bar: session timer, voice-state badge, camera-toggle, close
 *   2. Tool-result-cards: produktforslag, kurv-summary, confirmation-card
 *   3. Live transcript (running text-stream fra Gemini)
 *
 * State-machine:
 *   idle → connecting → listening ⇄ thinking → speaking → listening → ended
 *
 * Confirmation-flow:
 *   Når tool-dispatch returnerer `kind: "confirmation_required"`, viser vi
 *   confirmation-card. Voice fortsætter med at lytte; vi sender ikke
 *   tool-response til Gemini før kunden har sagt "ja" (eller klikket "ja"
 *   som backup). v1 bruger keyword-detection på transcripten for "ja"/"nej";
 *   v2 kan udvide til klassifier.
 */

type Capabilities = {
  vision: boolean;
  maxMinutes: number;
  visionEnabled: boolean;
};

type ToolResultCard = {
  id: string;
  toolName: string;
  result: unknown;
};

type PendingConfirmation = {
  toolCallId: string;
  toolName: string;
  registryName: string;
  preview: string;
  confirmationToken: string;
  cleanArgs: unknown;
};

export default function VoiceShopOverlay({
  capabilities,
  onClose,
}: {
  capabilities: Capabilities;
  onClose: () => void;
}) {
  const [state, setState] = useState<VoiceShopState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [cards, setCards] = useState<ToolResultCard[]>([]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(
    capabilities.maxMinutes * 60,
  );
  const [cameraOn, setCameraOn] = useState(false);
  const clientRef = useRef<VoiceShopClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Bootstrap: mint token + start client
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      setState("connecting");
      try {
        const res = await fetch("/api/live/token", { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setErrorMsg(body.error ?? "Kunne ikke starte voice-session.");
          setState("error");
          return;
        }
        const data = (await res.json()) as {
          token: string;
          sessionId: string;
          model: string;
        };
        if (cancelled) return;

        sessionIdRef.current = data.sessionId;
        const client = new VoiceShopClient({
          token: data.token,
          sessionId: data.sessionId,
          model: data.model,
        });
        clientRef.current = client;

        client.on("state", (s) => setState(s));
        client.on("transcript", (text, isFinal) => {
          setTranscript((prev) => (isFinal ? "" : prev + text));
        });
        client.on("error", (err) => {
          setErrorMsg(err.message);
          setState("error");
        });
        client.on("toolCall", (frame) =>
          handleToolCall(frame, client, data.sessionId),
        );

        await client.start();

        timer = setInterval(() => {
          setSecondsRemaining((s) => {
            const next = Math.max(0, s - 1);
            // Auto-close inde i timer-callback (ikke separat effect) — undgår
            // react-hooks/set-state-in-effect violation, samme net-effekt
            if (next === 0 && s > 0) {
              void clientRef.current?.close();
              setState("ended");
            }
            return next;
          });
        }, 1000);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Voice-fejl");
          setState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      const c = clientRef.current;
      if (c) {
        const minutes = c.sessionMinutes;
        void c.close().then(() => {
          if (minutes > 0 && sessionIdRef.current) {
            void fetch("/api/live/session-end", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionId: sessionIdRef.current,
                minutesUsed: minutes,
              }),
            });
          }
        });
      }
    };
  }, []);

  // Yes/no keyword-detection for confirmation flow.
  // Voice-confirmation lytter på den nyligt strømmende transcript: hvis
  // kunden siger noget der starter med "ja"/"yes" eller "nej"/"no", agér.
  useEffect(() => {
    if (!pending) return;
    const lower = transcript.toLowerCase().trim();
    if (/^(ja|jep|yes|jo|gerne)/.test(lower)) {
      void confirmPending(true);
    } else if (/^(nej|nope|no|nehj)/.test(lower)) {
      void confirmPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, pending]);

  async function handleToolCall(
    frame: ToolCallFrame,
    client: VoiceShopClient,
    sessionId: string,
  ): Promise<void> {
    for (const call of frame.functionCalls) {
      try {
        const res = await fetch("/api/live/tool-dispatch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            toolCallId: call.id,
            toolName: call.name,
            args: call.args,
          }),
        });
        const body = (await res.json()) as
          | {
              kind: "result";
              functionResponses: Array<{
                id: string;
                name: string;
                response: unknown;
              }>;
            }
          | {
              kind: "confirmation_required";
              toolCallId: string;
              toolName: string;
              registryName: string;
              preview: string;
              confirmationToken: string;
            }
          | { kind: "error"; error: string };

        if (body.kind === "error") {
          client.sendToolResponse({
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: { error: body.error },
              },
            ],
          });
          continue;
        }

        if (body.kind === "confirmation_required") {
          setPending({
            toolCallId: body.toolCallId,
            toolName: body.toolName,
            registryName: body.registryName,
            preview: body.preview,
            confirmationToken: body.confirmationToken,
            cleanArgs: call.args,
          });
          continue;
        }

        // kind === "result"
        client.sendToolResponse({ functionResponses: body.functionResponses });
        const first = body.functionResponses[0];
        if (first) {
          const r = first.response as { result?: unknown };
          if (r.result !== undefined) {
            setCards((prev) => [
              ...prev,
              { id: first.id, toolName: first.name, result: r.result },
            ]);
          }
        }
      } catch (err) {
        client.sendToolResponse({
          functionResponses: [
            {
              id: call.id,
              name: call.name,
              response: { error: err instanceof Error ? err.message : "Fejl" },
            },
          ],
        });
      }
    }
  }

  async function confirmPending(yes: boolean): Promise<void> {
    if (!pending || !clientRef.current || !sessionIdRef.current) return;
    const client = clientRef.current;
    const p = pending;
    setPending(null);

    if (!yes) {
      client.sendToolResponse({
        functionResponses: [
          {
            id: p.toolCallId,
            name: p.toolName,
            response: { result: { status: "cancelled" } },
          },
        ],
      });
      return;
    }

    const res = await fetch("/api/live/tool-dispatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        toolCallId: p.toolCallId,
        toolName: p.toolName,
        args: p.cleanArgs,
        confirmationToken: p.confirmationToken,
      }),
    });
    const body = (await res.json()) as
      | {
          kind: "result";
          functionResponses: Array<{
            id: string;
            name: string;
            response: unknown;
          }>;
        }
      | { kind: "error"; error: string };
    if (body.kind === "error") {
      client.sendToolResponse({
        functionResponses: [
          { id: p.toolCallId, name: p.toolName, response: { error: body.error } },
        ],
      });
      return;
    }
    client.sendToolResponse({ functionResponses: body.functionResponses });
    const first = body.functionResponses[0];
    if (first) {
      const r = first.response as { result?: unknown };
      if (r.result !== undefined) {
        setCards((prev) => [
          ...prev,
          { id: first.id, toolName: first.name, result: r.result },
        ]);
      }
    }
  }

  async function toggleCamera(): Promise<void> {
    if (!clientRef.current) return;
    if (cameraOn) {
      clientRef.current.stopVideo();
      setCameraOn(false);
    } else {
      await clientRef.current.startVideo();
      setCameraOn(true);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice shop"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-stretch md:justify-end"
    >
      <div className="flex h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl md:h-full md:max-w-md md:rounded-l-2xl md:rounded-t-none">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-sol-ink/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <StateBadge state={state} />
            <span className="font-mono text-xs text-sol-muted">
              {formatTime(secondsRemaining)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {capabilities.visionEnabled && (
              <button
                type="button"
                onClick={toggleCamera}
                aria-pressed={cameraOn}
                className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  cameraOn
                    ? "bg-sol-accent text-white border-sol-accent"
                    : "border-sol-ink/15 text-sol-ink"
                }`}
              >
                {cameraOn ? "Kamera til" : "Kamera fra"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Luk voice shop"
              className="rounded-full p-2 hover:bg-sol-cream"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {state === "connecting" && (
            <p className="text-center text-sm text-sol-muted">
              Forbinder til voice-service…
            </p>
          )}

          {errorMsg && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {errorMsg}
            </div>
          )}

          {pending && (
            <div className="mb-3 rounded-xl border-2 border-sol-accent bg-sol-accent/5 p-4">
              <div className="mb-2 text-xs font-black uppercase tracking-wider text-sol-accent">
                Bekræftelse
              </div>
              <p className="text-sm text-sol-ink">{pending.preview}</p>
              <p className="mt-2 text-xs text-sol-muted">
                Sig &ldquo;ja&rdquo; for at bekræfte, eller &ldquo;nej&rdquo; for
                at annullere.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void confirmPending(true)}
                  className="flex-1 rounded-full bg-sol-accent px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white"
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => void confirmPending(false)}
                  className="flex-1 rounded-full border border-sol-ink/15 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-sol-ink"
                >
                  Nej
                </button>
              </div>
            </div>
          )}

          {cards.length > 0 && (
            <ul className="mb-3 space-y-2">
              {cards.map((card) => (
                <li
                  key={card.id}
                  className="rounded-xl border border-sol-ink/10 bg-sol-cream/40 p-3"
                >
                  <div className="text-[10px] font-black uppercase tracking-widest text-sol-muted">
                    {card.toolName}
                  </div>
                  <ToolResultBody result={card.result} />
                </li>
              ))}
            </ul>
          )}

          {transcript && (
            <div className="rounded-xl bg-sol-cream/40 p-3 text-sm text-sol-ink">
              {transcript}
            </div>
          )}

          {state === "ended" && (
            <div className="mt-4 text-center">
              <p className="text-sm text-sol-muted">Session afsluttet.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 rounded-full border border-sol-ink/15 px-4 py-2 text-xs font-black uppercase tracking-wider"
              >
                Luk
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: VoiceShopState }) {
  const variants: Record<
    VoiceShopState,
    { label: string; className: string }
  > = {
    idle: { label: "Idle", className: "bg-sol-cream text-sol-muted" },
    connecting: {
      label: "Forbinder…",
      className: "bg-amber-100 text-amber-900",
    },
    listening: { label: "Lytter", className: "bg-green-100 text-green-900" },
    thinking: { label: "Tænker", className: "bg-blue-100 text-blue-900" },
    speaking: { label: "Taler", className: "bg-sol-accent text-white" },
    ended: { label: "Slut", className: "bg-sol-cream text-sol-muted" },
    error: { label: "Fejl", className: "bg-red-100 text-red-900" },
  };
  const v = variants[state];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${v.className}`}
    >
      {v.label}
    </span>
  );
}

function ToolResultBody({ result }: { result: unknown }) {
  if (Array.isArray(result)) {
    return (
      <ul className="mt-1 space-y-1 text-xs text-sol-ink">
        {result.slice(0, 5).map((item, i) => (
          <li key={i} className="truncate">
            {summarize(item)}
          </li>
        ))}
        {result.length > 5 && (
          <li className="text-sol-muted">+ {result.length - 5} mere</li>
        )}
      </ul>
    );
  }
  if (result && typeof result === "object") {
    return (
      <p className="mt-1 text-xs text-sol-ink">{summarize(result)}</p>
    );
  }
  return <p className="mt-1 text-xs text-sol-ink">{String(result)}</p>;
}

function summarize(value: unknown): string {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.name === "string") return v.name;
    if (typeof v.title === "string") return v.title;
    if (typeof v.message === "string") return v.message;
    return JSON.stringify(value).slice(0, 80);
  }
  return String(value).slice(0, 80);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
