import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    server: {
      // next-auth importerer "next/server" transitivt — vi skal have Vite
      // til at processere det modul (i stedet for at lade Node håndtere
      // det) så vores resolve.alias kan ramme.
      deps: { inline: ["next-auth", "@auth/core"] },
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
    ],
  },
});
