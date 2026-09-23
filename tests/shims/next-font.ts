// Shim for `next/font/google` in Vitest. next/font is a build-time transform
// that isn't available in the Node test runtime, so importing a design pack that
// loads fonts via next/font (e.g. designs/engineered) crashes the suite when the
// design registry is pulled in transitively (tool registry, etc.). We return the
// shape next/font produces ({ className, variable, style }) but inert. Same
// pattern as tests/shims/next-navigation.ts.
//
// IMPORTANT: this shim resolves ANY named export — `Cormorant_Garamond`,
// `Inter`, or a font Google ships tomorrow. A custom design pack may pick any
// display font (DESIGN.md taste rule 3: "one distinctive display font"); a
// hardcoded export list made the whole suite fail with
// "TypeError: <Font> is not a function" the moment a design used a font nobody
// had listed here. Never add a hardcoded font list back.
//
// How it works: Vitest's SSR transform turns `import { Some_Font } from
// "next/font/google"` into a plain property read on this module's exports
// object (no static link-time check — that's why the old failure mode was a
// runtime TypeError, not an import error). We self-import to get a handle on
// that very exports object and give it a Proxy PROTOTYPE, so any property the
// module doesn't explicitly export resolves to the font factory via the
// prototype chain. Covered by tests/unit/next-font-shim.test.ts.
import * as self from "./next-font";

type FontResult = { className: string; variable: string; style: { fontFamily: string } };
const fontFactory = (): FontResult => ({ className: "", variable: "", style: { fontFamily: "" } });

const anyFont = new Proxy(Object.create(null) as Record<string, unknown>, {
  get(_target, prop) {
    // Don't masquerade as module metadata — and NEVER answer "then": a
    // thenable module namespace makes the async module pipeline await it
    // forever (the suite hangs, no error). Verified the hard way.
    if (
      prop === "__esModule" ||
      prop === "default" ||
      prop === "then" ||
      prop === "catch" ||
      prop === "finally" ||
      typeof prop === "symbol"
    ) {
      return undefined;
    }
    return fontFactory;
  },
});

Object.setPrototypeOf(self, anyFont);

// One real named export so the module has a concrete export shape; everything
// else (any font name) is answered by the Proxy prototype above.
export const __anyFontShim = true;
