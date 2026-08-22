import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3200" },
  webServer: {
    command: "pnpm exec next dev -p 3200",
    url: "http://127.0.0.1:3200/da",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATABASE_URL: "file:./dev.db",
      AUTH_SECRET: "local-playwright-agentic-contract-only",
    },
  },
});
