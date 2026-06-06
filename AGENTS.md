<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent rules files

This project ships per-tool rules so any IDE agent self-identifies as a Cartwright store.
They describe the same conventions — keep them consistent when you change one:

- `.claude/CLAUDE.md` — Claude Code (full project briefing).
- `.cursor/rules/cartwright.mdc` — Cursor.
- `.github/copilot-instructions.md` — GitHub Copilot.
- `GEMINI.md` — Gemini CLI / Antigravity.
- `.windsurfrules` — Windsurf.

Full vibe-coding prompt for paste-in tools (v0.dev, Bolt, Lovable): `docs/VIBE_PROMPTS.md`.
