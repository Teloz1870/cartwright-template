"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useEditMode } from "./EditModeProvider";
import type { EditTarget } from "@/lib/annotate/types";

/**
 * In-place AI editing overlay (admin-only, flag-gated). Når edit-mode er slået
 * til: alle `[data-cw-edit]`-elementer fremhæves (CSS), et klik åbner et lille
 * note-panel forankret til elementet, AI'en foreslår ny copy, og admin ser en
 * før→efter-diff inden bekræft. Sikkerheden ligger server-side (/api/admin/annotate
 * + confirmation-tokens + audit) — dette er ren UI.
 *
 * Positionering sker via getBoundingClientRect() (afhængighedsfri, virker overalt)
 * frem for CSS anchor positioning, som endnu ikke er Baseline. Escape + klik-
 * udenfor lukker; fokus flyttes ind i note-feltet og tilbage til elementet ved
 * luk; prefers-reduced-motion respekteres.
 */

type Phase = "idle" | "noting" | "proposing" | "review" | "applying";

type Selection = { el: HTMLElement; target: EditTarget };

type Proposal = {
  before: string;
  after: string;
  tool: string;
  proposedArgs: Record<string, unknown>;
  confirmationToken: string;
};

const PANEL_W = 340;

function parseTargetAttr(raw: string | null): EditTarget | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object" && typeof (o as { kind?: unknown }).kind === "string") {
      return o as EditTarget;
    }
  } catch {
    /* ignore malformed attribute */
  }
  return null;
}

/** Felter hvor det renderede tekstindhold == den gemte værdi (kort, enkelt-linje).
 *  For body/description er det markdown → spring optimistisk swap over, lad
 *  router.refresh() re-rendre fra serveren. */
function isShortField(t: EditTarget): boolean {
  switch (t.kind) {
    case "genome":
    case "setting":
      return true;
    case "page":
      return t.field === "title";
    case "product":
    case "category":
      return t.field === "name";
  }
}

function targetHeading(t: EditTarget): string {
  switch (t.kind) {
    case "genome":
      return "Rediger tekst";
    case "setting":
      return t.field === "websiteHeadline" ? "Rediger hero-overskrift" : "Rediger hero-underlinje";
    case "page":
      return t.field === "title" ? "Rediger sidetitel" : "Rediger sidetekst";
    case "product":
      return t.field === "name" ? "Rediger produktnavn" : "Rediger produktbeskrivelse";
    case "category":
      return t.field === "name" ? "Rediger kategorinavn" : "Rediger kategoribeskrivelse";
  }
}

export default function EditModeOverlay() {
  const { enabled, editMode, setEditMode } = useEditMode();
  const router = useRouter();

  const [sel, setSel] = useState<Selection | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const close = useCallback(() => {
    setSel((cur) => {
      cur?.el?.focus?.();
      return null;
    });
    setPhase("idle");
    setNote("");
    setProposal(null);
    setError(null);
  }, []);

  const openFor = useCallback((el: HTMLElement) => {
    const target = parseTargetAttr(el.getAttribute("data-cw-edit"));
    if (!target) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const left = Math.min(Math.max(8, rect.left), vw - PANEL_W - 8);
    // Placér under elementet hvis der er plads, ellers over.
    const below = rect.bottom + 8;
    const top = below + 220 > window.innerHeight ? Math.max(8, rect.top - 8 - 220) : below;
    setSel({ el, target });
    setPos({ top, left });
    setPhase("noting");
    setNote("");
    setProposal(null);
    setError(null);
  }, []);

  // Toggle body-class → CSS-fremhævning af [data-cw-edit].
  useEffect(() => {
    if (editMode) document.body.classList.add("cw-edit-mode");
    else document.body.classList.remove("cw-edit-mode");
    return () => document.body.classList.remove("cw-edit-mode");
  }, [editMode]);

  // Capture-phase klik: fang klik på editbare elementer (forhindrer navigation),
  // og luk panelet ved klik udenfor.
  useEffect(() => {
    if (!editMode) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (panelRef.current && t && panelRef.current.contains(t)) return; // interaktion i panel
      const editEl = t?.closest?.("[data-cw-edit]") as HTMLElement | null;
      if (editEl) {
        e.preventDefault();
        e.stopPropagation();
        openFor(editEl);
        return;
      }
      if (phase !== "idle") close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "idle") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [editMode, phase, openFor, close]);

  // Fokus note-feltet når panelet åbner.
  useEffect(() => {
    if (phase === "noting") textareaRef.current?.focus();
  }, [phase, sel]);

  async function propose() {
    if (!sel || !note.trim()) return;
    setPhase("proposing");
    setError(null);
    try {
      const res = await fetch("/api/admin/annotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phase: "propose", target: sel.target, note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Kunne ikke foreslå en ændring.");
        setPhase("noting");
        return;
      }
      setProposal(data as Proposal);
      setPhase("review");
    } catch {
      setError("Netværksfejl — prøv igen.");
      setPhase("noting");
    }
  }

  function swapInPlace(el: HTMLElement, text: string) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doSwap = () => {
      el.textContent = text;
    };
    const startVT = (
      document as Document & { startViewTransition?: (cb: () => void) => unknown }
    ).startViewTransition;
    if (!reduce && typeof startVT === "function") startVT.call(document, doSwap);
    else doSwap();
  }

  async function apply() {
    if (!sel || !proposal) return;
    setPhase("applying");
    setError(null);
    try {
      const res = await fetch("/api/admin/annotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phase: "apply",
          target: sel.target,
          tool: proposal.tool,
          proposedArgs: proposal.proposedArgs,
          confirmationToken: proposal.confirmationToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Kunne ikke anvende ændringen.");
        setPhase("review");
        return;
      }
      if (isShortField(sel.target) && typeof data?.value === "string") {
        swapInPlace(sel.el, data.value);
      }
      close();
      router.refresh();
    } catch {
      setError("Netværksfejl — prøv igen.");
      setPhase("review");
    }
  }

  if (!enabled) return null;

  const busy = phase === "proposing" || phase === "applying";

  return (
    <>
      {/* Fremhævnings-CSS injiceres kun når featuren er aktiv — globals.css
          (canary-identitet) røres ikke. */}
      <style>{`
        body.cw-edit-mode [data-cw-edit] {
          outline: 2px dashed #6d28d9;
          outline-offset: 2px;
          cursor: text;
          border-radius: 3px;
          transition: outline-color .15s ease, background-color .15s ease;
        }
        body.cw-edit-mode [data-cw-edit]:hover {
          outline-style: solid;
          background: color-mix(in srgb, #6d28d9 10%, transparent);
        }
        @media (prefers-reduced-motion: reduce) {
          body.cw-edit-mode [data-cw-edit] { transition: none; }
        }
      `}</style>

      {/* Toggle — bund-venstre, så den ikke kolliderer med AIStylistButton (bund-højre). */}
      <button
        type="button"
        onClick={() => {
          if (editMode) {
            close(); // luk et evt. åbent panel før edit-mode slås fra
            setEditMode(false);
          } else {
            setEditMode(true);
          }
        }}
        aria-pressed={editMode}
        className={`fixed bottom-6 left-6 z-[55] flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-colors ${
          editMode
            ? "bg-violet-700 text-white hover:bg-violet-800"
            : "bg-white text-neutral-800 ring-1 ring-black/10 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-white/10"
        }`}
      >
        <span aria-hidden>✎</span>
        {editMode ? "Færdig" : "Rediger side"}
      </button>

      {editMode && phase !== "idle" && sel && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={targetHeading(sel.target)}
          style={{ top: pos.top, left: pos.left, width: PANEL_W }}
          className="fixed z-[60] max-w-[calc(100vw-16px)] rounded-xl border border-black/10 bg-white p-3 text-sm text-neutral-900 shadow-2xl dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{targetHeading(sel.target)}</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Luk"
              className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              ✕
            </button>
          </div>

          {(phase === "noting" || phase === "proposing") && (
            <>
              <label className="mb-1 block text-xs text-neutral-500">
                Hvad skal ændres?
              </label>
              <textarea
                ref={textareaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="fx “gør den kortere og mere venlig”"
                disabled={busy}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    propose();
                  }
                }}
                className="w-full resize-none rounded-lg border border-black/10 bg-neutral-50 p-2 text-sm outline-none focus:border-violet-500 dark:border-white/10 dark:bg-neutral-800"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Annullér
                </button>
                <button
                  type="button"
                  onClick={propose}
                  disabled={!note.trim() || busy}
                  className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
                >
                  {phase === "proposing" ? "Foreslår…" : "Foreslå ændring"}
                </button>
              </div>
            </>
          )}

          {(phase === "review" || phase === "applying") && proposal && (
            <>
              <div className="space-y-2">
                <div>
                  <div className="mb-0.5 text-xs text-neutral-500">Før</div>
                  <div className="rounded-lg bg-neutral-100 p-2 text-sm text-neutral-500 line-through decoration-neutral-400 dark:bg-neutral-800">
                    {proposal.before}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">
                    Efter
                  </div>
                  <div className="rounded-lg bg-violet-50 p-2 text-sm text-neutral-900 dark:bg-violet-950/40 dark:text-neutral-100">
                    {proposal.after}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProposal(null);
                    setPhase("noting");
                  }}
                  disabled={busy}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Prøv igen
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy}
                  className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
                >
                  {phase === "applying" ? "Anvender…" : "Anvend"}
                </button>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {sel.target.kind === "setting" && (
            <p className="mt-2 text-[11px] text-neutral-400">
              Redigerer standard-sprogets tekst. Kan tage et øjeblik at slå igennem.
            </p>
          )}
        </div>
      )}
    </>
  );
}
