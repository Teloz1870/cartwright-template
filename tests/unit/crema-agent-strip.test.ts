import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Crema strip shows an independently measured score, so it must ask about
 * this shop's own address. brand.config.ts is the compile-time default, and an
 * operator's domain from the setup wizard lands in getBrand().url.
 */
const state = vi.hoisted(() => ({
  url: "",
  fetchAgentReport: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getBrand: async () => ({ url: state.url }) }));
vi.mock("../../designs/crema/agent-report", () => ({ fetchAgentReport: state.fetchAgentReport }));

import { brand } from "../../brand.config";
import { CremaAgentStrip } from "../../designs/crema/AgentStrip";

beforeEach(() => {
  state.fetchAgentReport.mockReset().mockResolvedValue(null);
});

describe("CremaAgentStrip", () => {
  it("asks for the score of the runtime address, not the one in brand.config.ts", async () => {
    state.url = "https://kaffe.example.test";
    expect(new URL(brand.url).hostname).not.toBe("kaffe.example.test");

    const strip = await CremaAgentStrip({ locale: "da" });

    expect(state.fetchAgentReport).toHaveBeenCalledExactlyOnceWith("kaffe.example.test/da");
    expect(strip?.props).toMatchObject({ target: "kaffe.example.test/da", report: null });
  });

  it("hands the report it got to the strip", async () => {
    state.url = "https://kaffe.example.test";
    const report = { score: 88, reportUrl: "https://is-agentic.com/scan/kaffe.example.test/en" };
    state.fetchAgentReport.mockResolvedValue(report);

    const strip = await CremaAgentStrip({ locale: "en" });

    expect(strip?.props).toMatchObject({ target: "kaffe.example.test/en", report });
  });

  it("renders nothing and asks nothing when the address cannot be read", async () => {
    state.url = "not a url";

    expect(await CremaAgentStrip({ locale: "da" })).toBeNull();
    expect(state.fetchAgentReport).not.toHaveBeenCalled();
  });
});
