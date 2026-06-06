<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Run it & sign in (first time)

A fresh project is empty until the schema is created and the admin is seeded.
`npx create-cartwright` runs the steps below for you and prints the admin login — if you
scaffolded with it, skip to step 4. For a manual clone, run from the project root:

1. `pnpm install`
2. `npx prisma db push` — create the local SQLite schema (`dev.db`)
3. `npx prisma db seed` — create the admin user + demo data. This prints the admin **email +
   password** and writes them to **`.admin-credentials`** (gitignored) in the project root.
4. `pnpm dev`, then open **`/account/login`** → **Password** tab:
   - Email = `brand.emails.admin` (from `brand.config.ts`).
   - Password = the value in `.admin-credentials` (`cat .admin-credentials`), or the `db seed` output.
   - First login forces a password change at `/admin/konto`; then the `/admin/setup` wizard opens.

Notes: magic-link sign-in only appears once `RESEND_API_KEY` is set (in dev the link is written to
`.mail-previews/`) — until then **password is the only method, by design**. Pre-set a password by
exporting `ADMIN_PASSWORD` before `db seed`. Boot error "Missing required env: AUTH_SECRET" → set
`AUTH_SECRET` (create-cartwright sets it; manual clones must add it to `.env.local`).

Troubleshooting: if `npx prisma db push` exits with a blank `Schema engine error:`, just run it again —
it's a transient Prisma 7.8 first-run hiccup, not a config problem. Always use `prisma db push` (the
schema-first path), never `prisma migrate deploy`, for local/dev databases.

# Agent rules files

This project ships per-tool rules so any IDE agent self-identifies as a Cartwright store.
They describe the same conventions — keep them consistent when you change one:

- `.claude/CLAUDE.md` — Claude Code (full project briefing).
- `.cursor/rules/cartwright.mdc` — Cursor.
- `.github/copilot-instructions.md` — GitHub Copilot.
- `GEMINI.md` — Gemini CLI / Antigravity.
- `.windsurfrules` — Windsurf.

Full vibe-coding prompt for paste-in tools (v0.dev, Bolt, Lovable): `docs/VIBE_PROMPTS.md`.
