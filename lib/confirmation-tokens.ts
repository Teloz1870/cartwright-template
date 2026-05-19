import "server-only";

import { createHash, randomUUID } from "node:crypto";

/**
 * Server-state-baseret confirmation-token-system for plan-først-flow i chat.
 *
 * **Hvorfor:** vi kan ikke bruge `args.confirm === true` som confirmation-flag,
 * fordi AI'en selv kan sætte det. I stedet: når AI'en kalder et write-tool
 * uden token, gemmer serveren en pending-confirmation med UUID og argsHash.
 * AI'en svarer ikke "her er confirm" — UI'et viser plan-card, og admin
 * klikker → klient POSTer UUID via separat path → server ser at det er
 * "menneske-bevidnet" og lader tool eksekvere.
 *
 * AI'en kan ALDRIG generere et gyldigt UUID selv (it's a 122-bit random
 * value), og selv hvis den brute-forcer det, matcher argsHash ikke.
 */

type PendingConfirmation = {
  tool: string;
  argsHash: string;
  ownerId: string;
  createdAt: number;
};

const TTL_MS = 5 * 60 * 1000; // 5 minutter — admin skal nå at klikke
const MAX_PENDING = 100; // GC-grænse
const MAX_PENDING_PER_OWNER = 5; // anti-spam: én session må max have 5 åbne tokens

const pending = new Map<string, PendingConfirmation>();

function gcExpired(now: number): void {
  if (pending.size < MAX_PENDING) return;
  for (const [token, p] of pending) {
    if (now - p.createdAt > TTL_MS) pending.delete(token);
  }
}

/**
 * Anti-spam: tæl hvor mange åbne tokens en owner har. Forhindrer at AI
 * (eller en ondsindet klient) fylder Map'en med fake-confirmations og
 * dermed DoS'er andre samtidige brugere (Gemini-review-finding #1).
 */
function countOwnerTokens(ownerId: string, now: number): number {
  let n = 0;
  for (const p of pending.values()) {
    if (p.ownerId === ownerId && now - p.createdAt <= TTL_MS) n++;
  }
  return n;
}

/**
 * Beregner en deterministisk hash af tool-navn + args. Bruges til at verificere
 * at klienten ikke har manipuleret args mellem proposal og confirmation.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",")}}`;
}

export function hashArgs(tool: string, args: unknown): string {
  return createHash("sha256")
    .update(`${tool}::${canonicalize(args)}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Registrér en pending confirmation. Returnerer token som AI'en sender
 * tilbage til klienten (som plan-card-data).
 */
export class ConfirmationLimitExceeded extends Error {
  constructor(message = "For mange åbne bekræftelser i samme session — vent på at de udløber (5 min)") {
    super(message);
    this.name = "ConfirmationLimitExceeded";
  }
}

export function createPendingConfirmation(args: {
  tool: string;
  toolArgs: unknown;
  ownerId: string;
}): string {
  const now = Date.now();
  gcExpired(now);

  // Anti-spam: per-owner-loft før vi spawner endnu et token
  if (countOwnerTokens(args.ownerId, now) >= MAX_PENDING_PER_OWNER) {
    throw new ConfirmationLimitExceeded();
  }

  const token = randomUUID();
  pending.set(token, {
    tool: args.tool,
    argsHash: hashArgs(args.tool, args.toolArgs),
    ownerId: args.ownerId,
    createdAt: now,
  });
  return token;
}

/**
 * Verificér og consume et confirmation-token. Returnerer null hvis token er
 * ugyldigt, udløbet, eller hash ikke matcher (= args er ændret efter
 * proposal). Tokens er one-time-use — slettes ved consume.
 */
export function consumeConfirmation(args: {
  token: string;
  tool: string;
  toolArgs: unknown;
  ownerId: string;
}): { ok: true } | { ok: false; reason: string } {
  const entry = pending.get(args.token);
  if (!entry) return { ok: false, reason: "Ukendt eller udløbet confirmation-token" };

  // One-time-use: slet altid, uanset succes
  pending.delete(args.token);

  if (Date.now() - entry.createdAt > TTL_MS) {
    return { ok: false, reason: "Confirmation-token er udløbet (5 min)" };
  }
  if (entry.ownerId !== args.ownerId) {
    return { ok: false, reason: "Token tilhører en anden session" };
  }
  if (entry.tool !== args.tool) {
    return { ok: false, reason: "Token er udstedt til et andet tool" };
  }
  if (entry.argsHash !== hashArgs(args.tool, args.toolArgs)) {
    return { ok: false, reason: "Args er ændret efter confirmation blev udstedt" };
  }
  return { ok: true };
}

/**
 * Fjerner et eventuelt top-level 'confirm'-felt fra args. AI'en kan ikke selv
 * tilføje confirm:true og bypass plan-først; confirm må kun tilføjes igen
 * server-side efter consumeConfirmation har valideret et server-udstedt token.
 */
export function stripConfirm(args: unknown): unknown {
  if (args === null || typeof args !== "object") return args;
  if (Array.isArray(args)) return args;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (k !== "confirm") out[k] = v;
  }
  return out;
}

/** Til tests — clear all pending tokens. */
export function _resetPendingConfirmations(): void {
  pending.clear();
}
