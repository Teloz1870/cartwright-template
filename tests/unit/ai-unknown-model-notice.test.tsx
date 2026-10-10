import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * DRØM47-b — a model id the engine does not know runs with read-only tools and
 * an 8k context window. That fallback is right (an untested model must never
 * get write tools by accident), but it was silent: the admin typed an Ollama
 * model, saved, and got a chat that could not change anything, with nothing on
 * screen saying why. The AI form now says it under the model field. The
 * fallback itself stays exactly as conservative as before.
 */

vi.mock("@/app/admin/integrations/actions", () => ({
  setAiSettingsAction: vi.fn(),
  listOllamaModelsAction: vi.fn(),
  testAiProviderAction: vi.fn(),
  deleteOllamaModelAction: vi.fn(),
}));

import LocalAiForm from "@/app/admin/integrations/LocalAiForm";
import {
  MODEL_CAPABILITIES,
  UNKNOWN_MODEL_CAPABILITIES,
  getModelCapabilities,
  isKnownModel,
  unknownModelNotice,
} from "@/lib/ai/model-capabilities";
import { getModelCapabilities as serverGetModelCapabilities } from "@/lib/ai/client";

type FormInitial = Parameters<typeof LocalAiForm>[0]["initial"];

const base: FormInitial = {
  provider: "local",
  anthropicModel: "claude-haiku-4-5",
  localAiEndpoint: "http://localhost:11434/v1",
  localAiModel: "gemma4:e4b",
  localAiFallbackMode: "on-error",
  anthropicConfigured: true,
  localConfigured: true,
  lastDegradedAt: null,
};

const render = (patch: Partial<FormInitial>) => renderToStaticMarkup(<LocalAiForm initial={{ ...base, ...patch }} />);
const notices = (html: string) => html.match(/data-unknown-model-notice/g)?.length ?? 0;

describe("the unknown-model fallback stays conservative", () => {
  it("an id without a row gets read-only tools and an 8k window", () => {
    expect(UNKNOWN_MODEL_CAPABILITIES).toEqual({ tools: "read-only", maxTokens: 8192, supportsToolCall: true });
    expect(getModelCapabilities("mistral:7b")).toBe(UNKNOWN_MODEL_CAPABILITIES);
  });

  it("an inherited Object key is not a model", () => {
    for (const id of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(isKnownModel(id), id).toBe(false);
      expect(getModelCapabilities(id), id).toBe(UNKNOWN_MODEL_CAPABILITIES);
    }
  });

  it("the server client resolves through the same table", () => {
    expect(serverGetModelCapabilities).toBe(getModelCapabilities);
  });
});

describe("unknownModelNotice", () => {
  it("names both limits for an id the engine does not know", () => {
    const notice = unknownModelNotice("mistral:7b");
    expect(notice).toMatch(/^Not a known model/);
    expect(notice).toMatch(/read-only/);
    expect(notice).toMatch(/8k/);
  });

  it("is silent for every id with a capability row, trimmed like the save action", () => {
    for (const id of Object.keys(MODEL_CAPABILITIES)) {
      expect(unknownModelNotice(id), id).toBeNull();
      expect(unknownModelNotice(` ${id} `), id).toBeNull();
    }
  });

  it("is silent when no model is set", () => {
    expect(unknownModelNotice("")).toBeNull();
    expect(unknownModelNotice("   ")).toBeNull();
  });
});

describe("the AI settings form in /admin/integrations", () => {
  it("shows the notice under a local model the engine does not know", () => {
    const html = render({ localAiModel: "mistral:7b" });
    expect(notices(html)).toBe(1);
    expect(html).toContain("Not a known model: tools run read-only and the context window is limited to 8k tokens.");
    expect(html).toContain("Read-only (~10 tools)");
  });

  it("shows no notice for a known local model, and its real tier", () => {
    const html = render({ localAiModel: "gemma4:e4b" });
    expect(notices(html)).toBe(0);
    expect(html).toContain("Low-risk writes (~15 tools)");
  });

  it("shows the notice under a saved Anthropic model without a capability row", () => {
    const html = render({ provider: "anthropic", anthropicModel: "claude-opus-4-1" });
    expect(notices(html)).toBe(1);
    expect(render({ provider: "anthropic", anthropicModel: "claude-opus-5-5" })).not.toContain(
      "data-unknown-model-notice",
    );
  });
});
