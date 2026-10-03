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
| **Tiny** | `gemma4:e2b` | 7.2 GB | 8 GB+ | Read-only (~10 tools) |
| **Anbefalet** | `gemma4:e4b` | 9.6 GB | 16 GB+ | Low-risk writes (~15 tools) |
| **Power** | `gemma4:26b` | 18 GB | 32 GB+ | All 37 admin tools |

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

The plan-first admin chat dispatches up to 37 tools. Smaller local models
can't pull off complex tool sequences reliably, so `MODEL_CAPABILITIES`
tiers each model:

| Tier | Tools included | Models |
|---|---|---|
| `read-only` | search/list/get + analytics + audit (~10) | gemma4:e2b, gemma3:4b, llama3.2:3b |
| `low-risk-writes` | + categories/pages/discounts.toggle + image attach (~15) | gemma4:e4b, gemma3:12b, qwen2.5:7b |
| `all` | All 37 admin tools (incl. delete/update) | Claude (any), gemma4:26b/31b, gemma3:27b, llama3.3:70b |

Unknown models fall back to `read-only` (safe default).

Admin-chat route filters its tool list per `capabilities.tools`, so a
small model never sees a `products.delete` button it would misuse.

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
| Tool quality | Excellent (all 37 tools) | Tier-gated per model |
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
| Tools never get called | Small model → tier-gated to read-only. Pull a larger model |
| "Invalid JSON" from generateObject | You routed a vibe-generator to local. They're hardcoded to Anthropic — check `chatModelResolved("vibe")` |
| Pull stalls forever | Disk full? `df -h ~/.ollama/models` |
| Different machine wants admin | Ollama default binds `127.0.0.1`. Set `OLLAMA_HOST=0.0.0.0` env to expose on LAN (security!) |
| Admin form shows "no models" but I pulled one | `ollama list` to confirm. Hit **Hent modeller** again. Or restart `ollama serve` |
| Slet-knap er disabled | Active model can't be deleted. Switch first, then delete |

## Related routes / files

- `lib/ai/client.ts` — `chatModelResolved()`, `MODEL_CAPABILITIES`,
  `filterToolsForCapability()`
- `lib/ai/settings.ts` — `getAiSettings()` with 30s cache
- `lib/ai/status.ts` — `getInitialAiStatus()` for SSR pill render
- `POST /api/admin/ai/health` — 1-token probe per 30s
- `POST /api/admin/ai/ollama-pull` — SSE-streaming pull
- `components/admin/AiStatusPill.tsx`
- `components/admin/{Ollama,Model,Installed*}.tsx` — admin onboarding UI
