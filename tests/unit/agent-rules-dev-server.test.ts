import { execFile, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The agent rules files start the dev server the way `pnpm dev:agent` makes
 * safe (TREND5-a).
 *
 * They used to say `pnpm dev` and then curl `http://localhost:3000`. But
 * `next dev` moves on to 3001, 3002, … when 3000 is taken, so an agent on a
 * machine that already had a server on 3000 sent its tool calls to that other
 * server. `pnpm dev:agent` writes the port Next actually chose to
 * `.cartwright/dev-url`; the rules files start it in the background, poll that
 * URL with a bound, and take `$BASE` from it.
 *
 * Next allows one `next dev` per project, so a second one is refused while the
 * first runs, and dev-agent writes `.cartwright/dev-url` only once, when Next
 * first prints its URL. The recipe therefore decides on one fact: is the
 * `next dev` whose PID dev-agent wrote to `.cartwright/dev-pid` alive?
 *
 * - Alive: reuse it, and wait for its URL with the same bound as a fresh start,
 *   even when it does not answer yet. A probe that times out during a compile
 *   or meets a restart used to delete both files and start a second server:
 *   Next refused it, and the live server's files were gone for good.
 * - Dead or missing: delete both files and start a fresh server. After a hard
 *   kill (a reboot, a SIGKILL) they stay behind, and another app can take the
 *   port — an answer there proves only that something listens.
 *
 * No `.gitattributes` pins LF, so a Windows checkout with `core.autocrlf`
 * reads these files with CRLF; the fence parser normalises line endings.
 *
 * AGENTS.md says the rules files describe the same conventions, so the recipe
 * is one block, byte-identical in all six: change it in one and this fails
 * until the others match.
 *
 * Scaffold-safe: it reads files from disk (no git, no locale). The rules
 * files, scripts/dev-agent.mjs and its package.json entry ship in every
 * profile; a rules file a scaffold does not carry is skipped. The recipe runs
 * against a stub `pnpm` and a local HTTP server, so it needs bash and curl and
 * is skipped where they are missing; dev-agent.mjs runs against a fake `next`.
 */
const ROOT = join(__dirname, "..", "..");
const has = (rel: string) => existsSync(join(ROOT, rel));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const RULES_FILES = [
  "AGENTS.md",
  ".claude/CLAUDE.md",
  ".cursor/rules/cartwright.mdc",
  ".github/copilot-instructions.md",
  "GEMINI.md",
  ".windsurfrules",
].filter(has);

/**
 * The fenced bash blocks of a file that start `pnpm dev:agent` in the
 * background — the recipe, not a "Useful commands" list that names it. CRLF
 * reads as LF, so a Windows checkout finds the same block.
 */
function devAgentBlocks(text: string): string[] {
  return [...text.replace(/\r\n/g, "\n").matchAll(/```bash\n([\s\S]*?)```/g)]
    .map((m) => m[1])
    .filter((block) => /^\s*pnpm dev:agent\b.*&$/m.test(block));
}

describe("the agent rules files start the dev server with pnpm dev:agent", () => {
  it("pnpm dev:agent exists and writes the file the recipe reads", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["dev:agent"]).toBe("node scripts/dev-agent.mjs");
    expect(read("scripts/dev-agent.mjs")).toMatch(/join\(root, "\.cartwright", "dev-url"\)/);
    expect(read("scripts/dev-agent.mjs")).toMatch(/join\(root, "\.cartwright", "dev-pid"\)/);
  });

  it("finds the same recipe in a CRLF checkout (no .gitattributes pins LF)", () => {
    const lf = read("AGENTS.md").replace(/\r\n/g, "\n");
    expect(devAgentBlocks(lf)).toHaveLength(1);
    expect(devAgentBlocks(lf.replace(/\n/g, "\r\n"))).toEqual(devAgentBlocks(lf));
  });

  it("every rules file carries the same recipe, exactly once", () => {
    expect(RULES_FILES).toContain("AGENTS.md"); // every scaffold ships it
    const [canonical] = devAgentBlocks(read("AGENTS.md"));
    expect(canonical, "AGENTS.md has no bash block that starts pnpm dev:agent").toBeTruthy();
    for (const rel of RULES_FILES) {
      const blocks = devAgentBlocks(read(rel));
      expect(blocks, `${rel}: dev:agent recipes`).toHaveLength(1);
      expect(blocks[0], `${rel} drifted from AGENTS.md`).toBe(canonical);
    }
  });

  it("the recipe backgrounds the server, waits a bounded time and takes $BASE from dev-url", () => {
    const [recipe] = devAgentBlocks(read("AGENTS.md"));
    expect(recipe).toMatch(/for i in \$\(seq \d+\)/);
    expect(recipe, "reuse must turn on the PID dev-agent wrote, not on what answers").toMatch(
      /^SERVER_PID=\$\(cat \.cartwright\/dev-pid\b/m,
    );
    expect(recipe.match(/rm -f \.cartwright\//g), "one place deletes the files: the dead-PID branch").toHaveLength(1);
    expect(recipe).toMatch(/^BASE=.*\.cartwright\/dev-url( 2>\/dev\/null)?\)/m);
  });

  it("no rules file, nor DESIGN.md, sends an agent to a hard-coded localhost:3000", () => {
    for (const rel of [...RULES_FILES, "DESIGN.md"].filter(has)) {
      expect(read(rel), rel).not.toMatch(/https?:\/\/localhost:3000\b/);
    }
  });

  // procps (Linux: Codespaces, devcontainers, WSL) prints only the executable
  // name for a bare `ps -p`, and the PID dev-agent records is `node`, so the
  // hint would say "no next dev" for a live server and delete its files.
  it("the reboot hint reads the full command line of the dev-pid process", () => {
    for (const rel of RULES_FILES) {
      const text = read(rel);
      expect(text, rel).toContain('`ps -o args= -p "$(cat .cartwright/dev-pid)"`');
      expect(text, `${rel}: a bare ps -p shows only "node" on Linux`).not.toMatch(/`ps -p /);
    }
  });
});

const hasShell =
  process.platform !== "win32" &&
  spawnSync("bash", ["-c", "command -v curl && command -v sed"], { stdio: "ignore" }).status === 0;
const run = promisify(execFile);

/**
 * The recipe's bounds, shrunk so a run that waits the whole bound takes about a
 * second: FAST_TRIES tries, a 1 s curl timeout, 0.1 s between tries. Each piece
 * must appear exactly once, so a recipe that changes its bounds fails here
 * instead of silently running for minutes.
 */
const FAST_TRIES = 4;
const fastBounds = (tries = FAST_TRIES): Array<[string, string]> => [
  ["$(seq 90)", `$(seq ${tries})`],
  ["-m 60", "-m 1"],
  ["sleep 2", "sleep 0.1"],
];
function swapOnce(script: string, from: string, to: string): string {
  const parts = script.split(from);
  if (parts.length !== 2) throw new Error(`the recipe should contain ${JSON.stringify(from)} exactly once`);
  return parts.join(to);
}

describe.skipIf(!hasShell)("the recipe reuses a live next dev and starts one only when its PID is gone", { timeout: 30_000 }, () => {
  const cleanup: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanup.splice(0).reverse()) await fn();
  });

  /**
   * A local HTTP server answering with `status` — after leaving the first
   * `hang` requests unanswered, the way `next dev` holds one during a compile.
   * A list answers the answered requests in turn and repeats its last entry.
   */
  async function serve(
    status: number | number[],
    { hang = 0 } = {},
  ): Promise<{ origin: string; requests: () => number }> {
    const statuses = [status].flat();
    let requests = 0;
    const server: Server = createServer((_req, res) => {
      if (++requests <= hang) return; // never answered: the client's timeout ends it
      res.statusCode = statuses[Math.min(requests - hang, statuses.length) - 1];
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(() => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    });
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests: () => requests };
  }

  /** An origin nothing listens on: a server that ran there and is gone, or is restarting. */
  async function deadOrigin(): Promise<string> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return `http://127.0.0.1:${port}`;
  }

  /** A PID no process has any more: a `next dev` that was hard-killed. */
  function deadPid(): number {
    const { pid } = spawnSync(process.execPath, ["-e", ""]);
    if (!pid) throw new Error("could not spawn a process to take a PID from");
    return pid; // spawnSync has reaped it by the time it returns
  }

  /** This test process: a PID that is alive for as long as the test runs. */
  const LIVE_PID = process.pid;

  /**
   * Runs AGENTS.md's recipe, with fastBounds(tries), in a scratch project whose
   * `pnpm` is a stub: it records its arguments and, when `starts` is set,
   * writes that URL to `.cartwright/dev-url` (and a live PID to
   * `.cartwright/dev-pid`) the way dev-agent does. Then it exits at once, so a
   * server the recipe starts is gone by its second try.
   */
  async function runRecipe({
    devUrl,
    devPid,
    starts,
    tries,
  }: {
    devUrl?: string;
    devPid?: number;
    starts?: string;
    tries?: number;
  }) {
    const dir = mkdtempSync(join(tmpdir(), "cw-dev-agent-recipe-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(join(dir, "bin"));
    mkdirSync(join(dir, ".cartwright"));
    if (devUrl) writeFileSync(join(dir, ".cartwright", "dev-url"), `${devUrl}\n`);
    if (devPid) writeFileSync(join(dir, ".cartwright", "dev-pid"), `${devPid}\n`);
    writeFileSync(
      join(dir, "bin", "pnpm"),
      [
        "#!/bin/sh",
        'echo "$*" >> "$STUB_CALLS"',
        '[ -n "$STUB_STARTS" ] && printf \'%s\\n\' "$STUB_PID" > .cartwright/dev-pid &&',
        '  printf \'%s\\n\' "$STUB_STARTS" > .cartwright/dev-url',
        "exit 0",
        "",
      ].join("\n"),
    );
    chmodSync(join(dir, "bin", "pnpm"), 0o755);
    const calls = join(dir, "pnpm-calls");
    writeFileSync(calls, "");

    const [recipe] = devAgentBlocks(read("AGENTS.md"));
    const fast = fastBounds(tries).reduce(
      (script, [from, to]) => swapOnce(script, from, to),
      swapOnce(recipe, "/tmp/cartwright-dev.log", join(dir, "dev.log")),
    );
    const { stdout, stderr } = await run("bash", ["-c", `${fast}\nprintf 'BASE=%s\\n' "$BASE"\n`], {
      cwd: dir,
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}`,
        STUB_CALLS: calls,
        STUB_STARTS: starts ?? "",
        STUB_PID: String(LIVE_PID),
      },
    });
    const devUrlFile = join(dir, ".cartwright", "dev-url");
    const devPidFile = join(dir, ".cartwright", "dev-pid");
    return {
      base: /^BASE=(.*)$/m.exec(stdout)?.[1] ?? "",
      stderr,
      devUrl: existsSync(devUrlFile) ? readFileSync(devUrlFile, "utf8").trim() : null,
      devPid: existsSync(devPidFile) ? readFileSync(devPidFile, "utf8").trim() : null,
      pnpmCalls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean),
    };
  }

  describe("its next dev is alive: reuse it, never delete its files, never start a second one", () => {
    it("reuses its server that answers at dev-url", async () => {
      const { origin } = await serve(200);
      const result = await runRecipe({ devUrl: `${origin}/en`, devPid: LIVE_PID });
      expect(result.pnpmCalls, "a second next dev is refused while the first runs").toEqual([]);
      expect(result.devUrl, "the live server's dev-url was removed").toBe(`${origin}/en`);
      expect(result.devPid).toBe(String(LIVE_PID));
      expect(result.base).toBe(origin);
    });

    it("waits for a URL that times out during a compile instead of replacing the server", async () => {
      const server = await serve(200, { hang: 1 }); // the first request outlasts curl's timeout
      const result = await runRecipe({ devUrl: `${server.origin}/en`, devPid: LIVE_PID });
      expect(result.pnpmCalls, "Next refuses the second server, and the live one's files are gone").toEqual([]);
      expect(result.devUrl, "the live server's dev-url was removed").toBe(`${server.origin}/en`);
      expect(result.devPid, "the live server's dev-pid was removed").toBe(String(LIVE_PID));
      expect(server.requests(), "it gave up after the first timeout instead of polling").toBe(2);
      expect(result.base).toBe(server.origin);
    });

    it("keeps its files when nothing listens at the URL yet (a restart)", async () => {
      const origin = await deadOrigin();
      const result = await runRecipe({ devUrl: `${origin}/en`, devPid: LIVE_PID });
      expect(result.pnpmCalls).toEqual([]);
      expect(result.devUrl).toBe(`${origin}/en`);
      expect(result.devPid).toBe(String(LIVE_PID));
      expect(result.base, "$BASE is the URL its live server will answer at").toBe(origin);
    });

    it("an answer that is not a 200 is still its live server", async () => {
      const { origin } = await serve(500); // e.g. a page that throws on a missing env var
      const result = await runRecipe({ devUrl: `${origin}/en`, devPid: LIVE_PID });
      expect(result.pnpmCalls).toEqual([]);
      expect(result.devUrl).toBe(`${origin}/en`);
      expect(result.base).toBe(origin);
    });

    it("only a 200 ends the wait: it polls past a 500 and stops at the first 200", async () => {
      const server = await serve([500, 500, 200]);
      const result = await runRecipe({ devUrl: `${server.origin}/en`, devPid: LIVE_PID });
      expect(server.requests(), "a 500 ended the wait, or the 200 did not").toBe(3);
      expect(result.pnpmCalls).toEqual([]);
      expect(result.base).toBe(server.origin);
    });

    it("starts nothing for a live dev-pid whose dev-url is not written yet, and prints no error", async () => {
      const result = await runRecipe({ devPid: LIVE_PID });
      expect(result.pnpmCalls).toEqual([]);
      expect(result.devPid).toBe(String(LIVE_PID));
      expect(result.base).toBe("");
      expect(result.stderr, "the BASE line printed sed's missing-file error").toBe("");
    });
  });

  describe("its next dev is dead or unknown: delete both files and start a fresh one", () => {
    it("starts fresh when the PID is gone and nothing answers at the URL", async () => {
      const result = await runRecipe({ devUrl: `${await deadOrigin()}/en`, devPid: deadPid() });
      expect(result.pnpmCalls).toEqual(["dev:agent"]);
      expect(result.devUrl, "the stale dev-url was kept").toBeNull();
      expect(result.devPid, "the stale dev-pid was kept").toBeNull();
      expect(result.base, "$BASE points at a server that is gone").toBe("");
    });

    it("does not reuse another app that took the port after a hard kill", async () => {
      const { origin } = await serve(200); // the other app answers at the stale URL
      const result = await runRecipe({ devUrl: `${origin}/en`, devPid: deadPid() });
      expect(result.pnpmCalls, "tool calls would go to an unrelated server").toEqual(["dev:agent"]);
      expect(result.devUrl, "the stale dev-url was kept").toBeNull();
      expect(result.devPid, "the stale dev-pid was kept").toBeNull();
      expect(result.base).toBe("");
    });

    it("does not trust a dev-url without the dev-pid beside it", async () => {
      const { origin } = await serve(200);
      const result = await runRecipe({ devUrl: `${origin}/en` });
      expect(result.pnpmCalls).toEqual(["dev:agent"]);
      expect(result.devUrl).toBeNull();
      expect(result.devPid).toBeNull();
    });

    it("with no files it starts pnpm dev:agent and takes $BASE from the URL it writes", async () => {
      const { origin } = await serve(200);
      const result = await runRecipe({ starts: `${origin}/en` });
      expect(result.pnpmCalls).toEqual(["dev:agent"]);
      expect(result.base).toBe(origin);
    });

    // E.g. Next refuses it because a plain `pnpm dev` already runs: the log
    // says why, and waiting out the bound would only hide that.
    it("stops waiting as soon as the server it started has exited", async () => {
      const server = await serve(500); // never a 200, so only the exit check ends the loop early
      const result = await runRecipe({ starts: `${server.origin}/en`, tries: 20 });
      expect(result.pnpmCalls).toEqual(["dev:agent"]);
      expect(server.requests(), "it kept polling for a server that had exited").toBeLessThan(5);
    });
  });
});

// dev-agent forwards SIGTERM to `next dev`, which a Windows process cannot receive.
describe.skipIf(process.platform === "win32")("pnpm dev:agent records the next dev that serves the URL", { timeout: 30_000 }, () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const fn of cleanup.splice(0).reverse()) fn();
  });

  /** Polls `check` every 50 ms until it is true or `ms` have passed. */
  async function until(check: () => boolean, ms: number): Promise<boolean> {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) {
      if (check()) return true;
    }
    return check();
  }

  /**
   * Starts the real dev-agent.mjs in a scratch project beside a fake `next`
   * that prints the "- Local:" line Next prints, records its own PID and waits
   * for SIGTERM. `before` prepares the project before dev-agent starts.
   */
  function startAgent({ before }: { before?: (dir: string) => void } = {}) {
    const dir = mkdtempSync(join(tmpdir(), "cw-dev-agent-pid-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(join(dir, "scripts"));
    writeFileSync(join(dir, "scripts", "dev-agent.mjs"), read("scripts/dev-agent.mjs"));
    const nextBin = join(dir, "node_modules", "next", "dist", "bin");
    mkdirSync(nextBin, { recursive: true });
    writeFileSync(
      join(nextBin, "next"),
      [
        'require("node:fs").writeFileSync(process.env.FAKE_NEXT_PID, String(process.pid));',
        'console.log("- Local:        http://127.0.0.1:9");',
        "setInterval(() => {}, 1000);",
        'process.on("SIGTERM", () => process.exit(0));',
        "",
      ].join("\n"),
    );
    before?.(dir);
    const nextPidFile = join(dir, "next-pid");
    const agent = spawn(process.execPath, [join(dir, "scripts", "dev-agent.mjs")], {
      cwd: dir,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, FAKE_NEXT_PID: nextPidFile },
    });
    let stderr = "";
    agent.stderr?.on("data", (chunk) => (stderr += chunk));
    const exited = new Promise<void>((resolve) => agent.on("exit", () => resolve()));
    cleanup.push(() => agent.kill("SIGKILL"));
    // A dev-agent that dies without forwarding a signal leaves its next behind.
    cleanup.push(() => {
      try {
        process.kill(Number(readFileSync(nextPidFile, "utf8")), "SIGKILL");
      } catch {
        /* never started, or already gone */
      }
    });
    return {
      agent,
      exited,
      stderr: () => stderr,
      nextPidFile,
      devUrl: join(dir, ".cartwright", "dev-url"),
      devPid: join(dir, ".cartwright", "dev-pid"),
    };
  }

  it("writes its next dev PID to .cartwright/dev-pid beside dev-url, and removes both on exit", async () => {
    const { agent, exited, nextPidFile, devUrl, devPid } = startAgent();
    expect(await until(() => existsSync(devUrl) && existsSync(nextPidFile), 10_000), "dev-agent wrote no dev-url").toBe(true);
    expect(readFileSync(devUrl, "utf8").trim()).toBe("http://127.0.0.1:9");
    expect(existsSync(devPid), "no dev-pid beside dev-url").toBe(true);
    expect(readFileSync(devPid, "utf8").trim(), "dev-pid is not the next dev PID").toBe(
      readFileSync(nextPidFile, "utf8").trim(),
    );

    agent.kill("SIGTERM");
    await exited;
    expect(existsSync(devUrl), "dev-url outlived the server").toBe(false);
    expect(existsSync(devPid), "dev-pid outlived the server").toBe(false);
  });

  // The recipe reads dev-url only with its dev-pid beside it, so the PID goes
  // first. A dev-pid that cannot be written (here: a directory in its place)
  // shows the order: dev-agent stops at that write, before any dev-url exists.
  it("writes dev-pid before dev-url, so no dev-url appears without its PID", async () => {
    const { exited, stderr, devUrl } = startAgent({
      before: (dir) => mkdirSync(join(dir, ".cartwright", "dev-pid"), { recursive: true }),
    });
    await exited;
    expect(stderr(), "dev-agent never reached the dev-pid write").toMatch(/EISDIR/);
    expect(existsSync(devUrl), "dev-url was written before dev-pid").toBe(false);
  });

  it("on exit leaves files that another server has written since", async () => {
    const { agent, exited, devUrl, devPid } = startAgent();
    expect(await until(() => existsSync(devUrl) && existsSync(devPid), 10_000), "dev-agent wrote no dev-url").toBe(true);
    writeFileSync(devUrl, "http://127.0.0.1:7/en\n"); // the other server's URL and PID
    writeFileSync(devPid, "424242\n");

    agent.kill("SIGTERM");
    await exited;
    expect(existsSync(devUrl) && readFileSync(devUrl, "utf8").trim(), "it removed another server's dev-url").toBe(
      "http://127.0.0.1:7/en",
    );
    expect(existsSync(devPid) && readFileSync(devPid, "utf8").trim(), "it removed another server's dev-pid").toBe("424242");
  });
});
