// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RedirectImportError, RedirectImportPlan } from "@/lib/redirects/import";

/**
 * The "Import CSV" panel on /admin/redirects — what the owner sees AFTER an
 * import. Two reviewers found the first version cleared the textarea and the
 * preview on every ok result and showed a green "Imported 0 redirects" when
 * every row had errors: the per-line errors, the only thing that says which
 * lines to fix, vanished the moment they mattered. The server actions are
 * mocked (the way SmartContactForm's fetch is), so this drives the panel's own
 * state: errors stay on screen with their line numbers, the file is kept while
 * anything failed, the success style is reserved for an import where every
 * line landed, and a preview that fails server-side is an inline message.
 */
const mocks = vi.hoisted(() => ({
  previewRedirectImport: vi.fn(),
  importRedirectsFromCsv: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/admin/redirects/actions", () => ({
  addRedirect: vi.fn(),
  removeRedirect: vi.fn(),
  previewRedirectImport: mocks.previewRedirectImport,
  importRedirectsFromCsv: mocks.importRedirectsFromCsv,
}));

const { RedirectsManager } = await import("@/app/admin/redirects/RedirectsManager");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CSV = "/old,/new\n/bad,nope\n";
const ERRORS: RedirectImportError[] = [{ line: 2, reason: "The destination must start with / or http(s)://" }];
const PLAN: RedirectImportPlan = {
  valid: [{ line: 1, fromPath: "/old", toPath: "/new", status: 301, replaces: false }],
  errors: ERRORS,
  summary: { rows: 2, valid: 1, invalid: 1, replaces: 0 },
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  mocks.previewRedirectImport.mockReset().mockResolvedValue({ ok: true, plan: PLAN });
  mocks.importRedirectsFromCsv.mockReset();
  mocks.refresh.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const textarea = () => container.querySelector("textarea")!;
const button = (label: RegExp) => [...container.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""))!;
const success = () => [...container.querySelectorAll(".text-emerald-700")].map((el) => el.textContent).join(" ");

async function type(text: string) {
  await act(async () => {
    const el = textarea();
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function mountAndPreview() {
  await act(async () => root.render(<RedirectsManager initial={[]} />));
  await type(CSV);
  await act(async () => button(/Preview/).click());
}

async function importWith(result: { imported: number; skipped: number; errors: RedirectImportError[] }) {
  await mountAndPreview();
  expect(button(/^Import 1 redirects/).disabled).toBe(false);
  mocks.importRedirectsFromCsv.mockResolvedValue({ ok: true, result });
  await act(async () => button(/^Import/).click());
  expect(mocks.importRedirectsFromCsv).toHaveBeenCalledWith(CSV);
}

describe("/admin/redirects import panel — after the import", () => {
  it("every row failed: the errors stay with their line numbers, the file is kept, nothing is green", async () => {
    await importWith({ imported: 0, skipped: 2, errors: [{ line: 1, reason: "Duplicate source path /old (also on line 1)." }, ...ERRORS] });
    expect(container.textContent).toContain("Nothing imported — 2 rows had errors.");
    expect(container.textContent).toContain("Line 1: Duplicate source path /old");
    expect(container.textContent).toContain("Line 2: The destination must start with");
    expect(textarea().value).toBe(CSV);
    expect(success()).toBe("");
    expect(mocks.refresh).not.toHaveBeenCalled();
    // The preview is stale now: the import button must not re-fire on it.
    expect(button(/^Import/).disabled).toBe(true);
  });

  it("some rows failed: the count AND the errors show, the file is kept for fixing", async () => {
    await importWith({ imported: 1, skipped: 1, errors: ERRORS });
    expect(container.textContent).toContain("Imported 1 redirects; skipped 1 row with errors.");
    expect(container.textContent).toContain("Line 2: The destination must start with");
    expect(textarea().value).toBe(CSV);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("every row landed: the success message, and the file is cleared", async () => {
    await importWith({ imported: 2, skipped: 0, errors: [] });
    expect(success()).toContain("Imported 2 redirects.");
    expect(container.textContent).not.toContain("Line ");
    expect(textarea().value).toBe("");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("a preview the server could not run is an inline error, not a crash", async () => {
    mocks.previewRedirectImport.mockResolvedValue({ ok: false, error: "Database unavailable" });
    await mountAndPreview();
    expect(container.textContent).toContain("Database unavailable");
    expect(button(/^Import/).disabled).toBe(true);
  });

  it("a preview that lands after the owner kept typing belongs to the old text: it neither shows nor arms Import", async () => {
    // Otherwise Import would send the CURRENT textarea — rows nobody reviewed.
    let resolve!: (r: { ok: true; plan: RedirectImportPlan }) => void;
    mocks.previewRedirectImport.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await mountAndPreview();
    const edited = `${CSV}/more,/rows\n`;
    await type(edited);
    await act(async () => resolve({ ok: true, plan: PLAN }));
    expect(mocks.previewRedirectImport).toHaveBeenCalledWith(CSV);
    expect(container.textContent).not.toContain("1 valid");
    expect(button(/^Import/).disabled).toBe(true);
    expect(button(/^Import/).textContent).toContain("Import 0 redirects");
    // A fresh preview of the edited text arms it again — the stale one was the problem, not previews.
    await act(async () => button(/Preview/).click());
    expect(mocks.previewRedirectImport).toHaveBeenLastCalledWith(edited);
    expect(container.textContent).toContain("1 valid");
    expect(button(/^Import 1 redirects/).disabled).toBe(false);
  });
});
