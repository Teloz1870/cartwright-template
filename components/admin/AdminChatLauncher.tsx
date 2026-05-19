"use client";

import { useEffect, useState } from "react";
import AdminChatPanel from "@/components/admin/AdminChatPanel";

/**
 * Globalt ⌘K-launcher i admin-layout. Lytter på keyboard-event og åbner
 * et overlay-panel med AdminChatPanel i compact mode. Bruges når admin er
 * inde i fx /admin/ordrer/123 og vil stille et hurtigt spørgsmål uden at
 * skifte side.
 */
export default function AdminChatLauncher() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ⌘K (Mac) eller Ctrl+K (Win/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Åbn AI-copilot (⌘K)"
        style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 40 }}
        className="flex items-center gap-2 rounded-full bg-sol-accent px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-sol-accent/20 transition hover:scale-105 hover:bg-sol-accent/90"
      >
        <span aria-hidden>🤖</span>
        AI <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sol-ink/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-label="AI-copilot quick chat"
    >
      <button
        type="button"
        aria-label="Luk"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative z-10 overflow-hidden rounded-2xl bg-white shadow-2xl">
        <AdminChatPanel compact />
        <div className="border-t border-sol-ink/10 bg-sol-cream px-4 py-2 text-[10px] text-sol-muted">
          Tip: tryk <kbd className="rounded bg-white px-1 py-0.5 font-mono">Esc</kbd>{" "}
          for at lukke, <kbd className="rounded bg-white px-1 py-0.5 font-mono">⌘K</kbd>{" "}
          for at toggle.
        </div>
      </div>
    </div>
  );
}
