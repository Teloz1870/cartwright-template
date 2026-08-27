"use client";

import { useEffect } from "react";
import {
  registerWebMcpTools,
  resolveModelContext,
  type WebMcpToolDescriptor,
} from "@/lib/model-context";
import { computeBrew, STRENGTH_RATIO, type Strength } from "./brew-math";

/**
 * Crema — the DESIGN PACK ships its own WebMCP tool: the homepage's brew
 * calculator becomes `calculate_brew_ratio`. A page capability the human
 * uses with sliders is the same capability an agent gets as a typed tool —
 * computed from the SAME math module (brew-math.ts), so the two can never
 * disagree.
 *
 * This is the first pack-registered tool, so it also carries the pattern's
 * safety wiring: the pack declares its bindings in `DesignPack.
 * webMcpToolBindings` (designs/crema/index.ts imports the const below), and
 * the moat test aggregates EVERY registered pack's bindings into the global
 * uniqueness + families check. `calculate_brew_ratio` binds [] as the
 * moat's PURE_COMPUTE class: page-local math, no data operation, no
 * navigation — the enumeration in the moat test is review-gated.
 */

/** Moat bindings — aggregated via DesignPack.webMcpToolBindings. */
export const CREMA_WEBMCP_TOOL_BINDINGS = {
  calculate_brew_ratio: [],
} as const;

const STRENGTHS = Object.keys(STRENGTH_RATIO) as Strength[];

function buildBrewTools(): WebMcpToolDescriptor[] {
  return [
    {
      name: "calculate_brew_ratio",
      description:
        "Calculate this roastery's recommended pour-over recipe: cups of coffee → grams of ground coffee and grams of water. " +
        "Uses the shop's own brewing guide (1 cup = 200 g water; strong 1:15, balanced 1:16, bright 1:17). " +
        "Pure calculation — instant, changes nothing.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: {
          cups: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description: "How many cups to brew (1–12). One cup = 2 dl.",
          },
          strength: {
            type: "string",
            enum: STRENGTHS,
            description: "strong = 1:15, balanced = 1:16, bright = 1:17. Defaults to balanced.",
          },
        },
        required: ["cups"],
      },
      execute(input) {
        const cups = Number(input.cups);
        if (!Number.isInteger(cups) || cups < 1 || cups > 12) {
          return { error: "cups must be an integer between 1 and 12." };
        }
        const strength = input.strength === undefined ? "balanced" : input.strength;
        if (typeof strength !== "string" || !(strength in STRENGTH_RATIO)) {
          return { error: `strength must be one of: ${STRENGTHS.join(", ")}.` };
        }
        return {
          strength,
          ...computeBrew(cups, STRENGTH_RATIO[strength as Strength]),
        };
      },
    },
  ];
}

export default function BrewWebMcpTools() {
  useEffect(() => {
    const resolved = resolveModelContext();
    if (!resolved) return;
    const controller = new AbortController();
    void registerWebMcpTools(resolved.context, buildBrewTools(), controller.signal);
    return () => controller.abort();
  }, []);

  return null;
}
