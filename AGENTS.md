<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Run it & sign in (first time)

A fresh project is empty until the schema is created and the admin is seeded.
`npx create-cartwright` runs the steps below for you and prints the admin login — if you
scaffolded with it, skip to step 3. For a manual clone, run from the project root:

1. `pnpm install`
2. `pnpm db:setup` — creates the local SQLite schema **and** seeds the admin + demo data in one
   robust step. It tries `prisma db push`, and if that hits the flaky Prisma 7.8 `Schema engine
   error:`, it automatically **falls back to applying the schema via the libSQL client** (bypassing
   the schema engine), then seeds. It prints the admin **email + password** and writes them to
   **`.admin-credentials`** (gitignored) — but only on a successful first-run seed. Re-running is
   safe: it never re-seeds a DB that already has data.
3. `pnpm dev`, then open **`/account/login`** → **Password** tab:
   - Email = `brand.emails.admin` (from `brand.config.ts`).
   - Password = the value in `.admin-credentials` (`cat .admin-credentials`), or the `db:setup` output.
   - First login forces a password change at `/admin/konto`; then the `/admin/setup` wizard opens.

Notes: magic-link sign-in only appears once `RESEND_API_KEY` is set (in dev the link is written to
`.mail-previews/`) — until then **password is the only method, by design**. Pre-set a password by
exporting `ADMIN_PASSWORD` before `db:setup`. Boot error "Missing required env: AUTH_SECRET" → set
`AUTH_SECRET` (create-cartwright sets it; manual clones must add it to `.env.local`).

Locked out / wrong password? Run **`pnpm admin:reset`** (`ADMIN_PASSWORD=… pnpm admin:reset` for a
specific one). It resets ONLY the admin password — keeps all data — and rewrites `.admin-credentials`
so the file always matches the DB. **AI agents/scripts: use this, never `UPDATE User SET passwordHash …`
directly** — a raw update leaves `.admin-credentials` stale and makes a working login look broken.

Troubleshooting: the blank `Schema engine error:` from `prisma db push` is an **intermittent** Prisma
7.8 first-run crash (seen on macOS arm64 + Node 24) — it is NOT reliably transient, so "just run it
again" can keep failing. **`pnpm db:setup` is the fix**: it routes around the flaky schema-engine
connection by applying the schema with the libSQL client, so first-run can't get stuck. If `db:setup`
itself reports the schema engine "failed to start at all", switch to a tested LTS:
`nvm use 22 && pnpm db:setup`. If setup fails, **no admin exists yet** — `.admin-credentials` only
appears after a successful seed. Use `prisma db push` (schema-first), never `prisma migrate deploy`,
for local/dev databases.

To go from booted to **designed** (apply a Voice/Skin via the REST tool surface, terminal-only — no
browser needed), follow `.claude/CLAUDE.md` → "Your first 10 minutes".

# Agent rules files

This project ships per-tool rules so any IDE agent self-identifies as a Cartwright store.
They describe the same conventions — keep them consistent when you change one:

- `.claude/CLAUDE.md` — Claude Code (full project briefing).
- `.cursor/rules/cartwright.mdc` — Cursor.
- `.github/copilot-instructions.md` — GitHub Copilot.
- `GEMINI.md` — Gemini CLI / Antigravity.
- `.windsurfrules` — Windsurf.

Full vibe-coding prompt for paste-in tools (v0.dev, Bolt, Lovable): `docs/VIBE_PROMPTS.md`.
