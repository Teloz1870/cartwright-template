import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildScaffoldManifest } from "../../scripts/gen-scaffold-manifest";

/**
 * B3 drift gate: the committed scaffold/manifest.json must match what the
 * registry emits — the CLI materializer consumes the committed file from the
 * template snapshot, so drift here means scaffolds are cut from a stale
 * module graph. Fix: `pnpm gen:scaffold-manifest`.
 */
const ROOT = path.resolve(__dirname, "..", "..");

describe("scaffold/manifest.json", () => {
  it("matches the registry (run `pnpm gen:scaffold-manifest` after registry changes)", () => {
    const committed = JSON.parse(
      readFileSync(path.join(ROOT, "scaffold", "manifest.json"), "utf8"),
    );
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildScaffoldManifest())));
  });

  it("every module file/seam path and every seam's static variant exists on disk", () => {
    const manifest = buildScaffoldManifest();
    for (const m of manifest.modules) {
      for (const p of [...m.files, ...m.seams]) {
        expect(existsSync(path.join(ROOT, p)), `${m.slug}: missing ${p}`).toBe(true);
      }
      for (const seam of m.seams) {
        const variant = seam.replace(/(\.[a-z]+)$/i, ".static$1");
        expect(
          existsSync(path.join(ROOT, variant)),
          `${m.slug}: seam ${seam} has no static variant ${variant}`,
        ).toBe(true);
      }
    }
  });

  it("every declared seam has at least one providing module (replaces)", () => {
    const manifest = buildScaffoldManifest();
    const provided = new Set(
      manifest.modules.flatMap((m) => m.replaces.map((r) => r.target)),
    );
    for (const m of manifest.modules) {
      for (const seam of m.seams) {
        expect(provided.has(seam), `seam ${seam} (declared by ${m.slug}) has no provider`).toBe(
          true,
        );
      }
    }
  });

  it("every replaces[].with exists on disk and follows the with===target convention", () => {
    // Ownership of the target file may sit with ANOTHER module than the
    // content provider (e.g. mcp's lib/tools claim contains the commerce
    // pack seam that webshop provides — the documented B2 deviation), so
    // provider-ownership is deliberately NOT asserted. What the model does
    // require: the source exists, and v1 providers always say "the on-disk
    // content stands" (with === target) — a diverging `with` path would mean
    // a second content variant the materializer doesn't implement yet.
    const manifest = buildScaffoldManifest();
    for (const m of manifest.modules) {
      for (const r of m.replaces) {
        expect(existsSync(path.join(ROOT, r.with)), `${m.slug}: missing replaces.with ${r.with}`).toBe(
          true,
        );
        expect(r.with, `${m.slug}: replaces.with must equal target in v1`).toBe(r.target);
      }
    }
  });

  it("codemod targets exist and ship in every profile (core-claimed or unclaimed)", () => {
    const manifest = buildScaffoldManifest();
    const nonCoreClaimed = new Set(
      manifest.modules.filter((m) => m.kind !== "core").flatMap((m) => m.files),
    );
    for (const t of manifest.codemodTargets) {
      expect(existsSync(path.join(ROOT, t)), `missing codemod target ${t}`).toBe(true);
      expect(
        nonCoreClaimed.has(t),
        `codemod target ${t} must ship in every profile (claimed by a non-core module)`,
      ).toBe(false);
    }
  });
});
