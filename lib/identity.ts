import { brand as brandDefaults } from "@/brand.config";

/**
 * Who owns this site's identity: `brand.config.ts`, or the admin database?
 *
 * Cartwright grew up assuming the admin panel is the source of truth. A site
 * built by an AI — the usage the engine markets itself for — assumes the code
 * is. Wherever the two disagreed, the database won **silently**: a downstream
 * fork toggled an unrelated feature flag and its live site renamed itself to
 * "Cartwright", in the header, the footer, and `llms.txt`.
 *
 * A partial guard already existed ("Phase H", `lib/data-source/brand.ts`), but
 * it was tied to the wrong axis: `mode === "website"`. What decides ownership is
 * not *what kind of site* this is — it is *where the configuration lives*. A
 * webshop configured in code needs the same protection a corporate site got.
 *
 * ## The policy
 *
 * - **`"auto"` (default)** — today's behaviour, exactly: website mode locks
 *   identity to config, webshop mode lets the DB win. Every branch below
 *   reproduces the old expression verbatim, so this value is byte-identical by
 *   construction rather than by review.
 * - **`"config"`** — identity is sovereign from `brand.config.ts` in every mode.
 *   The fix for code-configured forks.
 * - **`"db"`** — the DB wins in both modes. An escape hatch for a deliberate
 *   multi-tenant or white-label deployment.
 *
 * ## Why it is NOT a `brand.features.*` flag
 *
 * Two reasons, both disqualifying. `FeatureKey` is `keyof typeof brand.features`
 * and `lib/feature-flags/manifest.ts` types its descriptors as a
 * `Record<FeatureKey, …>`, so adding a key here would break compilation for
 * every fork that pulls engine code while keeping its own `brand.config.ts`.
 * And more fundamentally: `mergeFeatureOverrides` lets the database toggle
 * runtime flags. A protection a contaminated database could switch off is not a
 * protection.
 *
 * ## The sovereign set is deliberately narrow
 *
 * Only `storeName` and `ecommerceEnabled`. NOT `domain`/`url` — the setup
 * wizard's domain step writes them so sitemap/robots/canonical follow the
 * operator's real domain, and locking that would point every fork's canonicals
 * at the engine's. NOT `emails` — transactional mail must follow the verified
 * sending domain. NOT `tagline`/`logo` — cosmetics the admin legitimately owns.
 * NOT `industryTemplate` — its only rendered effect is design inference, and
 * nobody reads "coffee" as a brand name; it keeps the website-only lock.
 */

export type IdentityPolicy = "auto" | "config" | "db";

/** The configured policy, defaulting to `"auto"` for forks on an older config. */
export function identityPolicy(): IdentityPolicy {
  const raw = (brandDefaults as { identitySovereignty?: string })
    .identitySovereignty;
  return raw === "config" || raw === "db" ? raw : "auto";
}

/** True when identity comes from brand.config for the current policy + mode. */
export function isIdentityLocked(policy: IdentityPolicy = identityPolicy()): boolean {
  if (policy === "config") return true;
  if (policy === "db") return false;
  return brandDefaults.mode === "website";
}

/**
 * The store name a row is allowed to contribute.
 *
 * The `"auto"` branch is the pre-existing expression, character for character —
 * that is what makes the default byte-identical.
 */
export function sovereignStoreName(
  rowValue: string | null | undefined,
  policy: IdentityPolicy = identityPolicy(),
): string {
  if (policy === "config") return brandDefaults.storeName;
  if (policy === "db") return rowValue || brandDefaults.storeName;
  return brandDefaults.mode === "website"
    ? brandDefaults.storeName
    : rowValue || brandDefaults.storeName;
}

/**
 * Whether this site sells.
 *
 * Note the `"auto"` branch keeps the hard `false` for website mode rather than
 * reading `brandDefaults.ecommerceEnabled`. That is not tidiness — it preserves
 * the Phase G/H guarantee for an incoherent config (`mode: "website"` with
 * `ecommerceEnabled: true`), where the two differ.
 */
export function sovereignEcommerce(
  rowValue: boolean | null | undefined,
  policy: IdentityPolicy = identityPolicy(),
): boolean {
  if (policy === "config") return brandDefaults.ecommerceEnabled;
  if (policy === "db") return rowValue ?? brandDefaults.ecommerceEnabled;
  return brandDefaults.mode === "website"
    ? false
    : (rowValue ?? brandDefaults.ecommerceEnabled);
}

/** The sovereign fields. The narrow set — see the header for why. */
export const IDENTITY_FIELDS = ["storeName", "ecommerceEnabled"] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

/**
 * The name the admin uses for a sovereign field. Shown to whoever tried to
 * write one, so it has to read as English, not as a column list.
 *
 * A function rather than a `Record` literal on purpose. The hardcoded-identity
 * invariant in tests/unit/branding-create-defaults.test.ts flags any source
 * line that assigns a string literal to that column, and a label map looks
 * exactly like one — a false positive. Weakening a detector to fit a naming
 * coincidence is how detectors rot, so the code changes shape instead.
 * (The comment avoids the pattern for the same reason: the scan reads text,
 * not syntax, and a detector that its own documentation can trip is useless.)
 */
export function identityFieldLabel(field: IdentityField): string {
  return field === "storeName" ? "Store name" : "Webshop functionality";
}

/**
 * Whether the ADMIN refuses to persist identity — as opposed to whether the
 * RENDERER ignores it (`isIdentityLocked`).
 *
 * Deliberately the narrower of the two: only the explicit `"config"` opt-in.
 * Under `"auto"`, a website-mode shop's stored name is already inert at render
 * and has been since the Phase H lock — but changing what the admin *persists*
 * would be an observable behaviour change on every existing website-mode shop,
 * and `"auto"` means nothing changes. Those shops are one line of config away
 * from the honest version; they should not be moved there by surprise.
 */
export function identityWritesLocked(
  policy: IdentityPolicy = identityPolicy(),
): boolean {
  return policy === "config";
}

/**
 * Strip the sovereign fields from a write when the policy owns them.
 *
 * Under a locked policy a stored `storeName` **never renders** — the seam
 * replaces it on the way out. Persisting it anyway is the precise failure the
 * whole identity finding is about: an admin field that accepts input, reports
 * success, and changes nothing. The operator then debugs the storefront.
 *
 * So the write drops those fields and says which ones it dropped. Refusing the
 * *whole* save would be worse — the same form legitimately owns the headline,
 * the CTA and the locale, and none of those are locked.
 *
 * Returns the data to actually write plus the labels of what was ignored;
 * `ignored` is empty whenever the policy is unlocked, which is what makes this
 * a no-op for every shop that has not opted in.
 */
export function withoutLockedIdentity<T extends Partial<Record<IdentityField, unknown>>>(
  data: T,
  policy: IdentityPolicy = identityPolicy(),
): { data: Partial<T>; ignored: string[] } {
  if (!identityWritesLocked(policy)) return { data, ignored: [] };

  const out: Partial<T> = { ...data };
  const ignored: string[] = [];
  for (const field of IDENTITY_FIELDS) {
    if (field in data) {
      delete out[field];
      ignored.push(identityFieldLabel(field));
    }
  }
  return { data: out, ignored };
}

/** One sentence explaining WHY a field is locked, for the admin to render. */
export function identityLockNotice(
  policy: IdentityPolicy = identityPolicy(),
): string | null {
  return identityWritesLocked(policy)
    ? 'Owned by brand.config.ts (identitySovereignty: "config"). Edit it there — a value saved here would not render.'
    : null;
}

type IdentityBearingRow = {
  storeName?: string | null;
  ecommerceEnabled?: boolean | null;
};

/**
 * Normalise identity ON THE RAW ROW, at the seam.
 *
 * This is the load-bearing half. `getBrand()`'s merge was already guarded, yet
 * the fork's site still renamed itself — because `components/Header.tsx`,
 * `components/Footer.tsx` and `app/llms.txt/route.ts` read
 * `fetchBrandingSettings()` (the raw row) rather than the merged view. A lock is
 * only as strong as the number of paths that respect it, and counting paths by
 * review does not scale to paths that do not exist yet.
 *
 * Applying it here means every existing `settings?.storeName ?? brand.storeName`
 * call site keeps compiling and simply yields the sovereign value — so
 * "byte-identical when the policy is `auto`" is a structural property, not a
 * twelve-file audit.
 */
export function applyIdentitySovereignty<T extends IdentityBearingRow>(
  row: T | null,
  policy: IdentityPolicy = identityPolicy(),
): T | null {
  if (!row) return row;
  return {
    ...row,
    storeName: sovereignStoreName(row.storeName, policy),
    ecommerceEnabled: sovereignEcommerce(row.ecommerceEnabled, policy),
  };
}
