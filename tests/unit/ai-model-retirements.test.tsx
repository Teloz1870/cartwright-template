import { renderToStaticMarkup } from "react-dom/server";
import { APICallError, generateText, type LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TREND28-a — Anthropic retires Claude Sonnet 4.5 on 30 Nov 2026. The admin
 * list stopped offering it, but a shop that SAVED it kept sending it for every
 * intent, with nothing on screen saying the day was coming — and on the day
 * every AI request would fail with Anthropic's bare "not found". Now the date
 * is data: the AI form warns under a saved retiring model, and after the day
 * the failure names the successor. The saved choice is never rewritten.
 * Every clock in here is injected — no assertion depends on today's date.
 */

const settings = vi.hoisted(() => ({ getAiSettings: vi.fn() }));
vi.mock("@/lib/ai/settings", () => settings);
// The real provider, with every model it builds recorded — so a test can ask
// whether the engine handed that very object on, or a wrapper around it.
const built = vi.hoisted(() => [] as unknown[]);
vi.mock("@ai-sdk/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ai-sdk/anthropic")>();
  return {
    ...actual,
    createAnthropic: (...args: Parameters<typeof actual.createAnthropic>) =>
      new Proxy(actual.createAnthropic(...args), {
        apply(target, thisArg, argArray) {
          const model: unknown = Reflect.apply(target, thisArg, argArray);
          built.push(model);
          return model;
        },
      }),
  };
});
vi.mock("@/app/admin/integrations/actions", () => ({
  setAiSettingsAction: vi.fn(),
  listOllamaModelsAction: vi.fn(),
  testAiProviderAction: vi.fn(),
  deleteOllamaModelAction: vi.fn(),
}));

import LocalAiForm from "@/app/admin/integrations/LocalAiForm";
import { ANTHROPIC_MODEL_OPTIONS } from "@/lib/ai/anthropic-models";
import { CHAT_MODEL, chatModelResolved, explainRetiredModel } from "@/lib/ai/client";
import {
  MODEL_RETIREMENTS,
  RetiredModelError,
  formatRetirementDay,
  isRetired,
  modelRetirement,
  modelRetirementNotice,
} from "@/lib/ai/model-retirements";

const BEFORE = new Date("2026-11-29T23:59:59.999Z");
const ON_THE_DAY = new Date("2026-11-30T00:00:00.000Z");
const DAY_MS = 86_400_000;
type ProviderModel = Extract<LanguageModel, { specificationVersion: "v4" }>;
const offered = [...ANTHROPIC_MODEL_OPTIONS.map((o) => o.value), CHAT_MODEL];

const notFound = (id: string) =>
  new APICallError({
    message: `model: ${id}`,
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode: 404,
    isRetryable: false,
  });

describe("the retirement table", () => {
  it("carries Sonnet 4.5's date, successor and source as Anthropic publishes them", () => {
    for (const id of ["claude-sonnet-4-5", "claude-sonnet-4-5-20250929"]) {
      expect(MODEL_RETIREMENTS[id], id).toEqual({
        retiresAt: "2026-11-30",
        successor: "claude-sonnet-5-5",
        source: "https://platform.claude.com/docs/en/about-claude/model-deprecations",
        verifiedAt: "2026-10-23",
      });
    }
  });

  it("no model the admin can pick, nor the default, retires within 60 days of a row's check", () => {
    for (const id of offered) {
      const row = modelRetirement(id);
      if (!row) continue;
      const checked = Date.parse(`${row.verifiedAt}T00:00:00Z`);
      expect(isRetired(row, new Date(checked + 60 * DAY_MS)), id).toBe(false);
    }
  });

  it("every successor is a model the admin can pick, and does not retire itself", () => {
    for (const [id, row] of Object.entries(MODEL_RETIREMENTS)) {
      expect(offered, id).toContain(row.successor);
      expect(modelRetirement(row.successor), id).toBeNull();
    }
  });

  it("looks ids up trimmed, by own key only", () => {
    expect(modelRetirement(" claude-sonnet-4-5 ")).toBe(MODEL_RETIREMENTS["claude-sonnet-4-5"]);
    for (const id of ["toString", "constructor", "__proto__", "hasOwnProperty", "", "claude-sonnet-5-5"]) {
      expect(modelRetirement(id), id).toBeNull();
    }
  });

  it("a model is retired from the first moment of its retirement day (UTC), not before", () => {
    const row = MODEL_RETIREMENTS["claude-sonnet-4-5"];
    expect(isRetired(row, BEFORE)).toBe(false);
    expect(isRetired(row, ON_THE_DAY)).toBe(true);
    expect(formatRetirementDay(row.retiresAt)).toBe("30 Nov 2026");
  });
});

describe("modelRetirementNotice", () => {
  it("before the day: dated, names the successor, says nothing is changed for the admin", () => {
    expect(modelRetirementNotice("claude-sonnet-4-5", BEFORE)).toBe(
      "Retires 30 Nov 2026 — switch to claude-sonnet-5-5 and save. " +
        "It keeps working until then, and your saved choice is not changed for you.",
    );
  });

  it("from the day: says requests now fail and names the successor", () => {
    expect(modelRetirementNotice(" claude-sonnet-4-5-20250929 ", ON_THE_DAY)).toBe(
      "Retired 30 Nov 2026 — every AI request with claude-sonnet-4-5-20250929 now fails. " +
        "Switch to claude-sonnet-5-5 and save.",
    );
  });

  it("is silent for every model the admin can pick, and for no model", () => {
    for (const id of [...offered, "", "   "]) {
      expect(modelRetirementNotice(id, ON_THE_DAY), id).toBeNull();
    }
  });
});

describe("explainRetiredModel — the provider's 404 after the day names the way out", () => {
  it("turns a 404 for a retired model into a RetiredModelError that keeps the cause", () => {
    const cause = notFound("claude-sonnet-4-5");
    const explained = explainRetiredModel("claude-sonnet-4-5", cause, ON_THE_DAY);
    expect(explained).toBeInstanceOf(RetiredModelError);
    expect((explained as Error).message).toBe(
      "claude-sonnet-4-5 was retired on 30 Nov 2026 — choose claude-sonnet-5-5 in /admin/integrations → AI and save.",
    );
    expect((explained as Error).cause).toBe(cause);
  });

  it("leaves the error alone before the day", () => {
    const cause = notFound("claude-sonnet-4-5");
    expect(explainRetiredModel("claude-sonnet-4-5", cause, BEFORE)).toBe(cause);
  });

  it("leaves any other failure alone — a bad key is a bad key", () => {
    const unauthorized = new APICallError({
      message: "invalid x-api-key",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 401,
    });
    const plain = new Error("socket hang up");
    expect(explainRetiredModel("claude-sonnet-4-5", unauthorized, ON_THE_DAY)).toBe(unauthorized);
    expect(explainRetiredModel("claude-sonnet-4-5", plain, ON_THE_DAY)).toBe(plain);
  });

  it("leaves a 404 for a model without a retirement row alone", () => {
    const cause = notFound("claude-opus-4-1");
    expect(explainRetiredModel("claude-opus-4-1", cause, ON_THE_DAY)).toBe(cause);
  });
});

describe("chatModelResolved with a saved Sonnet 4.5", () => {
  const sent: string[] = [];

  beforeEach(() => {
    sent.length = 0;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("CLOUDFLARE_AI_GATEWAY_URL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)).model);
        return new Response(
          JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: retired" } }),
          { status: 404, headers: { "content-type": "application/json" } },
        );
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const resolveWith = (anthropicModel: string) => {
    settings.getAiSettings.mockResolvedValue({
      provider: "anthropic",
      anthropicModel,
      anthropicApiKey: "sk-ant-test",
      localAiEndpoint: null,
      localAiModel: null,
      localAiFallbackMode: "off",
      lastDegradedAt: null,
      anthropicConfigured: true,
      localConfigured: false,
    });
    return chatModelResolved("vibe");
  };

  it("after the day, generate and stream both fail with the successor named", async () => {
    vi.setSystemTime(ON_THE_DAY);
    const resolved = await resolveWith("claude-sonnet-4-5");
    const call = { prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }] };
    const handle = resolved.handle as ProviderModel;
    await expect(handle.doGenerate(call)).rejects.toBeInstanceOf(RetiredModelError);
    await expect(handle.doStream(call)).rejects.toBeInstanceOf(RetiredModelError);
    await expect(generateText({ model: resolved.handle, prompt: "hi" })).rejects.toThrow(
      /claude-sonnet-4-5 was retired on 30 Nov 2026 — choose claude-sonnet-5-5/,
    );
  });

  it("sends the saved id unchanged — the engine never swaps in the successor", async () => {
    vi.setSystemTime(ON_THE_DAY);
    const resolved = await resolveWith("claude-sonnet-4-5");
    await generateText({ model: resolved.handle, prompt: "hi" }).catch(() => undefined);
    expect(resolved.model).toBe("claude-sonnet-4-5");
    expect(sent).toEqual(["claude-sonnet-4-5"]);
  });

  it("before the day, the provider's own error comes through", async () => {
    vi.setSystemTime(BEFORE);
    const resolved = await resolveWith("claude-sonnet-4-5");
    const failure = await generateText({ model: resolved.handle, prompt: "hi" }).catch((e: unknown) => e);
    expect(APICallError.isInstance(failure)).toBe(true);
  });

  it("a model without a row gets the provider's own object, not a wrapper", async () => {
    vi.setSystemTime(ON_THE_DAY);
    const plain = await resolveWith("claude-sonnet-5-5");
    expect(plain.handle).toBe(built.at(-1));
    const retiring = await resolveWith("claude-sonnet-4-5");
    expect(retiring.handle, "only a retiring model is wrapped").not.toBe(built.at(-1));
  });

  it("a model without a row keeps the provider's error even after the day", async () => {
    vi.setSystemTime(ON_THE_DAY);
    const resolved = await resolveWith("claude-sonnet-5-5");
    const failure = await generateText({ model: resolved.handle, prompt: "hi" }).catch((e: unknown) => e);
    expect(APICallError.isInstance(failure)).toBe(true);
    expect(sent).toEqual(["claude-sonnet-5-5"]);
  });
});

describe("the AI form in /admin/integrations", () => {
  type FormInitial = Parameters<typeof LocalAiForm>[0]["initial"];
  const render = (anthropicModel: string) =>
    renderToStaticMarkup(
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
        } satisfies FormInitial}
      />,
    );
  const selected = (html: string) => html.match(/<option value="([^"]+)" selected="">/)?.[1];

  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("warns under a saved Sonnet 4.5 before the day, and keeps it selected", () => {
    vi.setSystemTime(BEFORE);
    const html = render("claude-sonnet-4-5");
    expect(html).toContain('data-retiring-model-notice="retiring"');
    expect(html).toContain("Retires 30 Nov 2026 — switch to claude-sonnet-5-5 and save.");
    expect(html).toContain("Select claude-sonnet-5-5");
    expect(selected(html)).toBe("claude-sonnet-4-5");
  });

  it("says it has been retired from the day on", () => {
    vi.setSystemTime(ON_THE_DAY);
    const html = render("claude-sonnet-4-5");
    expect(html).toContain('data-retiring-model-notice="retired"');
    expect(html).toContain("every AI request with claude-sonnet-4-5 now fails");
    expect(selected(html)).toBe("claude-sonnet-4-5");
  });

  it("shows nothing under a model the list offers", () => {
    vi.setSystemTime(ON_THE_DAY);
    for (const id of offered) {
      const html = render(id);
      expect(html, id).not.toContain("data-retiring-model-notice");
      expect(selected(html), id).toBe(id);
    }
  });
});
