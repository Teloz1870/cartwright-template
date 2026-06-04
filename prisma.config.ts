import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// IMPORTANT: As soon as a `prisma.config.ts` exists, Prisma STOPS auto-loading
// `.env`. If we don't load it ourselves, `env("DATABASE_URL")` in
// schema.prisma resolves to undefined and every `prisma migrate` / `prisma db
// seed` / `prisma generate` breaks. So we load env files explicitly here.
//
// Order mirrors Next.js precedence: `.env` is the committed baseline, then
// `.env.local` overrides it for machine-/developer-specific values. dotenv does
// not override already-set vars by default, so the second call passes
// `override: true` to let `.env.local` win. Paths resolve relative to
// `process.cwd()`, which is the project root the Prisma CLI runs from — this
// holds both in this engine repo and in scaffolded customer projects, where
// DATABASE_URL has historically lived in `.env` and/or `.env.local`.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  // Path to the Prisma schema (was implicit; now declared explicitly).
  schema: "prisma/schema.prisma",
  // Prisma 7: `url` blev fjernet fra schema.prisma's datasource. CLI-kommandoer
  // (db push / migrate / studio) læser forbindelsen herfra i stedet. Runtime-
  // queries går via driver-adapteren i lib/db.ts (ikke denne url). Lokalt er
  // DATABASE_URL=file:./dev.db; for Turso sættes den til libsql://…?authToken=…
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    // Moved out of `package.json#prisma.seed` (deprecated, removed in Prisma 7).
    seed: 'ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
});
