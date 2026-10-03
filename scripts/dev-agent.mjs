/**
 * pnpm dev:agent — `next dev` with an unmistakable "here is the ACTUAL URL" banner.
 *
 * Next.js auto-increments the port when the requested one is busy (3000 → 3001 → …),
 * which silently breaks every agent that assumed localhost:3000. This wrapper kills
 * that failure class:
 *
 *   1. Spawns the repo's own `next dev` (extra args pass through, e.g. `-p 3070`).
 *   2. Parses stdout for the port Next ACTUALLY chose (the `- Local: http://…` line).
 *   3. Writes the resolved URL — including the brand.config.ts defaultLocale path —
 *      to `.cartwright/dev-url` (one line, e.g. `http://localhost:3001/en`), so
 *      other tools (`pnpm verify:design`) can target the right server without guessing.
 *   4. Polls that URL until it answers 200, THEN prints `➜ Open: <url>`. The first
 *      compile of a route can take 10–30 s on a cold server — the banner only appears
 *      once the page actually responds.
 *   5. Streams the dev server's output untouched and exits when it exits.
 *
 * Dependency-free: node:child_process + global fetch only.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const devUrlFile = join(root, ".cartwright", "dev-url");

// The repo's own Next bin — never a global install.
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error("✗ node_modules/next not found — run `pnpm install` first.");
  process.exit(1);
}

// Cheap regex read of brand.config.ts for the locale path suffix. Fail-soft:
// no match (or no file) ⇒ no suffix, the origin alone is still correct.
function defaultLocaleSuffix() {
  try {
    const src = readFileSync(join(root, "brand.config.ts"), "utf8");
    const m = src.match(/defaultLocale:\s*["']([A-Za-z-]+)["']/);
    return m ? `/${m[1]}` : "";
  } catch {
    return "";
  }
}

const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  cwd: root,
  stdio: ["inherit", "pipe", "inherit"],
  env: process.env,
});

// Die together, both directions.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code, signal) => {
  // Best-effort cleanup: only remove .cartwright/dev-url if it is still OUR url
  // (a second dev server may have overwritten it — leave that one alone).
  try {
    if (resolvedUrl && readFileSync(devUrlFile, "utf8").trim() === resolvedUrl) {
      unlinkSync(devUrlFile);
    }
  } catch {
    /* already gone */
  }
  process.exit(code ?? (signal ? 1 : 0));
});

let resolvedUrl = null;
let buffer = "";

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk); // passthrough, untouched
  if (resolvedUrl) return;
  buffer += chunk.toString();
  // Next prints `- Local:        http://localhost:3001` (ANSI-colored) AFTER
  // any port auto-increment — this line is the source of truth for the port.
  const m = buffer.replace(/\x1b\[[0-9;]*m/g, "").match(/Local:\s+(https?:\/\/[^\s]+?)\/?\s/);
  if (!m) return;
  resolvedUrl = m[1] + defaultLocaleSuffix();
  mkdirSync(dirname(devUrlFile), { recursive: true });
  writeFileSync(devUrlFile, resolvedUrl + "\n");
  void announceWhenReady(resolvedUrl);
});

async function announceWhenReady(url) {
  const deadline = Date.now() + 180_000; // cold first compile can be slow
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.status === 200) {
        process.stdout.write(
          `\n   ➜ Open: ${url}\n   (also written to .cartwright/dev-url)\n\n`,
        );
        return;
      }
    } catch {
      /* server not accepting connections yet */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  process.stdout.write(
    `\n   ➜ Open: ${url}\n   ⚠ not answering 200 yet after 180s — check the log above.\n\n`,
  );
}
