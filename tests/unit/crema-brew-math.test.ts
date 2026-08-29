import { describe, expect, it } from "vitest";
import {
  computeBrew,
  CUP_G,
  RATIOS,
  STRENGTH_RATIO,
} from "@/designs/crema/webshop/brew-math";

/**
 * One math module feeds BOTH the homepage calculator island and the pack's
 * `calculate_brew_ratio` WebMCP tool — this pin is what makes "the widget
 * and the agent can never disagree" true. The reference recipe comes from
 * the shop's own brewing guide.
 */
describe("crema brew math", () => {
  it("2 cups at 1:16 = 25 g coffee / 400 g water (the guide's reference recipe)", () => {
    expect(computeBrew(2, 16)).toEqual({
      cups: 2,
      ratio: "1:16",
      coffeeGrams: 25,
      waterGrams: 400,
    });
  });

  it("one cup is 200 g of water at every ratio", () => {
    for (const ratio of RATIOS) {
      expect(computeBrew(1, ratio).waterGrams).toBe(CUP_G);
    }
  });

  it("the agent strength vocabulary maps onto the guide's three ratios", () => {
    expect(STRENGTH_RATIO).toEqual({ strong: 15, balanced: 16, bright: 17 });
    expect(computeBrew(4, STRENGTH_RATIO.strong)).toEqual({
      cups: 4,
      ratio: "1:15",
      coffeeGrams: 53, // round(800 / 15)
      waterGrams: 800,
    });
  });
});
