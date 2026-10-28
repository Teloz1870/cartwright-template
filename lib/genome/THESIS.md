# Resolution is all you need

The thesis behind `lib/genome/` — Cartwright's "transformer moment."

## The discovery

The transformer wasn't a feature. It replaced a zoo of task-specific
architectures with **one representation + one operation applied uniformly**, and
capability *emerged* from that uniformity.

Cartwright had already, independently, reinvented one pattern **three times**:

| Subsystem | apply core | DB blob | resolve-on-read | LLM? |
|---|---|---|---|---|
| Feature flags | `lib/feature-flags/apply.ts` | `featureOverridesJson` | `mergeFeatureOverrides()` | no |
| Live Canvas | `lib/three/apply.ts` | `threeDConfigJson` | `lib/three/resolve.ts` | no |
| SEO generators | — | Category/Product rows | (generated ahead) | **yes** |

All five share the same skeleton: `apply(field, value, actor)` → DB override →
resolve-on-read with a 30s cache → allowlist-gated → audited → admin-UI **and**
an AI tool call the same core. Two do it without a model; one does it with.

Three siblings that didn't know they were siblings.

## The primitive

Make *every* business fact one thing — a `Resolvable<T>`:

```
anchor      config default (the flag-off / render value)
override    human- or AI-set value (wins)
resolver    typed generateObject conditioned on the identity anchors
lock        "anchored" (never LLM — legal/identity) | "resolvable"
dependsOn   which identity anchors invalidate this field
```

…and one operation, split for safety:

```
readField(key)     render path. override ?? resolved-cache@deps ?? anchor.
                   NEVER calls an LLM. Flag-off / empty cache = the anchor.
resolveField(key)  triggered (admin/AI/reharmonize). runs the resolver,
                   validates, writes back to the resolved-cache under audit.
```

The **dependency graph is the attention map**: `depsKey(field, deps)` keys a
resolved value by exactly the anchors it depends on, so changing `tone`
invalidates only tone-dependent fields. Change one identity anchor →
`reharmonizeAll` re-resolves every dependent field coherently. Rebrand = edit one
field, not 400 strings.

## Why the emergent properties fall out

- **Self-building** — a resolvable field with no override resolves itself on
  trigger; `describeBusiness` infers the whole identity from one sentence and
  reharmonizes. Sparse seed → dense shop.
- **Self-harmonizing** — the dependency graph + cache invalidation make a
  one-anchor change re-resolve the surface. (A3)
- **Drift becomes structurally impossible** — one resolution path; the field
  allowlist (`GENOME_FIELD_KEYS`) can never address
  `mode`/`ecommerceEnabled`/`industryTemplate`. The Phase G/H class of bug cannot
  recur here.

## The honest disanalogy

This is **not** a new ML architecture. The intelligence is borrowed from an LLM
at resolve-time; the invention is the *commerce architecture* that makes an LLM
the resolution substrate — with an anchored/resolvable split for trust and a
dependency-keyed cache for cost. The render path never calls a model, so the
storefront stays instant, free, and fail-soft. That split + cache is the real
engineering, and it's what makes the idea shippable rather than a manifesto.

## Thesis spike — the three siblings ARE this primitive

Neither of the two non-LLM siblings is migrated (that would risk the canaries),
but each is expressible as a `Resolvable` with no resolver — i.e. the genome is a
strict superset:

```ts
// Live Canvas intensity, expressed as a Resolvable<number> (illustrative):
const threeDIntensity: Resolvable<number> = {
  anchor: brand.threeD.intensity,           // 0.7
  lock: "resolvable",                        // an AI *could* tune it…
  dependsOn: ["vibe"],                       // …to the brand vibe
  schema: z.number().min(0).max(1),
  label: "3D intensity",
  resolver: async (deps) => vibeToIntensity(deps.vibe), // optional
};
// readField → override ?? resolved ?? 0.7  — identical to getActiveThreeDConfig's
// merge, minus the bespoke parse/clamp/cache code, because the genome provides it.

// A feature flag, expressed as a Resolvable<boolean>:
const reviewsFlag: Resolvable<boolean> = {
  anchor: brand.features.reviews,            // false
  lock: "anchored",                          // identity/runtime gate — never LLM
  dependsOn: [],
  schema: z.boolean(),
  label: "reviews",
};
// readField → override ?? false — exactly mergeFeatureOverrides for one key.
```

The point isn't to rip out the working subsystems. It's that they are three
hand-rolled instances of *this* shape. Once the genome is the substrate, a new
channel/field/flag is a registry entry, not a new subsystem — the same way a new
NLP task stopped being a new architecture after attention.

You no longer *build* shops. You *resolve* them from intent.
