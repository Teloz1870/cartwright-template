import { describe, it, expect } from "vitest";
import { renderContentBlocks } from "@/lib/content";

describe("renderContentBlocks", () => {
  it("returnerer tom liste for tom tekst", () => {
    expect(renderContentBlocks("")).toEqual([]);
  });

  it("returnerer tom liste for whitespace-only tekst", () => {
    expect(renderContentBlocks("   \n\n  ")).toEqual([]);
  });

  it("returnerer et paragraph block", () => {
    expect(renderContentBlocks("Dette er en tekst.")).toEqual([
      { type: "paragraph", text: "Dette er en tekst." },
    ]);
  });

  it("returnerer to paragraphs adskilt af blank linje", () => {
    expect(renderContentBlocks("Første afsnit.\n\nAndet afsnit.")).toEqual([
      { type: "paragraph", text: "Første afsnit." },
      { type: "paragraph", text: "Andet afsnit." },
    ]);
  });

  it("returnerer heading block for ## prefix", () => {
    expect(renderContentBlocks("## Overskrift")).toEqual([
      { type: "heading", text: "Overskrift" },
    ]);
  });

  it("returnerer mixed heading og paragraph", () => {
    expect(renderContentBlocks("## Overskrift\n\nBrødtekst her.")).toEqual([
      { type: "heading", text: "Overskrift" },
      { type: "paragraph", text: "Brødtekst her." },
    ]);
  });
});
