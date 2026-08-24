"use client";

import { useState } from "react";

/**
 * Shown in LocalAiForm when Ollama cannot be reached (ECONNREFUSED/timeout).
 * Tab switcher for macOS/Linux/Windows + a copy button on each command.
 *
 * The "Check again" button is controlled by the parent — the parent passes an
 * onRecheck callback that re-probes Ollama via listOllamaModelsAction.
 */

type OS = "macos" | "linux" | "windows";

function detectOs(): OS {
  if (typeof navigator === "undefined") return "macos";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return "linux";
}

export default function OllamaInstallCard({
  errorMessage,
  onRecheck,
  rechecking,
}: {
  errorMessage: string;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const [activeOs, setActiveOs] = useState<OS>(detectOs());

  return (
    <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="mb-3 flex items-start gap-2">
        <span aria-hidden className="text-base leading-none">⚠️</span>
        <div className="flex-1">
          <h4 className="text-sm font-black text-amber-900">
            Ollama isn&apos;t running yet
          </h4>
          <p className="mt-0.5 text-xs text-amber-800">
            <span className="font-mono">{errorMessage}</span>
          </p>
        </div>
      </div>

      <div className="mb-2 flex gap-1">
        {(["macos", "linux", "windows"] as const).map((os) => (
          <button
            key={os}
            type="button"
            onClick={() => setActiveOs(os)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
              activeOs === os
                ? "bg-amber-900 text-amber-50"
                : "bg-amber-100 text-amber-900 hover:bg-amber-200"
            }`}
          >
            {OS_LABELS[os]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {COMMANDS[activeOs].map((cmd, i) => (
          <CommandRow key={i} command={cmd.command} note={cmd.note} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking}
          className="rounded-full bg-amber-900 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-amber-50 transition hover:bg-amber-950 disabled:opacity-50"
        >
          {rechecking ? "Checking…" : "Check again"}
        </button>
        <a
          href="https://ollama.com/download"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-bold text-amber-900 underline"
        >
          Full install guide →
        </a>
      </div>
    </div>
  );
}

function CommandRow({ command, note }: { command: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div>
      <div className="flex items-stretch gap-1">
        <code className="flex-1 overflow-x-auto rounded-md bg-amber-900 px-2.5 py-1.5 font-mono text-[11px] text-amber-50">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy command"
          className="rounded-md border border-amber-300 bg-white px-2 text-[10px] font-black uppercase text-amber-900 transition hover:bg-amber-100"
        >
          {copied ? "✓" : "Copy"}
        </button>
      </div>
      {note && <p className="mt-0.5 text-[10px] text-amber-800">{note}</p>}
    </div>
  );
}

const OS_LABELS: Record<OS, string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
};

const COMMANDS: Record<OS, Array<{ command: string; note?: string }>> = {
  macos: [
    {
      command: "brew install ollama",
      note: "1. Install Ollama via Homebrew",
    },
    {
      command: "brew services start ollama",
      note: "2. Start as a background service (auto-starts at login)",
    },
  ],
  linux: [
    {
      command: "curl -fsSL https://ollama.com/install.sh | sh",
      note: "1. Official install script (Ubuntu/Debian/RHEL/Arch)",
    },
    {
      command: "sudo systemctl start ollama",
      note: "2. Start service (auto-enabled after install)",
    },
  ],
  windows: [
    {
      command: "winget install Ollama.Ollama",
      note: "1. Via Winget. Alternatively: download from ollama.com/download",
    },
    {
      command: "ollama serve",
      note: "2. Start the server (runs in the foreground)",
    },
  ],
};
