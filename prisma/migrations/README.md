# Migrations — the baseline contract

The single `00000000000000_init` migration IS the schema baseline: it is
GENERATED from `prisma/schema.prisma` and must never drift from it. CI runs
`pnpm db:verify` (`prisma migrate diff --from-migrations … --to-schema … --exit-code`)
on every PR and fails on any difference.

Changed `schema.prisma`? Regenerate the baseline in the same PR:

```bash
pnpm --silent exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma \
  --script -o prisma/migrations/00000000000000_init/migration.sql
pnpm db:verify   # must exit 0
```

Local/dev databases use `pnpm db:push` / `pnpm db:setup` (schema-first, never
`migrate deploy`) — the baseline exists for migrate-based flows (fresh Postgres,
hosted environments, and the future incremental-migration story after the
launch freeze; see docs/versioning-policy.md).

History: the baseline was regenerated 2026-07-15 (launch audit) after silently
drifting 4 tables (OAuthClient/OAuthAuthCode/OAuthToken/RegistryHit) + 3 ALTERs
behind the schema — dev's `db push` path hid it.
