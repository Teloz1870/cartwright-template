# Local AI (Ollama / Gemma 4)

Run your storefront and admin AI on a local Ollama instance — free,
private, no cloud round-trip. Switch back to Anthropic with one click.

## Quick start

### 1. Install Ollama

| OS | Command |
|---|---|
| macOS | `brew install ollama && brew services start ollama` |
| Linux | `curl -fsSL https://ollama.com/install.sh \| sh && sudo systemctl start ollama` |
| Windows | `winget install Ollama.Ollama` then `ollama serve` |

Or download from [ollama.com/download](https://ollama.com/download).

### 2. Pull a model — easiest from admin

Visit `/admin/integrations` → **AI provider** section → click **Lokal AI**
→ click **Hent modeller**.

If Ollama isn't running, you'll see install instructions with copy-buttons.
If it's running with no models, you'll see three recommended cards:

| Card | Model | Size | RAM | Capability |
|---|---|---|---|---|
| **Tiny** | `gemma4:e2b` | 7.2 GB | 8 GB+ | Read-only |
| **Anbefalet** | `gemma4:e4b` | 9.6 GB | 16 GB+ | Low-risk writes |
| **Power** | `gemma4:26b` | 18 GB | 32 GB+ | All admin tools |

Apple Silicon Macs auto-select the `-mlx` variant (faster on M-series).

Click **Pull this model** → SSE-streaming progress bar → model auto-selects
when done.

Or do it via terminal: `ollama pull gemma4:e4b`.

### 3. Switch provider

Same admin page → select **Local** in the provider radio → pick the
pulled model from the dropdown → **Test forbindelse** → expect ✅ + latency.

That's it. Your `/api/admin/chat`, `/api/assistant/chat`, etc. now route
through Ollama.

## Provider modes

| Mode | Behavior |
|---|---|
| **Anthropic** | Always uses Claude (model from `anthropicModel`). Default. |
| **Local** | Always uses Ollama. Fails if Ollama is unreachable. |
| **Auto** | Tries local first if configured, falls back to Anthropic on error. Fallback policy: `off` / `on-error` / `after-3-failures` |

When **Auto** falls back, `lastDegradedAt` is stamped → `AiStatusPill`
shows ⚠ "degraded" badge for 1 hour.

## Capability tiers

The plan-first admin chat can dispatch every tool in `ADMIN_TOOL_ALLOWLIST`
(`lib/ai/admin-tools.ts`). Smaller local models can't pull off complex tool
sequences reliably, so `MODEL_CAPABILITIES` tiers each model. The tool lists
behind each tier are in `lib/ai/model-capabilities.ts`, and the cards in
`/admin/integrations` show how many tools each tier holds — counted from those
lists, so this page does not repeat the numbers:

| Tier | Tools included | Models |
|---|---|---|
| `read-only` | search/list/get + analytics + audit | gemma4:e2b, gemma3:4b, llama3.2:3b |
| `low-risk-writes` | + categories/pages/discounts.toggle + image attach + docs import | gemma4:e4b, gemma3:12b, qwen2.5:7b |
| `all` | Every admin tool (incl. delete/update) | Claude Haiku 4.5, Sonnet 4.5/4.6/5.5, Opus 4.5/4.7/5.5; gemma4:26b/31b, gemma3:27b, llama3.3:70b |

**Sonnet 4.5 retires on 30 Nov 2026.** Anthropic retires
`claude-sonnet-4-5-20250929` (and so the `claude-sonnet-4-5` alias) on that
day and recommends `claude-sonnet-5-5`
([model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations),
checked 2026-10-23). The admin list no longer offers it, but a shop that saved
it keeps it: the AI form shows a dated warning under it with the successor one
click away — with the Local provider too, since the design, copy and SEO
generators always use the Anthropic model — and the switch happens when you
save; the engine never rewrites the saved model or swaps it on its own. From
that day (counted from 00:00 UTC), Anthropic's "not found" (404) for it becomes
an error that names `claude-sonnet-5-5` and `/admin/integrations` (the test
button and the operator chat show it). Dates live in
`MODEL_RETIREMENTS` (`lib/ai/model-retirements.ts`) with their source and the
day they were checked.

A model id with no row in `MODEL_CAPABILITIES` (`lib/ai/model-capabilities.ts`)
gets the most conservative entry, the `read-only` tier with an 8k `maxTokens`.
The AI form in `/admin/integrations` flags such an id under the model field
("Not a known model: …"); add a row once the model has been tested.

Admin-chat route filters its tool list per `capabilities.tools`, so a
small model never sees a `products.delete` button it would misuse. If it
asks for one anyway, the AI SDK has no such tool in the table and refuses the
call (`NoSuchToolError`) before any handler runs. The route's `repairToolCall`
hook then hands an admin tool name to the executor, which writes the refusal
to the audit log and returns an error naming the tier, which the model reads
as the tool's result. Nothing is repaired or run. A name that is no admin tool
keeps the SDK's own error and gets no audit row. The executor also checks the
tier on every call it runs, as a backstop.

## Vibe-generators are always Anthropic

`lib/ai/theme-generator.ts`, `product-seo-generator.ts`, and
`category-seo-generator.ts` use `chatModelResolved("vibe")` which **forces
Anthropic** regardless of `aiProvider` setting. Reason: they call
`generateObject` with a Zod schema, and local models frequently produce
invalid JSON that breaks brand-setup.

When/if Gemma 4 structured-output becomes reliable enough, flip the
condition in `chatModelResolved()` — single line change.

## Cost / privacy comparison

|  | Anthropic Cloud | Local Ollama |
|---|---|---|
| Per-shop monthly cost | ~$5-50 depending on traffic | $0 |
| Cold-start latency | ~1.5s | ~5-30s (first call after model load) |
| Sustained latency | ~800ms | 1.2-3s typical (Gemma 4 e4b on M2) |
| Privacy | Anthropic sees prompts | Stays on your hardware |
| Tool quality | Excellent (every admin tool) | Tiered per model |
| Structured output | Reliable | Hit-or-miss → vibe-generators always cloud |
| Internet required | Yes | No |

## Status pill

Every `/admin/*` page shows a fixed bottom-right pill:

- 🔒 **Local AI · gemma4:e4b · 1.2s** — local, all good
- ☁️ **Cloud AI · claude-haiku-4-5** — cloud
- ⚠️ **Auto · degraded** — recently fell back to cloud
- ❌ **AI offline** — provider unreachable, click to fix

Polls `/api/admin/ai/health` every 30s for live latency. Click to see
provider/model/today-usage + Settings/Test links.

## Audit-stamping

Every AI-driven tool-call is stamped with `provider` + `model` + `modality`:

```bash
sqlite3 prisma/dev.db \
  "SELECT actor, tool, provider, model, modality FROM AuditLog \
   ORDER BY createdAt DESC LIMIT 10;"
```

`/admin/audit` will (in a future PR) filter by provider/modality so you
can answer "which actions did Gemma do today" or "all voice tool-calls
this week".

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Kan ikke nå http://localhost:11434" | Ollama not running. `brew services restart ollama` |
| Tools never get called | Small model → it can't reliably pull off tool calls. Pull a larger model |
| "Invalid JSON" from generateObject | You routed a vibe-generator to local. They're hardcoded to Anthropic — check `chatModelResolved("vibe")` |
| Pull stalls forever | Disk full? `df -h ~/.ollama/models` |
| Different machine wants admin | Ollama default binds `127.0.0.1`. Set `OLLAMA_HOST=0.0.0.0` env to expose on LAN (security!) |
| Admin form shows "no models" but I pulled one | `ollama list` to confirm. Hit **Hent modeller** again. Or restart `ollama serve` |
| Slet-knap er disabled | Active model can't be deleted. Switch first, then delete |
| "claude-sonnet-4-5 was retired on 30 Nov 2026" | The saved Anthropic model is gone. Pick `claude-sonnet-5-5` in `/admin/integrations` → AI and save |

## Related routes / files

- `lib/ai/client.ts` — `chatModelResolved()`
- `lib/ai/admin-tools.ts` — `filterToolsForCapability()` (the tools each tier reaches)
- `lib/ai/admin-chat-executor.ts` — the admin chat's executor (tier refusal, plan-first gate)
- `lib/ai/model-capabilities.ts` — `MODEL_CAPABILITIES`, `getModelCapabilities()`,
  `unknownModelNotice()` (plain data, read by the admin form too)
- `lib/ai/model-retirements.ts` — `MODEL_RETIREMENTS` (date, successor, source,
  checked-on), `modelRetirementNotice()`, `RetiredModelError` (plain data)
- `lib/ai/settings.ts` — `getAiSettings()` with 30s cache
- `lib/ai/status.ts` — `getInitialAiStatus()` for SSR pill render
- `POST /api/admin/ai/health` — 1-token probe per 30s
- `POST /api/admin/ai/ollama-pull` — SSE-streaming pull
- `components/admin/AiStatusPill.tsx`
- `components/admin/{Ollama,Model,Installed*}.tsx` — admin onboarding UI
