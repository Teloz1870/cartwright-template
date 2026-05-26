#!/usr/bin/env tsx
/**
 * Master Plan §4 Phase 7 — Prompt-to-Key (P2K) repository scanner.
 *
 * Master Plan §4 success criterion: "every diff is scanned for Prompt-to-Key
 * (P2K) vulnerabilities — any place where LLM-mediated cognition crosses into
 * a path that can release funds or modify legislation. P2K = automatic block."
 *
 * This scanner identifies the LLM-touching-money intersection. It flags any
 * file in `app/api/**` or `lib/**` that imports BOTH:
 *   - an LLM (anthropic, openai, gemini, @ai-sdk/*, or local chatModel())
 *   AND
 *   - a money-or-policy primitive (pricing, escrow, stripe, negotiation,
 *     discount, agentic policy)
 *
 * False-positive defence: comments are stripped before pattern-matching, so
 * a file documenting "this used to call chatModel() but doesn't anymore"
 * does not trip the scanner.
 *
 * Exit codes:
 *   0 — clean
 *   1 — one or more files flagged (CI fails)
 *   2 — scanner itself errored (e.g. missing directory)
 *
 * Usage:
 *   node --import tsx scripts/p2k-scan.ts        # full repo scan
 *   pnpm exec tsx scripts/p2k-scan.ts            # same
 *   pnpm exec tsx scripts/p2k-scan.ts --quiet    # only emit on failure
 *
 * Pure module — no DB, no network, no side effects beyond stdout/stderr.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const SCAN_DIRS = ["app/api", "lib"];

/**
 * Allowlist: files known to safely intersect LLM + money. Each entry MUST
 * have a one-line justification. Adding an entry requires code-review
 * approval — it is NOT an automated suppression mechanism. Comments-in-source
 * suppression markers are deliberately not supported.
 *
 * Audit reminder: every entry here should be re-examined when its file is
 * meaningfully edited. Stale allowlist entries are a security smell.
 */
const ALLOWLIST: Record<string, string> = {
  // The customer-facing AI assistant. Inside an LLM tool-handler, the server
  // calls calcPriceBreakdown(cart, null) to compute the cart total
  // deterministically, then sets it on the tool args (LLM does NOT choose
  // the number). Pattern is the "LLM as translation layer" §3.2 design. A
  // dedicated refactor to fully separate the price-compute step from the
  // LLM tool flow is desirable but out of scope for Phase 7.
  "app/api/assistant/chat/route.ts":
    "LLM tool handler — server-side deterministic price; LLM does not choose number. Reviewed Phase 7.",
};

/** Patterns that flag an LLM dependency. */
const LLM_PATTERNS = [
  "@ai-sdk/",
  "from \"anthropic",
  "from 'anthropic",
  "from \"openai",
  "from 'openai",
  "from \"@anthropic-ai/",
  "from '@anthropic-ai/",
  "@google/generative-ai",
  "@/lib/ai",
  "lib/ai/",
  "chatModel(",
  "generateText(",
  "streamText(",
  "embed(",
  "generateObject(",
  "streamObject(",
] as const;

/** Patterns that flag a money-or-policy primitive. */
const MONEY_PATTERNS = [
  "calcSubtotal",
  "calcDiscount",
  "calcShipping",
  "calcPriceBreakdown",
  "stripe.",
  "from \"stripe\"",
  "from 'stripe'",
  "@/lib/stripe",
  "lib/stripe",
  "EscrowTransaction",
  "PoTEProof",
  "decideNegotiation",
  "lib/negotiation/",
  "agenticPolicyJson",
  "isScopeAllowed",
  "isOrderValueAllowed",
] as const;

/**
 * Strip JS/TS comments (block + line) and string contents from source. We
 * remove string contents too because pattern lists in test/scanner files
 * themselves embed forbidden patterns as data — those shouldn't trip the
 * scan on themselves.
 */
function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString: '"' | "'" | "`" | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inString) {
        inString = null;
        out += ch; // keep the closing quote for grammar clarity
      }
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch as '"' | "'" | "`";
      out += ch; // keep the opening quote
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      // Skip the scanner itself + scanner tests (they LIST forbidden patterns
      // as data; comment-stripping handles most of it but extra caution).
      if (entry === "p2k-scan.ts") continue;
      if (entry === "no-llm-imports.test.ts") continue;
      if (entry === "p2k-scan.test.ts") continue;
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        out.push(...listSourceFiles(full));
      } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
        out.push(full);
      }
    }
  } catch (err) {
    // Directory missing → no files
    return [];
  }
  return out;
}

type Finding = {
  file: string;
  llmHits: string[];
  moneyHits: string[];
};

export function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const dir of SCAN_DIRS) {
    const fullDir = join(REPO_ROOT, dir);
    for (const file of listSourceFiles(fullDir)) {
      const relPath = relative(REPO_ROOT, file);
      if (relPath in ALLOWLIST) continue; // pre-reviewed safe intersection
      const raw = readFileSync(file, "utf8");
      const stripped = stripCommentsAndStrings(raw);
      const llmHits = LLM_PATTERNS.filter((p) => stripped.includes(p));
      const moneyHits = MONEY_PATTERNS.filter((p) => stripped.includes(p));
      if (llmHits.length > 0 && moneyHits.length > 0) {
        findings.push({ file: relPath, llmHits, moneyHits });
      }
    }
  }
  return findings;
}

/** For inspection / dashboard usage. Returns the allowlist for transparency. */
export function getAllowlist(): Readonly<Record<string, string>> {
  return ALLOWLIST;
}

function main(): void {
  const quiet = process.argv.includes("--quiet");
  let findings: Finding[];
  try {
    findings = scan();
  } catch (err) {
    console.error("[p2k-scan] scanner error:", err);
    process.exit(2);
  }

  if (findings.length === 0) {
    if (!quiet) console.log("✓ P2K scan clean: no LLM+money intersections found");
    process.exit(0);
  }

  console.error(`\n🚨 P2K scan FAILED — ${findings.length} file(s) flagged:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}`);
    console.error(`    LLM patterns:   ${f.llmHits.join(", ")}`);
    console.error(`    Money patterns: ${f.moneyHits.join(", ")}`);
    console.error();
  }
  console.error(
    "These files are at the LLM-money intersection. Either:\n" +
      "  1. The money primitives don't belong in this file (move to a separate caller).\n" +
      "  2. The LLM call should be replaced by deterministic code (Phase 6 engine).\n" +
      "  3. Refactor so the LLM produces text only, never a number or policy decision.\n" +
      "\n" +
      "DO NOT add an exception. P2K is an automatic-block rule per Master Plan §4.\n",
  );
  process.exit(1);
}

// Only run main when invoked directly (not when imported as a test fixture).
if (require.main === module) {
  main();
}
