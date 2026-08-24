/**
 * Pure colour helpers — a LEAF module.
 *
 * No imports, no `server-only`, no side effects, so anything may depend on it
 * for free: server code, client code, plugins, scripts, tests.
 *
 * Why it exists as its own file: `isValidHex` is a two-line regex, but it used
 * to live in `lib/theme.ts`, which imports `@/designs` — and `designs/index.ts`
 * statically imports **29 design packs**. So validating a hex colour pulled the
 * entire design registry into the module graph. `plugins/design-import` did
 * exactly that, and paid ~2 s of module loading to test one string.
 *
 * Keep this file dependency-free. The moment it imports anything with a
 * registry behind it, every one of its callers inherits that cost again.
 */

/** `#rgb` or `#rrggbb`. */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Hex-color validation — `#rgb` or `#rrggbb`. */
export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}
