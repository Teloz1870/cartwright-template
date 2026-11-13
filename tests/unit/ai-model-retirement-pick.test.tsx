// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TREND28-a — the "Select claude-sonnet-5-5" button under a saved Sonnet 4.5
 * in /admin/integrations → AI, clicked for real. tests/unit/ai-model-retirements.test.tsx
 * renders the warning to static markup, which runs no handler; this drives the
 * click: the successor becomes the selected model, the warning goes, the form
 * turns unsaved — and nothing is written until the admin saves.
 */
const actions = vi.hoisted(() => ({
  setAiSettingsAction: vi.fn(),
  listOllamaModelsAction: vi.fn(),
  testAiProviderAction: vi.fn(),
  deleteOllamaModelAction: vi.fn(),
}));
vi.mock("@/app/admin/integrations/actions", () => actions);

const { default: LocalAiForm } = await import("@/app/admin/integrations/LocalAiForm");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BEFORE = new Date("2026-11-29T12:00:00.000Z");

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(BEFORE);
  actions.setAiSettingsAction.mockReset().mockResolvedValue({ ok: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const select = () => container.querySelector<HTMLSelectElement>("#anthropicModel")!;
const notice = () => container.querySelector("[data-retiring-model-notice]");
const button = (label: RegExp) =>
  [...container.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""));

type FormInitial = Parameters<typeof LocalAiForm>[0]["initial"];

async function mount(anthropicModel: string, overrides: Partial<FormInitial> = {}) {
  await act(async () =>
    root.render(
      <LocalAiForm
        initial={{
          provider: "anthropic",
          anthropicModel,
          localAiEndpoint: null,
          localAiModel: null,
          localAiFallbackMode: "off",
          anthropicConfigured: true,
          localConfigured: false,
          lastDegradedAt: null,
          ...overrides,
        }}
      />,
    ),
  );
}

// A shop on its own Ollama: the chat runs locally, but the design, copy and SEO
// generators still call Anthropic with the saved model (lib/ai/client.ts, intent "vibe").
const LOCAL: Partial<FormInitial> = {
  provider: "local",
  localAiEndpoint: "http://localhost:11434/v1",
  localAiModel: "gemma4:e4b",
  localConfigured: true,
};

describe("the successor button under a saved Sonnet 4.5", () => {
  it("selects claude-sonnet-5-5 without saving, and the save then sends it", async () => {
    await mount("claude-sonnet-4-5");
    expect(select().value).toBe("claude-sonnet-4-5");
    expect(button(/^Saved$/)?.disabled).toBe(true);

    await act(async () => button(/Select claude-sonnet-5-5/)!.click());

    expect(select().value).toBe("claude-sonnet-5-5");
    expect(notice()).toBeNull();
    // The saved model stays in the list, so it can be picked back before saving.
    expect([...select().options].map((o) => o.value)).toContain("claude-sonnet-4-5");
    expect(actions.setAiSettingsAction).not.toHaveBeenCalled();

    const save = button(/Save settings/);
    expect(save, "the click leaves the form unsaved").toBeDefined();
    expect(save!.disabled).toBe(false);
    await act(async () => save!.click());
    expect(actions.setAiSettingsAction).toHaveBeenCalledTimes(1);
    const sent = actions.setAiSettingsAction.mock.calls[0][0] as FormData;
    expect(sent.get("anthropicModel")).toBe("claude-sonnet-5-5");
  });
});

describe("a saved Sonnet 4.5 behind the Local provider", () => {
  it("still warns before the day, and the successor button selects and saves claude-sonnet-5-5", async () => {
    await mount("claude-sonnet-4-5", LOCAL);
    expect(notice()?.getAttribute("data-retiring-model-notice")).toBe("retiring");
    expect(select(), "the Anthropic model list is shown in Local mode").not.toBeNull();
    expect(select().value).toBe("claude-sonnet-4-5");

    await act(async () => button(/Select claude-sonnet-5-5/)!.click());

    expect(notice()).toBeNull();
    expect(select(), "the list stays in view after the click").not.toBeNull();
    expect(select().value).toBe("claude-sonnet-5-5");
    await act(async () => button(/Save settings/)!.click());
    const sent = actions.setAiSettingsAction.mock.calls[0][0] as FormData;
    expect(sent.get("provider")).toBe("local");
    expect(sent.get("anthropicModel")).toBe("claude-sonnet-5-5");
  });

  it("says it has been retired from the day on", async () => {
    vi.setSystemTime(new Date("2026-11-30T00:00:00.000Z"));
    await mount("claude-sonnet-4-5", LOCAL);
    expect(notice()?.getAttribute("data-retiring-model-notice")).toBe("retired");
    expect(button(/Select claude-sonnet-5-5/)).toBeDefined();
  });

  it("leaves Local mode as it was for a saved model that does not retire", async () => {
    await mount("claude-sonnet-5-5", LOCAL);
    expect(select()).toBeNull();
    expect(notice()).toBeNull();
  });
});
