// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRODUCT-CSV-BODY-LIMIT, the form half. `/admin/produkter/import` sent the
 * whole CSV to a Server Action, and Next refuses an action body over 1 MB before
 * the action runs — so a larger catalogue ended on the error page with nothing
 * saved. The form now measures the body it would send and refuses an oversized
 * file or paste with a message that says how to split it, without calling the
 * action; a rejected call is a message too, not the error page. The size rule
 * and the action's own guard are pinned in products-csv-limit.test.ts.
 */

const h = vi.hoisted(() => ({
  action: vi.fn(async (_csv: string): Promise<unknown> => ({ created: 1, updated: 0, errors: [] })),
  refresh: vi.fn(),
}));

vi.mock("@/app/admin/produkter/import/actions", () => ({ importProductsAction: h.action }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));

const { ImportForm } = await import("@/app/admin/produkter/import/ImportForm");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MB = 1024 * 1024;
const OVERSIZED = "slug,name,description,priceKr,categorySlug\n" + "x".repeat(Math.round(1.1 * MB));
const FITTING = "slug,name,description,priceKr,categorySlug\nabc,Abc,A fine product,100,cat\n";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  h.action.mockClear();
  h.refresh.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ImportForm />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function paste(value: string) {
  const el = container.querySelector("textarea")!;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function clickImport() {
  await act(async () => {
    container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const alertText = () => container.querySelector('[role="alert"]')?.textContent ?? null;

describe("ImportForm", () => {
  it("refuses a pasted CSV over the limit without calling the action, and says how to split it", async () => {
    await act(async () => paste(OVERSIZED));
    await clickImport();
    expect(h.action).not.toHaveBeenCalled();
    expect(alertText()).toMatch(/at most 1 MB/);
    expect(alertText()).toMatch(/each start with the header row/);
  });

  it("refuses a picked file over the limit before Import is clicked, and does not load it", async () => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([OVERSIZED], "catalogue.csv", { type: "text/csv" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await vi.waitFor(() => expect(alertText()).toMatch(/at most 1 MB/));
    expect(container.querySelector("textarea")!.value).toBe("");
    expect(container.querySelector("button")!.disabled).toBe(true);
    expect(h.action).not.toHaveBeenCalled();
  });

  it("sends a CSV that fits and shows the result", async () => {
    await act(async () => paste(FITTING));
    await clickImport();
    expect(h.action).toHaveBeenCalledWith(FITTING);
    expect(alertText()).toBeNull();
    expect(container.textContent).toMatch(/1 created · 0 updated · 0 errors/);
    expect(h.refresh).toHaveBeenCalled();
  });

  it("shows the action's own refusal as a message", async () => {
    h.action.mockResolvedValueOnce({ error: "This CSV is 1.1 MB as sent, and one import takes at most 1 MB." });
    await act(async () => paste(FITTING));
    await clickImport();
    expect(alertText()).toMatch(/at most 1 MB/);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("turns a rejected action call into a message instead of the error page", async () => {
    h.action.mockRejectedValueOnce(new Error("An unexpected response was received from the server."));
    await act(async () => paste(FITTING));
    await clickImport();
    expect(alertText()).toMatch(/The import failed before a result came back/);
    expect(alertText()).toMatch(/unexpected response/);
  });
});
