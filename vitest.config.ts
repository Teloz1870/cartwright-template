import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Deterministic test env (AUTH_SECRET pepper, etc.) so the suite is
    // self-sufficient and passes without externally injected secrets.
    setupFiles: ["./tests/setup/env.ts"],
    server: {
      // next-auth importerer "next/server" transitivt — vi skal have Vite
      // til at processere det modul (i stedet for at lade Node håndtere
      // det) så vores resolve.alias kan ramme. next-intl importerer
      // "next/navigation" transitivt (createNavigation) — samme behov.
      deps: { inline: ["next-auth", "@auth/core", "next-intl"] },
    },
  },
  resolve: {
    alias: [
      // @-alias til projekt-roden
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, "./$1") },
      // server-only shim: i Node-test-runtime er vi altid "on server"
      { find: "server-only", replacement: path.resolve(__dirname, "tests/shims/server-only.ts") },
      // next/server shim: next-auth importerer det transitivt; ESM-resolution
      // fejler i ren Node — vi giver et minimal-shim så lib/cart.ts kan
      // importeres (faktisk funktionalitet bruges ikke i unit-tests).
      { find: /^next\/server$/, replacement: path.resolve(__dirname, "tests/shims/next-server.ts") },
      // next/navigation shim: next-intl's createNavigation() (kaldt på module-
      // load i @/i18n/routing) importerer next/navigation transitivt — samme
      // ESM-resolution-problem. Minimal-shim så moduler der rører i18n/routing
      // (fx lib/annotate/server.ts) kan importeres i unit-tests.
      { find: /^next\/navigation$/, replacement: path.resolve(__dirname, "tests/shims/next-navigation.ts") },
    ],
  },
});
