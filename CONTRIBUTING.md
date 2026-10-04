# Contributing to Cartwright

Thanks for wanting to make Cartwright better. This page explains where to report things,
how changes flow, and how to get a working dev setup.

## Where things live

Cartwright develops in a private engine repo and ships as a **public template mirror**:

- **[Teloz1870/cartwright-template](https://github.com/Teloz1870/cartwright-template)** —
  the public source that `npx create-cartwright` scaffolds from. **Open issues there.**
- The engine repo pushes to the mirror automatically (every `main` push lands on the
  mirror's `next` branch; tagged releases land on `main`). Fixes therefore land in the
  engine first and reach the mirror within about a minute.

## Reporting bugs & requesting features

- **Bugs / feature requests** → open an issue on
  [cartwright-template](https://github.com/Teloz1870/cartwright-template/issues). Include
  your engine version (`.cartwright/release.json` in a scaffolded project), your scaffold
  profile (`.cartwright/profile.json`), and reproduction steps.
- **Security vulnerabilities** → **never a public issue.** Follow
  [SECURITY.md](SECURITY.md) (GitHub private vulnerability reporting or
  `security@teloz.net`).

## Pull requests

PRs against the template mirror are welcome as **proposals**: because the mirror is a
one-way snapshot of the engine, a maintainer applies the accepted change in the engine and
it flows back out — your PR is then closed with a reference to the landing commit, and you
are credited in the commit message. Small, focused diffs with a test have the best odds.

Before submitting:

```bash
pnpm install
pnpm db:setup          # schema + seed (admin login → .admin-credentials)
pnpm dev               # boot check: /da (and /da/produkter in webshop mode)
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest unit suite
```

House rules that apply to every change (the agent rules files — `AGENTS.md`,
`.claude/CLAUDE.md` — carry the full versions):

- **Feature-gate anything non-trivial** behind `brand.features.*`, default **off**.
- **Don't rename `--color-sol-*` CSS tokens** or reuse the legacy eyewear Prisma fields
  (`frameColor`, `lensColor`, `brand`) — use `Product.attributes` (JSON).
- **No credentials in tracked files.** `.env*` (except `.env.example`), `.mcp.json`,
  `i18nexus.json` are gitignored; new config that needs keys ships as a `.example` stub.
- **Structured data is non-negotiable** — citable pages ship JSON-LD via
  `components/JsonLd.tsx`, server-side.
- Keep a11y basics: semantic landmarks, one `<h1>`, visible `:focus-visible`,
  `prefers-reduced-motion` guards on animation.

## Code of conduct

Participation in the project is covered by our
[Code of Conduct](CODE_OF_CONDUCT.md). Be kind; we ship better that way.

## License

Cartwright is [MIT-licensed](LICENSE). By contributing you agree that your contributions
are licensed under the same terms.
