import { describe, it, expect } from "vitest";
import { allVerticals } from "@/verticals";
import { VERTICAL_OPTIONS } from "@/verticals/options";
import { GENOME_FIELDS, isGenomeFieldKey } from "@/lib/genome/fields";
import { validateIdentity } from "@/lib/genome/identity";
import { isSceneId } from "@/lib/three/scenes/registry";

/**
 * Validates every Vertical / Voice preset against the REAL genome field schemas
 * + identity rules — so a typo or an over-length string in a preset fails here,
 * not at apply time. No server / DB needed (validateIdentity + field.schema are
 * pure).
 */
describe("vertical presets", () => {
  const verticals = allVerticals();

  it("har mindst én preset", () => {
    expect(verticals.length).toBeGreaterThan(0);
  });

  it("options spejler registry (slugs matcher)", () => {
    expect(VERTICAL_OPTIONS.map((o) => o.slug).sort()).toEqual(
      verticals.map((v) => v.slug).sort(),
    );
  });

  it("slugs er unikke + kebab-case", () => {
    const slugs = verticals.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  for (const v of verticals) {
    describe(v.slug, () => {
      it("identity-ankre er gyldige", () => {
        for (const [k, val] of Object.entries(v.identity)) {
          expect(validateIdentity(k, val as string), `${v.slug}.identity.${k}`).toBeNull();
        }
      });

      it("genome-overrides er gyldige felter med schema-gyldige værdier", () => {
        const entries = Object.entries(v.genomeOverrides);
        expect(entries.length).toBeGreaterThan(0);
        for (const [k, val] of entries) {
          expect(isGenomeFieldKey(k), `${v.slug}: ukendt felt ${k}`).toBe(true);
          if (isGenomeFieldKey(k)) {
            const p = GENOME_FIELDS[k].schema.safeParse(val);
            expect(
              p.success,
              `${v.slug}.${k}: ${p.success ? "" : p.error.issues[0]?.message}`,
            ).toBe(true);
          }
        }
      });

      it("palette (hvis sat) er 6 gyldige hex-farver", () => {
        if (!v.palette) return;
        for (const [k, hex] of Object.entries(v.palette)) {
          expect(
            /^#[0-9a-fA-F]{6}$/.test(hex as string),
            `${v.slug}.palette.${k}=${hex}`,
          ).toBe(true);
        }
      });

      it("scene (hvis sat) er en gyldig SceneId", () => {
        if (v.scene) expect(isSceneId(v.scene)).toBe(true);
      });
    });
  }
});
