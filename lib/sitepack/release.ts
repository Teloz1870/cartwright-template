import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads `.cartwright/release.json` (the self-stamping engine-version marker) for
 * the SitePack manifest's `exporter` provenance. A source checkout reports
 * `{ channel: "source", version: "0.0.0-source", ref: "source", commit: "" }` —
 * which is honest, and harmless because the integer content-schema CURSOR (not
 * this string) drives every compat decision (§6.5). Fail-soft to those source
 * defaults if the file is missing/unreadable.
 */

export type ReleaseMarker = { version: string; channel: "stable" | "next" | "source"; commit: string; ref: string };

const SOURCE: ReleaseMarker = { version: "0.0.0-source", channel: "source", commit: "", ref: "source" };

export function readReleaseMarker(root: string = process.cwd()): ReleaseMarker {
  try {
    const raw = JSON.parse(readFileSync(path.join(root, ".cartwright", "release.json"), "utf8")) as Record<string, unknown>;
    const channel = raw.channel === "stable" || raw.channel === "next" ? raw.channel : "source";
    return {
      version: typeof raw.version === "string" && raw.version !== "" ? raw.version : SOURCE.version,
      channel,
      commit: typeof raw.commit === "string" ? raw.commit : "",
      ref: typeof raw.ref === "string" && raw.ref !== "" ? raw.ref : SOURCE.ref,
    };
  } catch {
    return { ...SOURCE };
  }
}
