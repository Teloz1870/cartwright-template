import { describe, it, expect } from "vitest";
import { scan } from "../../../scripts/p2k-scan";

/**
 * Master Plan §4 Phase 7 — tests for the P2K (Prompt-to-Key) repository
 * scanner. The scanner itself runs as a script; this test invokes it as a
 * library so vitest can assert no findings exist in the current tree.
 *
 * If this test ever fails, READ THE OUTPUT CAREFULLY. The scanner has
 * found a file that imports both an LLM and a money-or-policy primitive.
 * Per Master Plan §4: "P2K = automatic block".
 */

describe("P2K scanner — current repo state", () => {
  it("returns zero findings on the current tree", () => {
    const findings = scan();
    if (findings.length > 0) {
      console.error("P2K findings:", JSON.stringify(findings, null, 2));
    }
    expect(findings).toEqual([]);
  });
});
