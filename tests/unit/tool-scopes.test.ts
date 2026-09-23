/**
 * Registry-wide scope invariants.
 *
 * registry.test.ts proves invokeTool gates ONE tool correctly (403 on missing
 * scope). scopes.test.ts proves hasScope/isValidScope and that the customer
 * scope LIST excludes admin writes. Neither proves the property across the
 * WHOLE registry: that *every* registered tool carries a scope the runtime
 * actually knows, that the public MCP manifest is scope-sound, that the
 * /admin/api-keys grouping stays in sync with SCOPES (a documented "update
 * both" requirement), and that no tool reachable by the shopper chat is an
 * admin-write tool (the moat). A scope typo, a tool added without a scope, or a
 * grouping left un-updated would pass tsc but break (or silently weaken
 * security) at runtime. These are the fail-safe invariants.
 */
import { describe, it, expect } from "vitest";
import { listTools, buildToolManifest } from "@/lib/tools/registry";
import {
  SCOPES,
  SCOPE_GROUPS,
  CUSTOMER_CHAT_SCOPES,
  isValidScope,
  hasScope,
  type Scope,
} from "@/lib/scopes";

/** Admin-domain write scopes the shopper chat must never be able to reach. */
const ADMIN_WRITE_SCOPES: readonly Scope[] = [
  "products:write",
  "categories:write",
  "pages:write",
  "discounts:write",
  "settings:write",
  "features:write",
  "marketing:write",
  "audit:revert",
];

describe("registry scope invariants", () => {
  it("every registered tool carries a runtime-valid scope", () => {
    const offenders = listTools()
      .filter((t) => !isValidScope(t.scope))
      .map((t) => `${t.name} -> ${String(t.scope)}`);
    // Message lists the culprits so a future failure is self-explanatory.
    expect(offenders).toEqual([]);
  });

  it("every tool's scope is one of the SCOPES catalogue", () => {
    const known = new Set<string>(SCOPES);
    for (const tool of listTools()) {
      expect(known.has(tool.scope)).toBe(true);
    }
  });

  it("the public tool manifest is scope-sound and complete", () => {
    const manifest = buildToolManifest();
    // One manifest entry per registered tool (the MCP/discovery surface).
    expect(manifest.length).toBe(listTools().length);
    for (const entry of manifest) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(isValidScope(entry.scope)).toBe(true);
    }
  });
});

describe("scope ↔ api-key grouping stays in sync", () => {
  // scopes.ts documents: "Når nye scopes tilføjes: opdater både SCOPES og denne
  // grouping." This enforces that contract so the /admin/api-keys checkboxes can
  // never silently drop (or invent) a scope.
  const grouped = Object.values(SCOPE_GROUPS).flat();

  it("every SCOPES entry appears in exactly one SCOPE_GROUPS bucket", () => {
    for (const scope of SCOPES) {
      const occurrences = grouped.filter((s) => s === scope).length;
      expect(occurrences, `scope "${scope}" must be grouped exactly once`).toBe(1);
    }
  });

  it("every grouped scope is a real SCOPES entry (no orphans)", () => {
    for (const scope of grouped) {
      expect(isValidScope(scope), `grouped scope "${scope}" is not in SCOPES`).toBe(true);
    }
  });
});

describe("shopper-chat moat — no admin-write tool is customer-reachable", () => {
  it("no registered tool with an admin-write scope is reachable by CUSTOMER_CHAT_SCOPES", () => {
    const leaks = listTools()
      .filter(
        (t) =>
          ADMIN_WRITE_SCOPES.includes(t.scope) &&
          hasScope(CUSTOMER_CHAT_SCOPES, t.scope),
      )
      .map((t) => `${t.name} (${t.scope})`);
    // If this ever fails, a shopper session could escalate to admin CRUD.
    expect(leaks).toEqual([]);
  });

  it("CUSTOMER_CHAT_SCOPES grants none of the admin-write scopes", () => {
    for (const s of ADMIN_WRITE_SCOPES) {
      expect(hasScope(CUSTOMER_CHAT_SCOPES, s)).toBe(false);
    }
  });
});
