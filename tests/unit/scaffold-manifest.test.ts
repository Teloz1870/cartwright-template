import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildScaffoldManifest } from "../../scripts/gen-scaffold-manifest";
import { profileCapabilities as engineCapabilities } from "../../lib/profile-capabilities";
import { profileCapabilities as siteCapabilities } from "../../lib/profile-capabilities.static";
import { ENGINE_ONLY_PENDING_PROFILES } from "@/scaffold/engine-only";
import { isEngineCheckout } from "../helpers/claims";

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

  it("emits the ownership ledger, and every path in it exists on disk", () => {
    // The CLI reads the JSON, not scaffold/engine-only.ts — so the guarantee
    // has to hold at the manifest level too. A stale `engineOnly` entry means
    // the materializer deletes a path that moved (silently, `rmSync` on a
    // missing path is a no-op) and keeps the file that replaced it.
    const manifest = buildScaffoldManifest() as unknown as {
      engineOnly: { path: string; reason: string }[];
      shipsEverywhere: { path: string; reason: string }[];
      modules: { slug: string; files: string[] }[];
    };
    expect(manifest.engineOnly.length).toBeGreaterThan(0);
    expect(manifest.shipsEverywhere.length).toBeGreaterThan(0);
    for (const e of [...manifest.engineOnly, ...manifest.shipsEverywhere]) {
      // On-disk existence is an ENGINE fact. This file ships to a `full`
      // scaffold (light prunes it, site prunes tests/unit wholesale), and the
      // day the CLI honours `engineOnly` those paths are gone from the
      // customer's tree by design — asserting them there is the #550/#551/#572
      // shape: red in a scaffold while every engine gate is green.
      if (isEngineCheckout) {
        expect(existsSync(path.join(ROOT, e.path)), `ledger: missing ${e.path}`).toBe(true);
      }
      expect(e.reason.length, `ledger: ${e.path} has no real reason`).toBeGreaterThan(40);
    }
    // No module may claim an engine-only path: a profile "may keep this" and
    // "no customer ever gets this" cannot both be true of one file.
    const claimed = manifest.modules.flatMap((m) => m.files);
    for (const e of manifest.engineOnly) {
      const owner = manifest.modules.find((m) =>
        m.files.some((f) => f === e.path || e.path.startsWith(`${f}/`)),
      );
      expect(owner?.slug, `${e.path} is engine-only AND claimed by a module`).toBeUndefined();
    }
    expect(claimed).not.toContain("CHANGELOG.md");
  });

  /**
   * MF1. `engineOnly` is an instruction that leaves this repository: the CLI
   * reads it out of the template snapshot and deletes what it names. Its
   * SAFETY CONDITION — those paths may only be deleted where the materialised
   * capability file reads `engineMarketing: false` — used to live in engine
   * source and an engine unit test, i.e. entirely on our side of the boundary
   * the instruction crosses. So the engine went red only when the PROFILE
   * GRAPH moved, never when a B4 author wired the deletion, which is the exact
   * failure the ledger was supposed to prevent.
   *
   * This test is the interlock the manifest can actually hold: the hazard may
   * not be published without the condition, and the condition may not decay
   * into a decorative string. It cannot make a CLI read the field — nothing in
   * this repository can. It makes ignoring it a deliberate deletion in a diff.
   */
  it("never publishes `engineOnly` without the gate that says when deleting is safe", () => {
    const manifest = buildScaffoldManifest() as unknown as {
      engineOnly: { path: string }[];
      engineOnlyGate?: {
        capability: string;
        seam: string;
        pendingProfiles: readonly string[];
        note: string;
      };
      modules: { slug: string; seams: string[] }[];
      profiles: { name: string }[];
    };
    if (manifest.engineOnly.length === 0) return; // nothing to guard.

    const gate = manifest.engineOnlyGate;
    expect(
      gate,
      "scaffold/manifest.json publishes `engineOnly` (delete these from a customer's scaffold) " +
        "but not `engineOnlyGate` (when that is safe). The CLI reads this file and nothing else, " +
        "so dropping the gate hands the hazard across the repo boundary with the caveat left " +
        "behind — see scripts/gen-scaffold-manifest.ts.",
    ).toBeDefined();

    // The capability must be a REAL key, present in BOTH twins — a gate naming
    // a key that only one variant defines reads `undefined` (falsy) in the
    // other, which is the silently-disappearing-link failure.
    expect(Object.keys(engineCapabilities)).toContain(gate!.capability);
    expect(Object.keys(siteCapabilities)).toContain(gate!.capability);
    expect(engineCapabilities[gate!.capability as "engineMarketing"]).toBe(true);
    expect(siteCapabilities[gate!.capability as "engineMarketing"]).toBe(false);

    // The seam must be a seam this manifest actually declares, so moving the
    // capability file renames the gate's target instead of orphaning it.
    const seams = new Set(manifest.modules.flatMap((m) => m.seams));
    expect(seams, `engineOnlyGate.seam names ${gate!.seam}, which is not a declared seam`).toContain(
      gate!.seam,
    );

    // One list, one owner: the published set is the engine's constant, not a
    // second copy that can drift.
    expect(gate!.pendingProfiles).toEqual([...ENGINE_ONLY_PENDING_PROFILES]);
    const profiles = new Set(manifest.profiles.map((p) => p.name));
    for (const name of gate!.pendingProfiles) {
      expect(profiles, `engineOnlyGate names unknown profile "${name}"`).toContain(name);
    }

    // And the human-readable half has to still say the thing. A B4 author who
    // opens the JSON reads this sentence, not our docblocks.
    expect(gate!.note).toContain(gate!.capability);
    expect(gate!.note).toContain("pendingProfiles");
    expect(gate!.note.length).toBeGreaterThan(120);
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

  it("materializes truthful agent-interface capabilities per profile", () => {
    const manifest = buildScaffoldManifest();
    const core = manifest.modules.find((module) => module.slug === "core");
    const mcp = manifest.modules.find((module) => module.slug === "mcp");

    expect(engineCapabilities).toMatchObject({
      agentApi: true,
      accountAndAdmin: true,
      supportTriage: true,
      dbPages: true,
      trustPages: true,
      engineMarketing: true,
    });
    expect(siteCapabilities).toEqual({
      agentApi: false,
      accountAndAdmin: false,
      // No admin → no /api/support/triage; the contact form must not POST there.
      supportTriage: false,
      // No pages-db → no app/[locale]/services; the header must not link it.
      dbPages: false,
      // No trust-pages → no app/[locale]/{about,privacy}; the footers must not
      // link them, and the static sitemap must not advertise them (owner CW-24).
      trustPages: false,
      // Cartwright's own marketing routes are engine-only (scaffold/engine-only.ts).
      engineMarketing: false,
      publicFeatureKeys: [],
    });
    // The twins must stay the same SHAPE: a capability added to one and not the
    // other reads `undefined` in a scaffold, which is falsy — a link would
    // silently disappear instead of failing loudly.
    expect(Object.keys(siteCapabilities).sort()).toEqual(Object.keys(engineCapabilities).sort());
    expect(core?.seams).toContain("lib/profile-capabilities.ts");
    expect(mcp?.replaces).toContainEqual({
      target: "lib/profile-capabilities.ts",
      with: "lib/profile-capabilities.ts",
    });
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
