"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useEditMode } from "./EditModeProvider";
import { isDirectTarget, type EditTarget } from "@/lib/annotate/types";

/**
 * In-place editing overlay (admin-only, flag-gated). Når edit-mode er slået
 * til: alle `[data-cw-edit]`-elementer fremhæves (CSS), et klik åbner et lille
 * panel forankret til elementet. To flows:
 *
 *   COPY-felter (default): admin skriver en note, AI'en foreslår ny copy, og
 *   admin ser en før→efter-diff inden bekræft.
 *
 *   STRUKTUREREDE felter (pris — isDirectTarget): inline input pre-fyldt med
 *   den nuværende værdi + Save. Ingen AI-runde — serveren validerer, minter
 *   et confirmation-token og apply'er ad PRÆCIS samme tool-registry-sti.
 *
 * Sikkerheden ligger server-side (/api/admin/annotate + confirmation-tokens +
 * audit) — dette er ren UI.
 *
 * Præsentation (modern-web-platform first):
 *   - Panelet er en native Popover (`popover="manual"` + showPopover()) → top
 *     layer, ingen z-index-kapløb. Browsere uden Popover API rendrer samme div
 *     som position:fixed med z-index (attributtet ignoreres).
 *   - Positionering: CSS anchor positioning hvor det understøttes (@supports +
 *     CSS.supports-check; browseren tracker elementet og flipper selv ved
 *     viewport-kanter via position-try-fallbacks). JS-fallback = den robuste
 *     getBoundingClientRect()-sti, som virker overalt.
 *   - Al motion er transform/opacity, og hver animation har en
 *     prefers-reduced-motion-gren (statisk slutstilstand / ren fade).
 *   - Glas-fladerne er neutral rgba + én accent-variabel (--cw-ea) — ingen
 *     hardcodede brandfarver, så panelet fungerer på både lyse og mørke shops.
 */

type Phase =
  | "idle"
  | "noting"
  | "proposing"
  | "review"
  | "applying"
  | "direct"
  | "directSaving";

type Selection = {
  el: HTMLElement;
  target: EditTarget;
  /** CSS anchor positioning for DENNE åbning (browser-støtte + bred viewport).
   *  På smalle viewports vinder JS-fallbacket: dets clamp-matematik holder
   *  panelet inden for skærmen, hvor anchor-grid'et kan stikke ud over kanten. */
  anchored: boolean;
};

type Proposal = {
  before: string;
  after: string;
  tool: string;
  proposedArgs: Record<string, unknown>;
  confirmationToken: string;
};

const PANEL_W = 340;
/** Hvor længe ✓-morph + element-puls vises før panelet lukker (ms). */
const SAVED_DWELL_MS = 650;

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
 *  router.refresh() re-rendre fra serveren. product.price er gemt i øre men
 *  rendret formateret (currency-aware <Price>) → aldrig swap; service.price
 *  (freeform priceString) rendres verbatim → swap er ok. */
function isShortField(t: EditTarget): boolean {
  switch (t.kind) {
    case "genome":
    case "setting":
      return true;
    case "page":
      return t.field === "title";
    case "product":
      return t.field === "name";
    case "category":
      return t.field === "name";
    case "service":
      return t.field === "name" || t.field === "price";
  }
}

function targetHeading(t: EditTarget): string {
  switch (t.kind) {
    case "genome":
      return "Edit text";
    case "setting":
      return t.field === "websiteHeadline" ? "Edit hero heading" : "Edit hero sub-line";
    case "page":
      return t.field === "title" ? "Edit page title" : "Edit page body";
    case "product":
      if (t.field === "price") return "Edit product price";
      return t.field === "name" ? "Edit product name" : "Edit product description";
    case "category":
      return t.field === "name" ? "Edit category name" : "Edit category description";
    case "service":
      if (t.field === "price") return "Edit service price";
      return t.field === "name" ? "Edit service name" : "Edit service description";
  }
}

/** Kortvarig accent-puls på det redigerede element efter et succesfuldt save. */
function pulseSaved(el: HTMLElement) {
  el.classList.add("cw-edit-saved-pulse");
  window.setTimeout(() => el.classList.remove("cw-edit-saved-pulse"), 1100);
}

/**
 * Overlayets samlede CSS. Injiceres KUN når featuren er aktiv (admin +
 * annotateEdit) — globals.css (canary-identitet) røres ikke, og flag-off
 * render er byte-identisk. Accent: violet-familien (samme som altid), udtrykt
 * som én RGB-triplet-variabel så alle flader er neutral-rgba + accent.
 */
const OVERLAY_CSS = `
:root {
  --cw-ea: 139 92 246;   /* accent (violet-500) */
  --cw-ea-soft: 167 139 250; /* accent lys (violet-400) */
  --cw-ea-deep: 109 40 217;  /* accent dyb (violet-700) */
}

/* ── Wake-up: shimmer-sweep hen over siden når edit-mode tændes ─────────── */
.cw-edit-sweep {
  position: fixed;
  inset: 0;
  z-index: 54;
  overflow: hidden;
  pointer-events: none;
}
.cw-edit-sweep::before {
  content: "";
  position: absolute;
  top: -12%;
  bottom: -12%;
  left: -45%;
  width: 38%;
  transform: skewX(-14deg) translateX(0);
  background: linear-gradient(
    90deg,
    transparent,
    rgb(var(--cw-ea) / 0.12) 32%,
    rgb(var(--cw-ea-soft) / 0.2) 48%,
    rgb(255 255 255 / 0.16) 52%,
    rgb(var(--cw-ea) / 0.12) 68%,
    transparent
  );
  animation: cw-sweep 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes cw-sweep {
  to { transform: skewX(-14deg) translateX(420%); }
}

/* ── Editable affordance ────────────────────────────────────────────────── */
/* Idle: hvisken-subtil 1px ring så felterne kan opdages uden støj. */
body.cw-edit-mode [data-cw-edit] {
  position: relative;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgb(var(--cw-ea) / 0.28);
  transition: box-shadow 0.2s ease, background-color 0.2s ease;
  animation: cw-wake 0.4s both;
  animation-delay: calc(min(var(--cw-i, 0) * 45ms, 270ms));
}
/* Staggered glow-in: elementerne "vågner" ét ad gangen (~600ms i alt). */
@keyframes cw-wake {
  0% {
    opacity: 0.4;
    box-shadow: 0 0 0 1px rgb(var(--cw-ea) / 0);
  }
  55% {
    opacity: 1;
    box-shadow: 0 0 0 3px rgb(var(--cw-ea) / 0.45), 0 0 26px rgb(var(--cw-ea) / 0.38);
  }
  100% {
    opacity: 1;
    box-shadow: 0 0 0 1px rgb(var(--cw-ea) / 0.28);
  }
}
/* Hover: blød 2px glow-ring + tonet baggrund. */
body.cw-edit-mode [data-cw-edit]:hover {
  box-shadow: 0 0 0 2px rgb(var(--cw-ea) / 0.75), 0 4px 18px rgb(var(--cw-ea) / 0.25);
  background-color: rgb(var(--cw-ea) / 0.08);
}
/* Valgt (panel åbent på elementet): fast ring. */
body.cw-edit-mode [data-cw-edit].cw-edit-active {
  box-shadow: 0 0 0 2px rgb(var(--cw-ea) / 0.85), 0 6px 24px rgb(var(--cw-ea) / 0.3);
  background-color: rgb(var(--cw-ea) / 0.07);
}
/* Flydende "✎ Edit"-chip ved hover — ren CSS. */
body.cw-edit-mode [data-cw-edit]::after {
  /* Alt-tekst-syntaks ("/ ''") holder chippen ude af accessibility-træet, så
     overskrifter ikke annonceres som "… ✎ Edit" af skærmlæsere. */
  content: "✎ Edit" / "";
  position: absolute;
  top: -0.8rem;
  right: -0.3rem;
  z-index: 1;
  padding: 4px 9px;
  border-radius: 999px;
  font: 600 11px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: 0.02em;
  text-transform: none;
  text-decoration: none;
  white-space: nowrap;
  color: #fff;
  background: linear-gradient(135deg, rgb(var(--cw-ea-soft)), rgb(var(--cw-ea-deep)));
  box-shadow: 0 4px 14px rgb(var(--cw-ea) / 0.45);
  opacity: 0;
  transform: translateY(5px) scale(0.92);
  transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}
body.cw-edit-mode [data-cw-edit]:hover::after {
  opacity: 1;
  transform: translateY(0) scale(1);
}
body.cw-edit-mode [data-cw-edit].cw-edit-active::after {
  opacity: 0;
}
/* Save-belønning: én blød accent-puls på det redigerede element. */
body.cw-edit-mode [data-cw-edit].cw-edit-saved-pulse {
  animation: cw-saved-pulse 0.9s ease-out;
}
@keyframes cw-saved-pulse {
  0% { box-shadow: 0 0 0 0 rgb(var(--cw-ea) / 0.55); }
  70% { box-shadow: 0 0 0 14px rgb(var(--cw-ea) / 0); }
  100% { box-shadow: 0 0 0 1px rgb(var(--cw-ea) / 0.28); }
}

/* ── Mode-toggle: flydende glas-pille med gradient-ring ─────────────────── */
.cw-edit-fab {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  left: 20px;
  z-index: 55;
  display: flex;
  align-items: center;
  gap: 8px;
  isolation: isolate;
  overflow: hidden;
  padding: 10px 18px 10px 14px;
  border: 1px solid transparent;
  border-radius: 999px;
  font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: 0.01em;
  cursor: pointer;
  color: rgb(238 238 245);
  background:
    linear-gradient(rgb(26 24 38 / 0.82), rgb(17 16 27 / 0.88)) padding-box,
    linear-gradient(135deg, rgb(255 255 255 / 0.28), rgb(var(--cw-ea) / 0.55) 45%, rgb(255 255 255 / 0.08)) border-box;
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
  backdrop-filter: blur(16px) saturate(1.5);
  box-shadow: 0 10px 32px -10px rgb(0 0 0 / 0.5), 0 2px 10px rgb(var(--cw-ea) / 0.18);
  transition: box-shadow 0.25s ease, transform 0.2s ease;
}
.cw-edit-fab:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 38px -10px rgb(0 0 0 / 0.55), 0 4px 18px rgb(var(--cw-ea) / 0.35);
}
.cw-edit-fab:focus-visible {
  outline: 2px solid rgb(var(--cw-ea-soft));
  outline-offset: 3px;
}
.cw-edit-fab[aria-pressed="true"] {
  color: #fff;
  background:
    linear-gradient(135deg, rgb(var(--cw-ea-soft) / 0.92), rgb(var(--cw-ea-deep) / 0.94)) padding-box,
    linear-gradient(135deg, rgb(255 255 255 / 0.45), rgb(var(--cw-ea) / 0.7)) border-box;
  box-shadow: 0 10px 32px -8px rgb(var(--cw-ea) / 0.55);
}
/* Gentle idle-shimmer hen over pillen ca. hvert 8. sekund. */
.cw-edit-fab::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(110deg, transparent 32%, rgb(255 255 255 / 0.22) 50%, transparent 68%);
  background-size: 260% 100%;
  background-position-x: 135%;
  animation: cw-fab-shimmer 8s ease-in-out infinite;
  pointer-events: none;
}
@keyframes cw-fab-shimmer {
  0% { background-position-x: 135%; }
  14% { background-position-x: -35%; }
  100% { background-position-x: -35%; }
}
.cw-edit-fab-icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  font-size: 11px;
  background: rgb(var(--cw-ea) / 0.28);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.16);
}
.cw-edit-fab[aria-pressed="true"] .cw-edit-fab-icon {
  background: rgb(255 255 255 / 0.2);
}

/* ── Editor-panelet: glas, forankret, spring-entré ──────────────────────── */
.cw-edit-panel {
  position: fixed;
  inset: auto;
  margin: 0;
  width: min(${PANEL_W}px, calc(100vw - 16px));
  padding: 16px;
  border: 1px solid transparent;
  border-radius: 16px;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13.5px;
  color: rgb(238 238 245);
  background:
    linear-gradient(rgb(26 24 38 / 0.86), rgb(16 15 26 / 0.92)) padding-box,
    linear-gradient(150deg, rgb(255 255 255 / 0.25), rgb(var(--cw-ea) / 0.4) 40%, rgb(255 255 255 / 0.06)) border-box;
  -webkit-backdrop-filter: blur(22px) saturate(1.5);
  backdrop-filter: blur(22px) saturate(1.5);
  box-shadow:
    0 24px 64px -16px rgb(0 0 0 / 0.55),
    0 8px 28px -12px rgb(var(--cw-ea) / 0.35);
  z-index: 60; /* fallback for browsere uden Popover API (top layer) */
  animation: cw-pop-in 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes cw-pop-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
}
/* CSS anchor positioning: browseren tracker det klikkede element og flipper
   selv ved viewport-kanter. JS-fallback (inline top/left) bruges ellers. */
@supports (anchor-name: --cw) {
  .cw-edit-panel.cw-anchored {
    position-anchor: --cw-edit-target;
    position-area: block-end span-inline-end;
    position-try-fallbacks: flip-block, flip-inline;
    margin: 10px 0;
  }
}

.cw-edit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.cw-edit-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: #fff;
}
.cw-edit-title::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(var(--cw-ea-soft)), rgb(var(--cw-ea-deep)));
  box-shadow: 0 0 10px rgb(var(--cw-ea) / 0.7);
}
.cw-edit-x {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  color: rgb(160 158 176);
  background: transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.cw-edit-x:hover {
  color: #fff;
  background: rgb(255 255 255 / 0.1);
}
.cw-edit-x:focus-visible {
  outline: 2px solid rgb(var(--cw-ea-soft));
  outline-offset: 1px;
}

.cw-edit-label {
  display: block;
  margin-bottom: 6px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(160 158 176);
}
.cw-edit-input,
.cw-edit-textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 10px;
  font: inherit;
  font-size: 13.5px;
  color: rgb(240 240 248);
  background: rgb(255 255 255 / 0.06);
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}
.cw-edit-textarea {
  resize: none;
}
.cw-edit-input::placeholder,
.cw-edit-textarea::placeholder {
  color: rgb(150 148 168);
}
.cw-edit-input:focus-visible,
.cw-edit-textarea:focus-visible {
  border-color: rgb(var(--cw-ea) / 0.8);
  background: rgb(255 255 255 / 0.08);
  box-shadow:
    0 0 0 3px rgb(var(--cw-ea) / 0.25),
    inset 0 0 14px rgb(var(--cw-ea) / 0.07);
}
.cw-edit-input:disabled,
.cw-edit-textarea:disabled {
  opacity: 0.55;
}
.cw-edit-suffix {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  color: rgb(190 188 205);
  background: rgb(255 255 255 / 0.08);
}

/* AI-thinking: shimmer-sweep på skeleton-linjer (ingen spinner). */
.cw-edit-think {
  margin-top: 10px;
}
.cw-edit-think-line {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(
    100deg,
    rgb(255 255 255 / 0.07) 35%,
    rgb(var(--cw-ea-soft) / 0.45) 50%,
    rgb(255 255 255 / 0.07) 65%
  );
  background-size: 240% 100%;
  animation: cw-shimmer 1.3s linear infinite;
}
.cw-edit-think-line + .cw-edit-think-line {
  margin-top: 7px;
  width: 72%;
}
@keyframes cw-shimmer {
  from { background-position-x: 135%; }
  to { background-position-x: -35%; }
}

/* Før/efter-diff: to stablede bløde kort, glider ind med højde-transition. */
.cw-edit-grow {
  display: grid;
  animation: cw-grow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes cw-grow {
  from {
    grid-template-rows: 0fr;
    opacity: 0;
  }
  to {
    grid-template-rows: 1fr;
    opacity: 1;
  }
}
.cw-edit-grow > div {
  min-height: 0;
  overflow: hidden;
}
.cw-edit-diff {
  padding: 9px 11px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.45;
}
.cw-edit-diff + .cw-edit-diff {
  margin-top: 8px;
}
.cw-edit-diff-tag {
  display: block;
  margin-bottom: 3px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.cw-edit-diff--before {
  color: rgb(165 163 180);
  background: rgb(255 255 255 / 0.05);
  border: 1px solid rgb(255 255 255 / 0.07);
}
/* Strejf KUN selve teksten — line-through på containeren ville male gennem
   "BEFORE"-tagget (text-decoration propagerer til børn). */
.cw-edit-diff--before .cw-edit-diff-text {
  text-decoration: line-through;
  text-decoration-color: rgb(255 255 255 / 0.3);
}
.cw-edit-diff--before .cw-edit-diff-tag {
  color: rgb(150 148 168);
}
.cw-edit-diff--after {
  color: #fff;
  background: linear-gradient(rgb(var(--cw-ea) / 0.18), rgb(var(--cw-ea) / 0.1));
  border: 1px solid rgb(var(--cw-ea) / 0.35);
}
.cw-edit-diff--after .cw-edit-diff-tag {
  color: rgb(var(--cw-ea-soft));
}

/* Knapper: primær = gradient-accent-pille m. glow, sekundær = ghost. */
.cw-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.cw-edit-btn {
  border: 0;
  border-radius: 999px;
  padding: 7px 15px;
  font: 600 12.5px/1.2 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: box-shadow 0.2s ease, background-color 0.15s ease, color 0.15s ease,
    filter 0.2s ease, transform 0.15s ease;
}
.cw-edit-btn:disabled {
  cursor: default;
  opacity: 0.5;
  box-shadow: none;
  filter: saturate(0.75);
}
.cw-edit-btn:focus-visible {
  outline: 2px solid rgb(var(--cw-ea-soft));
  outline-offset: 2px;
}
.cw-edit-btn--ghost {
  color: rgb(190 188 205);
  background: transparent;
}
.cw-edit-btn--ghost:hover:not(:disabled) {
  color: #fff;
  background: rgb(255 255 255 / 0.09);
}
.cw-edit-btn--primary {
  color: #fff;
  background: linear-gradient(135deg, rgb(var(--cw-ea-soft)), rgb(var(--cw-ea)) 55%, rgb(var(--cw-ea-deep)));
  box-shadow: 0 2px 12px rgb(var(--cw-ea) / 0.4);
}
.cw-edit-btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 4px 20px rgb(var(--cw-ea) / 0.6);
}
.cw-edit-btn--primary:active:not(:disabled) {
  transform: scale(0.97);
}
/* Save-morph: knappen viser et ✓ med et lille pop inden panelet lukker.
   Saved-state må ikke ligne disabled — fuld gradient + glow beholdes. */
.cw-edit-btn--primary.cw-edit-btn--saved:disabled {
  opacity: 1;
  filter: none;
  box-shadow: 0 2px 14px rgb(var(--cw-ea) / 0.5);
}
.cw-edit-check {
  display: inline-block;
  animation: cw-check-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes cw-check-pop {
  from { transform: scale(0.4); opacity: 0; }
}

.cw-edit-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgb(252 165 165);
}
.cw-edit-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: rgb(150 148 168);
}

/* ── Reduced motion: statiske slutstilstande / ren fade ─────────────────── */
@media (prefers-reduced-motion: reduce) {
  .cw-edit-sweep {
    display: none;
  }
  body.cw-edit-mode [data-cw-edit] {
    animation: none;
    transition: none;
  }
  body.cw-edit-mode [data-cw-edit]::after {
    transition: none;
  }
  body.cw-edit-mode [data-cw-edit].cw-edit-saved-pulse {
    animation: none;
  }
  .cw-edit-fab,
  .cw-edit-btn {
    transition: none;
  }
  .cw-edit-fab::before {
    animation: none;
  }
  .cw-edit-panel {
    animation: cw-fade-in 0.15s ease both;
  }
  .cw-edit-think-line {
    animation: none;
    background: rgb(255 255 255 / 0.1);
  }
  .cw-edit-grow {
    animation: cw-fade-in 0.15s ease both;
  }
  .cw-edit-check {
    animation: none;
  }
}
@keyframes cw-fade-in {
  from { opacity: 0; }
}
`;

export default function EditModeOverlay() {
  const { enabled, editMode, setEditMode } = useEditMode();
  const router = useRouter();

  const [sel, setSel] = useState<Selection | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Direct-edit (strukturerede felter): input-værdi + valuta-suffix + prefill-state.
  const [directValue, setDirectValue] = useState("");
  const [directCurrency, setDirectCurrency] = useState<string | null>(null);
  const [directLoading, setDirectLoading] = useState(false);
  // Ren præsentation: ✓-morph på Save/Apply-knappen inden panelet lukker.
  const [saved, setSaved] = useState(false);
  // CSS anchor positioning-understøttelse (konstant pr. browser; false ved SSR
  // er harmløst — panelet rendrer først efter klient-interaktion).
  const [supportsAnchor] = useState(
    () => typeof CSS !== "undefined" && !!CSS.supports?.("anchor-name: --cw"),
  );

  const panelRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const directInputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => {
    setSel((cur) => {
      cur?.el?.focus?.();
      return null;
    });
    setPhase("idle");
    setNote("");
    setProposal(null);
    setError(null);
    setDirectValue("");
    setDirectCurrency(null);
    setDirectLoading(false);
    setSaved(false);
  }, []);

  const openFor = useCallback(
    (el: HTMLElement) => {
      const target = parseTargetAttr(el.getAttribute("data-cw-edit"));
      if (!target) return;
      const anchored = supportsAnchor && window.innerWidth >= 480;
      if (!anchored) {
        // JS-fallback: robust manuel positionering via getBoundingClientRect().
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const panelW = Math.min(PANEL_W, vw - 16);
        const left = Math.min(Math.max(8, rect.left), vw - panelW - 8);
        // Placér under elementet hvis der er plads, ellers over.
        const below = rect.bottom + 8;
        const top = below + 220 > window.innerHeight ? Math.max(8, rect.top - 8 - 220) : below;
        setPos({ top, left });
      }
      setSel({ el, target, anchored });
      setNote("");
      setProposal(null);
      setError(null);
      setSaved(false);

      if (isDirectTarget(target)) {
        // Struktureret felt → direct-edit: hent den autoritative nuværende værdi
        // som prefill (DOM-teksten kan være currency-formateret og duer ikke).
        setPhase("direct");
        setDirectValue("");
        setDirectCurrency(null);
        setDirectLoading(true);
        void fetch("/api/admin/annotate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phase: "current", target }),
        })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok) {
              setError(data?.error ?? "Could not load the current value.");
              return;
            }
            setDirectValue(typeof data?.value === "string" ? data.value : "");
            setDirectCurrency(typeof data?.currency === "string" ? data.currency : null);
          })
          .catch(() => setError("Network error — try again."))
          .finally(() => setDirectLoading(false));
        return;
      }

      setPhase("noting");
    },
    [supportsAnchor],
  );

  // Toggle body-class → CSS-fremhævning af [data-cw-edit] + stagger-indeks
  // (--cw-i) til den forskudte wake-up-animation.
  useEffect(() => {
    if (!editMode) {
      document.body.classList.remove("cw-edit-mode");
      return;
    }
    document.body.classList.add("cw-edit-mode");
    const els = document.querySelectorAll<HTMLElement>("[data-cw-edit]");
    els.forEach((el, i) => el.style.setProperty("--cw-i", String(i)));
    return () => {
      document.body.classList.remove("cw-edit-mode");
      els.forEach((el) => el.style.removeProperty("--cw-i"));
    };
  }, [editMode]);

  // Markér det valgte element (fast ring) og — hvor anchor positioning
  // understøttes — gør det til panelets CSS-anker.
  useEffect(() => {
    if (!sel) return;
    const el = sel.el;
    el.classList.add("cw-edit-active");
    if (sel.anchored) el.style.setProperty("anchor-name", "--cw-edit-target");
    return () => {
      el.classList.remove("cw-edit-active");
      el.style.removeProperty("anchor-name");
    };
  }, [sel, supportsAnchor]);

  // Vis panelet som native popover (top layer). Browsere uden Popover API
  // rendrer samme div som position:fixed med z-index — attributtet ignoreres.
  useEffect(() => {
    if (!sel) return;
    const el = panelRef.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (!el.matches(":popover-open")) el.showPopover();
    } catch {
      /* allerede åben eller utilgængelig — fixed-fallback rendrer alligevel */
    }
    return () => {
      try {
        el.hidePopover?.();
      } catch {
        /* allerede lukket/fjernet */
      }
    };
  }, [sel]);

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

  // Fokus note-/input-feltet når panelet åbner (direct: efter prefill er hentet).
  useEffect(() => {
    if (phase === "noting") textareaRef.current?.focus();
    if (phase === "direct" && !directLoading) {
      directInputRef.current?.focus();
      directInputRef.current?.select();
    }
  }, [phase, sel, directLoading]);

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
        setError(data?.error ?? "Could not propose a change.");
        setPhase("noting");
        return;
      }
      setProposal(data as Proposal);
      setPhase("review");
    } catch {
      setError("Network error — try again.");
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

  /** Save-belønning (ren præsentation): ✓-morph på knappen + accent-puls på
   *  elementet, og først derefter luk + router.refresh(). */
  function celebrateThenClose(el: HTMLElement) {
    pulseSaved(el);
    setSaved(true);
    window.setTimeout(() => {
      close();
      router.refresh();
    }, SAVED_DWELL_MS);
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
        setError(data?.error ?? "Could not apply the change.");
        setPhase("review");
        return;
      }
      if (isShortField(sel.target) && typeof data?.value === "string") {
        swapInPlace(sel.el, data.value);
      }
      celebrateThenClose(sel.el);
    } catch {
      setError("Network error — try again.");
      setPhase("review");
    }
  }

  /**
   * Direct-edit save: "direct"-fasen validerer + minter et confirmation-token
   * server-side (ingen LLM), og apply-fasen consumer tokenet + invokeTool —
   * PRÆCIS samme skrive-sti og audit som AI-forslag, bare uden modellen.
   */
  async function saveDirect() {
    if (!sel || !directValue.trim()) return;
    setPhase("directSaving");
    setError(null);
    try {
      const res = await fetch("/api/admin/annotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phase: "direct", target: sel.target, value: directValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not save.");
        setPhase("direct");
        return;
      }
      const applyRes = await fetch("/api/admin/annotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phase: "apply",
          target: sel.target,
          tool: data.tool,
          proposedArgs: data.proposedArgs,
          confirmationToken: data.confirmationToken,
        }),
      });
      const applied = await applyRes.json();
      if (!applyRes.ok) {
        setError(applied?.error ?? "Could not apply the change.");
        setPhase("direct");
        return;
      }
      if (isShortField(sel.target) && typeof applied?.value === "string") {
        swapInPlace(sel.el, applied.value);
      }
      celebrateThenClose(sel.el);
    } catch {
      setError("Network error — try again.");
      setPhase("direct");
    }
  }

  if (!enabled) return null;

  const busy = phase === "proposing" || phase === "applying" || phase === "directSaving" || saved;

  return (
    <>
      {/* Fremhævnings-CSS injiceres kun når featuren er aktiv — globals.css
          (canary-identitet) røres ikke. */}
      <style>{OVERLAY_CSS}</style>

      {/* Wake-up: remountes ved hver toggle-on, så sweepen kører én gang. */}
      {editMode && <div className="cw-edit-sweep" aria-hidden />}

      {/* Toggle — bund-venstre, så den ikke kolliderer med AIStylistButton (bund-højre). */}
      <button
        type="button"
        data-cw-annotate="fab"
        onClick={() => {
          if (editMode) {
            close(); // luk et evt. åbent panel før edit-mode slås fra
            setEditMode(false);
          } else {
            setEditMode(true);
          }
        }}
        aria-pressed={editMode}
        className="cw-edit-fab"
      >
        <span className="cw-edit-fab-icon" aria-hidden>
          ✎
        </span>
        {editMode ? "Done" : "Edit page"}
      </button>

      {editMode && phase !== "idle" && sel && (
        <div
          ref={panelRef}
          popover="manual"
          role="dialog"
          aria-label={targetHeading(sel.target)}
          data-cw-annotate="panel"
          style={sel.anchored ? undefined : { top: pos.top, left: pos.left }}
          className={`cw-edit-panel${sel.anchored ? " cw-anchored" : ""}`}
        >
          <div className="cw-edit-head">
            <h2 className="cw-edit-title">{targetHeading(sel.target)}</h2>
            <button type="button" onClick={close} aria-label="Close" className="cw-edit-x">
              ✕
            </button>
          </div>

          {(phase === "direct" || phase === "directSaving") && (
            <>
              <label className="cw-edit-label">New value</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  ref={directInputRef}
                  type="text"
                  inputMode={sel.target.kind === "product" ? "decimal" : "text"}
                  value={directLoading ? "" : directValue}
                  placeholder={directLoading ? "Loading…" : ""}
                  onChange={(e) => setDirectValue(e.target.value)}
                  disabled={busy || directLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveDirect();
                    }
                  }}
                  className="cw-edit-input"
                />
                {directCurrency && <span className="cw-edit-suffix">{directCurrency}</span>}
              </div>
              <div className="cw-edit-actions">
                <button
                  type="button"
                  onClick={close}
                  className="cw-edit-btn cw-edit-btn--ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveDirect}
                  disabled={!directValue.trim() || busy || directLoading}
                  className={`cw-edit-btn cw-edit-btn--primary${saved ? " cw-edit-btn--saved" : ""}`}
                >
                  {saved ? (
                    <span className="cw-edit-check" aria-hidden>
                      ✓
                    </span>
                  ) : phase === "directSaving" ? (
                    "Saving…"
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </>
          )}

          {(phase === "noting" || phase === "proposing") && (
            <>
              <label className="cw-edit-label">What should change?</label>
              <textarea
                ref={textareaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. “make it shorter and friendlier”"
                disabled={busy}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    propose();
                  }
                }}
                className="cw-edit-textarea"
              />
              {phase === "proposing" && (
                <div className="cw-edit-think" role="status" aria-label="Thinking…">
                  <div className="cw-edit-think-line" />
                  <div className="cw-edit-think-line" />
                </div>
              )}
              <div className="cw-edit-actions">
                <button
                  type="button"
                  onClick={close}
                  className="cw-edit-btn cw-edit-btn--ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={propose}
                  disabled={!note.trim() || busy}
                  className="cw-edit-btn cw-edit-btn--primary"
                >
                  {phase === "proposing" ? "Thinking…" : "Propose change"}
                </button>
              </div>
            </>
          )}

          {(phase === "review" || phase === "applying") && proposal && (
            <>
              <div className="cw-edit-grow">
                <div>
                  <div className="cw-edit-diff cw-edit-diff--before">
                    <span className="cw-edit-diff-tag">Before</span>
                    <span className="cw-edit-diff-text">{proposal.before}</span>
                  </div>
                  <div className="cw-edit-diff cw-edit-diff--after">
                    <span className="cw-edit-diff-tag">After</span>
                    {proposal.after}
                  </div>
                </div>
              </div>
              <div className="cw-edit-actions">
                <button
                  type="button"
                  onClick={() => {
                    setProposal(null);
                    setPhase("noting");
                  }}
                  disabled={busy}
                  className="cw-edit-btn cw-edit-btn--ghost"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy}
                  className={`cw-edit-btn cw-edit-btn--primary${saved ? " cw-edit-btn--saved" : ""}`}
                >
                  {saved ? (
                    <span className="cw-edit-check" aria-hidden>
                      ✓
                    </span>
                  ) : phase === "applying" ? (
                    "Applying…"
                  ) : (
                    "Apply"
                  )}
                </button>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="cw-edit-error">
              {error}
            </p>
          )}

          {sel.target.kind === "setting" && (
            <p className="cw-edit-hint">
              Edits the default-language text. May take a moment to propagate.
            </p>
          )}
        </div>
      )}
    </>
  );
}
