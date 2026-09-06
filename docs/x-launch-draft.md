# X launch draft — do not publish before a fresh public scorecard

Cartwright templates now score **[VERIFIED_SCORE]/100** for agent readiness — verified [SCAN_DATE]: [SCORECARD_URL]

Every new site gets:

• anonymous, rate-limited public browsing via MCP + REST
• generated OpenAPI 3.1 with typed operations and security
• markdown negotiation, recovery-first 404s and `llms.txt`
• scoped keys protecting private data and every write

Demo: https://demo.cartwright.app/da

`npx create-cartwright@latest`

The score placeholder must remain unpublished until the linked public scan reflects the deployed production commit.
