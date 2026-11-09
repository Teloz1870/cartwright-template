// No-op shim. I tests kører vi altid på serveren (Node.js via Vitest), så
// `import "server-only"` skal ikke kaste. Aliaseret i vitest.config.ts.
export {};
