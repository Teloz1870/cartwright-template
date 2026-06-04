/**
 * Stack — Cartwright Studio's third premium design.
 *
 * Dark-mode-first developer-tools landing page. Terminal hero with
 * typed command + animated output, code-block feature cards, monospace
 * everywhere meta. Built for dev SaaS, AI APIs, infrastructure.
 *
 * Server Component. Uses cw-caret-blink + cw-typed-line CSS animations
 * fra themes/studio.css (genbruges på tværs af designs der vil have
 * terminal-typed-effect). Hvis Studio CSS ikke er importeret er
 * animationerne bare statiske — design fungerer stadig.
 */
import Link from "next/link";
import type { DesignHomepageProps } from "../types";

export default function StackHomepage({ settings }: DesignHomepageProps) {
  const headline = settings?.websiteHeadline || "Build, ship, scale.";
  const tagline =
    settings?.tagline ||
    "Cartwright is the open-source AI commerce template. One command from idea to production.";
  const installCommand = "npx create-cartwright@latest";

  return (
    <div className="min-h-screen bg-st-cream font-sans text-st-ink">
      {/* ───── 1. TERMINAL HERO ───── */}
      <section className="relative overflow-hidden border-b border-st-line">
        {/* Background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-st-glow blur-[120px]"
        />

        <div className="relative mx-auto max-w-5xl px-6 pb-32 pt-28 sm:pt-36">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-st-accent/30 bg-st-accent/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-st-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-st-accent" />
              v0.7 · shipping today
            </span>

            <h1 className="mt-8 text-5xl font-medium leading-[1.05] tracking-tight text-st-ink sm:text-7xl md:text-[5.5rem]">
              {headline}
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-st-muted sm:text-xl">
              {tagline}
            </p>
          </div>

          {/* Terminal window */}
          <div className="mx-auto mt-16 max-w-3xl">
            <div className="overflow-hidden rounded-lg border border-st-code-border bg-st-code-bg shadow-2xl shadow-st-glow">
              {/* Title bar */}
              <div className="flex items-center gap-2 border-b border-st-line bg-st-sand px-4 py-3">
                <div className="size-3 rounded-full bg-red-500/60" />
                <div className="size-3 rounded-full bg-yellow-500/60" />
                <div className="size-3 rounded-full bg-green-500/60" />
                <span className="ml-3 font-mono text-[11px] text-st-muted">
                  ~/projects · zsh
                </span>
              </div>

              {/* Terminal body */}
              <div className="px-6 py-8 font-mono text-sm leading-relaxed sm:text-base">
                <div className="flex items-baseline gap-3">
                  <span className="text-st-prompt">$</span>
                  <span className="cw-typed-line text-st-ink">
                    {installCommand}
                  </span>
                  <span className="cw-caret inline-block h-4" aria-hidden />
                </div>
                <div className="cw-typed-output mt-4 space-y-1 text-st-muted">
                  <div>
                    <span className="text-st-cyan">◇</span> Project name?{" "}
                    <span className="text-st-ink">my-shop</span>
                  </div>
                  <div>
                    <span className="text-st-cyan">◇</span> AI provider?{" "}
                    <span className="text-st-ink">Anthropic</span>
                  </div>
                  <div>
                    <span className="text-st-cyan">◇</span> Database?{" "}
                    <span className="text-st-ink">Turso</span>
                  </div>
                  <div className="pt-3 text-st-accent">
                    ✓ Cloning template · installing deps · seeding DB
                  </div>
                  <div className="text-st-accent">
                    ✓ Ready in 18s · cd my-shop && pnpm dev
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA row */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/info"
              className="inline-flex h-12 items-center gap-2 rounded-md bg-st-accent px-6 font-mono text-sm font-semibold uppercase tracking-wide text-st-cream transition-colors hover:bg-st-accent-deep"
            >
              Read the docs →
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center gap-2 rounded-md border border-st-line bg-st-sand px-6 font-mono text-sm text-st-ink transition-colors hover:border-st-accent/40 hover:text-st-accent"
            >
              <span className="text-st-muted">$</span> Get in touch
            </Link>
          </div>

          <p className="mt-8 text-center font-mono text-xs text-st-muted">
            MIT licensed · Self-hosted · Zero runtime cost
          </p>
        </div>
      </section>

      {/* ───── 2. STAT STRIP ───── */}
      <section className="border-b border-st-line bg-st-cream">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-st-line md:grid-cols-4">
          {[
            { label: "Cold start", value: "<200ms" },
            { label: "Built on", value: "Next.js 16" },
            { label: "AI providers", value: "5+" },
            { label: "MCP tools", value: "27" },
          ].map((stat) => (
            <div key={stat.label} className="bg-st-cream px-6 py-8 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-st-muted">
                {stat.label}
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-st-accent">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ───── 3. CODE-BLOCK FEATURES (6 cards) ───── */}
      <section className="border-b border-st-line bg-st-cream py-32">
        <div className="mx-auto max-w-6xl px-6">
          <header className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-st-accent">
              The API surface
            </p>
            <h2 className="mt-4 text-4xl font-medium tracking-tight text-st-ink sm:text-5xl">
              Code, not configuration.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-st-muted">
              Every feature ships with a real working snippet. Copy-paste it
              into your editor, change the names, you&apos;re done.
            </p>
          </header>

          <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-st-line bg-st-line md:grid-cols-2">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="flex flex-col gap-4 bg-st-cream p-8 transition-colors hover:bg-st-sand"
              >
                <div className="flex items-center gap-3">
                  <span className="size-1.5 rounded-full bg-st-accent" />
                  <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-st-ink">
                    {f.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-st-muted">{f.body}</p>
                <pre className="mt-2 overflow-x-auto rounded-md border border-st-code-border bg-st-code-bg p-4 font-mono text-[12px] leading-relaxed text-st-ink">
                  <code dangerouslySetInnerHTML={{ __html: f.code }} />
                </pre>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ───── 4. THE STACK — monospace cells ───── */}
      <section className="border-b border-st-line bg-st-cream py-32">
        <div className="mx-auto max-w-6xl px-6">
          <header className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-st-accent">
              $ npm ls --depth 0
            </p>
            <h2 className="mt-4 text-4xl font-medium tracking-tight text-st-ink sm:text-5xl">
              No legacy. All current versions.
            </h2>
          </header>

          <ul className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-st-line bg-st-line sm:grid-cols-3 lg:grid-cols-5">
            {[
              "next@16",
              "react@19",
              "typescript@6",
              "tailwindcss@4",
              "prisma@6",
              "stripe@latest",
              "@anthropic-ai/sdk",
              "@google/genai",
              "ollama@0.5",
              "vercel-ai@6",
              "next-auth@5",
              "resend@4",
              "sentry@8",
              "zod@4",
              "@modelcontextprotocol/sdk",
            ].map((pkg) => (
              <li
                key={pkg}
                className="flex items-center justify-center bg-st-cream px-3 py-5 text-center transition-colors hover:bg-st-sand"
              >
                <span className="font-mono text-xs text-st-ink">
                  <span className="text-st-muted">·</span> {pkg}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───── 5. HOW IT WORKS — 3 steps with monospace commands ───── */}
      <section className="border-b border-st-line bg-st-cream py-32">
        <div className="mx-auto max-w-6xl px-6">
          <header className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-st-accent">
              From zero to selling
            </p>
            <h2 className="mt-4 text-4xl font-medium tracking-tight text-st-ink sm:text-5xl">
              Three commands. Five minutes.
            </h2>
          </header>

          <ol className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-st-line bg-st-line md:grid-cols-3">
            {[
              {
                n: "01",
                title: "Scaffold",
                body: "Pick a database, AI provider, name. The CLI clones a sanitised template, generates AUTH_SECRET, and installs.",
                code: "npx create-cartwright my-shop",
              },
              {
                n: "02",
                title: "Configure",
                body: "Visit /admin/setup. Add Stripe + Resend + Anthropic keys through a UI. Keys persist DB-first.",
                code: "pnpm dev",
              },
              {
                n: "03",
                title: "Ship",
                body: "Push to Vercel. Cron jobs, AI gateway, and migrations are all wired into the deploy.",
                code: "vercel --prod",
              },
            ].map((step) => (
              <li
                key={step.n}
                className="flex flex-col gap-4 bg-st-cream p-8 transition-colors hover:bg-st-sand"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-st-accent">
                  step {step.n}
                </p>
                <h3 className="text-2xl font-medium tracking-tight text-st-ink">
                  {step.title}
                </h3>
                <p className="flex-1 text-sm leading-relaxed text-st-muted">
                  {step.body}
                </p>
                <pre className="overflow-x-auto rounded-md border border-st-code-border bg-st-code-bg px-3 py-2 font-mono text-xs leading-relaxed text-st-ink">
                  <code>
                    <span className="text-st-prompt">$</span> {step.code}
                  </code>
                </pre>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───── 6. FINAL CTA — terminal-style ───── */}
      <section className="border-b border-st-line bg-st-cream py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-4xl font-medium tracking-tight text-st-ink sm:text-5xl">
            Build something real this week.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-st-muted">
            Open-source. Self-hosted. Zero vendor lock-in.
          </p>

          <div className="mx-auto mt-12 max-w-xl rounded-lg border border-st-code-border bg-st-code-bg p-5 text-left shadow-2xl shadow-st-glow">
            <div className="flex items-baseline gap-3 font-mono text-base">
              <span className="text-st-prompt">$</span>
              <span className="text-st-ink">{installCommand}</span>
            </div>
          </div>

          <p className="mt-6 font-mono text-xs text-st-muted">
            Or{" "}
            <Link
              href="/info"
              className="text-st-cyan underline-offset-4 hover:underline"
            >
              read the docs
            </Link>{" "}
            first.
          </p>
        </div>
      </section>
    </div>
  );
}

// ── Feature data ───────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: "Magic-link auth",
    body: "NextAuth + Resend. No third-party identity vendor lock-in.",
    code:
      '<span class="text-st-magenta">await</span> signIn(<span class="text-st-cyan">"resend"</span>, {<br/>  email: <span class="text-st-cyan">"you@example.com"</span>,<br/>});',
  },
  {
    title: "Stripe checkout",
    body: "DB-first secret keys. Test mode and live mode toggled from admin.",
    code:
      '<span class="text-st-magenta">const</span> session = <span class="text-st-magenta">await</span> stripe.checkout<br/>  .sessions.<span class="text-st-cyan">create</span>({ line_items, mode });',
  },
  {
    title: "MCP server",
    body: "Built-in /api/mcp with a tool registry — agents talk natively.",
    code:
      '<span class="text-st-magenta">GET</span> /api/mcp<br/><span class="text-st-muted">→</span> 27 tools across products, cart, orders',
  },
  {
    title: "AI assistant",
    body: "Anthropic + Gemini wired in. Swap providers in one file.",
    code:
      '<span class="text-st-magenta">const</span> { handle } = chatModelResolved(<span class="text-st-cyan">"chat"</span>);<br/><span class="text-st-magenta">const</span> reply = <span class="text-st-magenta">await</span> handle(messages);',
  },
  {
    title: "Image uploads",
    body: "Vercel Blob, signed URLs, image variants. No S3 buckets.",
    code:
      '<span class="text-st-magenta">await</span> put(<span class="text-st-cyan">"hero.jpg"</span>, file, {<br/>  access: <span class="text-st-cyan">"public"</span>,<br/>});',
  },
  {
    title: "Agentic Commerce",
    body: "ACP-compliant checkout endpoints for ChatGPT and other agents.",
    code:
      '<span class="text-st-magenta">POST</span> /api/acp/v1/checkout_sessions<br/><span class="text-st-muted">→</span> compatible with Instant Checkout',
  },
];
