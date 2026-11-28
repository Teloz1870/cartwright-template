// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `tests/setup/env.ts` points `localStorage`/`sessionStorage` at jsdom's, because
 * Node ≥ 25 puts its own on globalThis. The pool a run uses cannot be chosen per
 * file, so the VM-pool case is reproduced by what defines it: jsdom's window IS
 * globalThis there, and a getter returning `window.localStorage` calls itself.
 */
const jsdomWindow = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window;
const inVmPool = (jsdomWindow as unknown) === globalThis;

describe("the test setup's jsdom storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("both globals are jsdom's own storage, on whichever Node runs this", () => {
    expect(localStorage).toBe(jsdomWindow.localStorage);
    expect(sessionStorage).toBe(jsdomWindow.sessionStorage);
    localStorage.setItem("k", "local");
    sessionStorage.setItem("k", "session");
    expect([localStorage.getItem("k"), sessionStorage.getItem("k")]).toEqual(["local", "session"]);
  });

  it.skipIf(inVmPool)("keeps whatever a test assigns, as Vitest's own globals do", () => {
    const original = localStorage;
    globalThis.localStorage = { getItem: () => "fake" } as unknown as Storage;
    expect(localStorage.getItem("k")).toBe("fake");
    for (const missing of [null, undefined]) {
      globalThis.localStorage = missing as unknown as Storage;
      expect(globalThis.localStorage).toBe(missing);
    }
    globalThis.localStorage = original;
    expect(localStorage).toBe(jsdomWindow.localStorage);
  });

  it("leaves the keys alone where jsdom's window is globalThis, as in a VM pool", async () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    vi.stubGlobal("jsdom", { window: globalThis });
    vi.resetModules();
    await import("../setup/env");
    expect(Object.getOwnPropertyDescriptor(globalThis, "localStorage")?.get).toBe(before?.get);
    expect(() => globalThis.localStorage).not.toThrow();
  });
});
