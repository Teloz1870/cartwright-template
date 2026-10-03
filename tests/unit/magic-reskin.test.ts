import { describe, expect, it } from "vitest";

import {
  withBrandVoice,
  buildV0SystemText,
  type BrandVoice,
} from "@/lib/magic/reskin-text";

/**
 * Magic Builder — cohesion re-skin (pure text builders).
 *
 * These are the deterministic prompt-shaping helpers: enrich a catalog
 * generation prompt with brand voice, and seed the v0 system prompt with brand
 * palette + voice. Pure (no DB/LLM) so they're unit-pinned; the async wrappers
 * in reskin.ts just gather the inputs.
 */

const VOICE: BrandVoice = {
  storeName: "Northbound Coffee",
  tone: "warm",
  audience: "consumer",
  formality: "casual",
  vibe: "cozy",
};

describe("withBrandVoice", () => {
  it("keeps the original prompt and appends the brand voice", () => {
    const out = withBrandVoice("En hero til en kaffe-landingsside", VOICE);
    expect(out).toMatch(/En hero til en kaffe-landingsside/);
    expect(out).toMatch(/Northbound Coffee/);
    expect(out).toMatch(/warm/);
    expect(out).toMatch(/consumer/);
    expect(out).toMatch(/cozy/);
  });
});

describe("buildV0SystemText", () => {
  it("instructs raw Tailwind HTML output (no React, class= not className=)", () => {
    const out = buildV0SystemText({ storeName: "Northbound Coffee", voice: VOICE, palette: null });
    expect(out).toMatch(/Northbound Coffee/);
    expect(out).toMatch(/class=/);
    expect(out).toMatch(/className=/); // it tells the model to use class= NOT className=
    expect(out.toLowerCase()).toMatch(/tailwind/);
  });

  it("injects the brand palette hexes when a palette is provided", () => {
    const out = buildV0SystemText({
      storeName: "Northbound Coffee",
      voice: VOICE,
      palette: {
        accent: "#C2410C",
        accentDeep: "#7C2D12",
        cream: "#FFF7ED",
        sand: "#FFEDD5",
        ink: "#1C1917",
        muted: "#78716C",
      },
    });
    expect(out).toMatch(/#C2410C/);
    expect(out).toMatch(/#7C2D12/);
  });

  it("omits color guidance when no palette is available", () => {
    const out = buildV0SystemText({ storeName: "X", voice: VOICE, palette: null });
    expect(out).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});
