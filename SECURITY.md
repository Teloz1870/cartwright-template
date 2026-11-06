# Security Policy

Cartwright is the open-source engine behind real, money-handling storefronts (cart,
checkout, Stripe, magic-link auth, an AI tool surface). We take security reports
seriously and want to make responsible disclosure easy.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.** Public issues
disclose the flaw to attackers before a fix is available.

Report privately through either channel:

1. **GitHub private vulnerability reporting** (preferred) — on the
   [cartwright-template](https://github.com/Teloz1870/cartwright-template) repository,
   go to **Security → Report a vulnerability**. This opens a private advisory thread
   only you and the maintainers can see.
2. **Email** — `security@teloz.net`. Encrypt if you can; otherwise plain email is fine.
   Use a clear subject line (e.g. "Cartwright security report").

Please include, as far as you can:

- the affected version or commit (`.cartwright/release.json` in a scaffolded shop, or
  the git SHA / template tag),
- a description of the issue and its impact,
- reproduction steps or a proof-of-concept,
- any suggested remediation.

## What to expect

- **Acknowledgement** within **3 business days**.
- An initial assessment (severity + whether we can reproduce) within **7 business days**.
- We will keep you updated on progress and let you know when a fix ships.
- We practice **coordinated disclosure**: we ask that you give us a reasonable window
  (typically up to 90 days) to release a fix before any public write-up, and we are happy
  to credit you in the advisory unless you prefer to remain anonymous.

## Safe harbor

We will not pursue or support legal action against researchers who:

- act in good faith and avoid privacy violations, data destruction, and service degradation,
- only interact with accounts and data they own or have explicit permission to test,
- give us a reasonable time to remediate before public disclosure,
- and do not exfiltrate more data than is necessary to demonstrate the issue.

If you are unsure whether an action is acceptable, ask us first via one of the channels above.

## Supported versions

Cartwright ships as **tagged template snapshots** — `npx create-cartwright` scaffolds the
template at the current release tag, and a scaffolded shop is a one-shot copy that nothing
updates automatically. Security fixes land on the **latest release line**; to receive one,
a shop pulls the relevant engine change into its fork.

| Version line | Supported |
|---|---|
| Latest tagged release | ✅ Security fixes |
| Older tags | ⚠️ Best-effort — upgrade to the latest line |
| `main` / unreleased | ✅ Fixes land here first |

The canonical place to learn whether the engine version your shop runs has a known fix is
the **[🔒 Security advisories index in `CHANGELOG.md`](CHANGELOG.md#-security-advisories)**.
When a release fixes a security issue, its version block gets a `### 🔒 Security` section
(issue + severity + the version to upgrade to) **and** a row is added to that index. Compare
your `.cartwright/release.json` marker against it.

The full versioning & stability contract — what counts as a breaking change, the deprecation
window, and how to pull an engine fix into your shop — is in
[`docs/versioning-policy.md`](docs/versioning-policy.md).

## Scope

**In scope** — vulnerabilities in the Cartwright engine itself and in the code it scaffolds:
authentication/authorization (admin, API keys, scopes, the MCP/tool surface), the
storefront and checkout/payment flows, the AI tool boundary (e.g. a shopper-facing path
reaching an admin-write tool), SSR/data-handling, injection, and secret handling.

**Out of scope** — issues that are not a flaw in this codebase:

- a customer's own deployment misconfiguration (exposed env vars, weak admin password,
  permissive infra), or self-XSS requiring the victim to paste attacker code,
- vulnerabilities in third-party services Cartwright integrates with (Stripe, Turso,
  Vercel, Resend, etc.) — report those to the respective vendor,
- missing security headers or rate limits on a *self-hosted* deployment the operator has
  reconfigured away from the shipped defaults,
- social engineering, physical access, and denial-of-service via volumetric traffic,
- reports generated solely by automated scanners with no demonstrated impact.

When in doubt, send it anyway — we would rather triage an out-of-scope report than miss a
real one.

## A note for shop operators

Cartwright stores hold real customer and order data. Beyond the engine's defaults, you are
responsible for the security of your own deployment: keep `AUTH_SECRET` and all API keys
out of tracked files, rotate the seeded admin password on first login, keep your engine
version current against the advisories index above, and review the hardening notes in the
project docs before going live.
