# Voice Shop (Gemini Live)

Let customers talk directly to your storefront via Google's Gemini Live
voice model. Tools execute server-side with the same audit-log + scope-guards
as your text chat.

## Quick start

### 1. Enable the feature

In your fork's `brand.config.ts`:

```ts
features: {
  // ...
  voiceShop: true,  // opt-in per shop
},
```

This unlocks the floating mic-FAB on the storefront and the admin
configuration form. Default is `false` so shops that don't want voice
incur zero overhead.

### 2. Get a Google Gemini API key

[https://aistudio.google.com](https://aistudio.google.com) → API keys → Create. Free tier covers
extensive testing.

### 3. Configure in admin

Visit `/admin/integrations`:

- Paste the Gemini key in the **Google Gemini** section → Save
- Scroll down to **Voice Shop (Gemini Live)** → toggle "Voice Shop aktiveret"
- Pick a voice (Puck / Charon / Kore / Fenrir / Aoede / Leda / Orus / Zephyr)
- Set per-session and daily minute caps (defaults: 5 min/session, 60 min/day)
- Optional: toggle vision (lets customer share camera)
- Optional: tick which tools voice is allowed to call (default subset:
  `products.search`, `products.get`, `cart.add`, `cart.get_summary`,
  `discounts.try_apply`)
- Click **Test voice-forbindelse** → expect ✅ + latency-ms

### 4. Try it

Visit your storefront at `/da` → mic-FAB appears bottom-right (over the
AI stylist button). Click → grant mic permission → say "vis mig produkter".

## Architecture

```
Browser                          Your server                   Google
─────────                        ───────────                  ────────
[mic FAB]                                                     
   │                                                          
   │ click                                                    
   ▼                                                          
[VoiceShopOverlay]                                            
   │                                                          
   │ POST /api/live/token                                     
   ├────────────────────────────►[token mint]                 
   │                              │ BotID check (prod)        
   │                              │ rate-limit per IP         
   │                              │ canStartVoiceSession()    
   │                              │ ephemeral token via       
   │                              │ authTokens.create with    
   │                              │ pre-committed setup +     
   │                              │ lockAdditionalFields      
   │ ◄────────────────────────────┤                           
   │ { token, sessionId, model }                              
   │                                                          
   │ ai.live.connect() WS         (browser↔Google direct)     
   ├──────────────────────────────────────────────────────────►
   │                                                          
   │◄─────── audio + toolCall ◄───────────────────────────────┤
   │                                                          
   │ POST /api/live/tool-dispatch                             
   ├────────────────────────────►[execute]                    
   │                              │ verify cart_session cookie
   │                              │ allowlist + scope-check   
   │                              │ CONFIRM_REQUIRED gate     
   │                              │ withAuditContext({        
   │                              │   modality: "voice",      
   │                              │   provider: "google",     
   │                              │   model                   
   │                              │ })                        
   │                              │ → invokeTool(...)         
   │ ◄────────────────────────────┤                           
   │                                                          
   │ sendToolResponse to WS                                   
   ├──────────────────────────────────────────────────────────►
   │                                                          
   │ POST /api/live/session-end   (on close)                  
   └────────────────────────────►[increment daily usage]      
```

### Why server-side tool dispatch?

The browser holds a WebSocket directly to Google for low-latency audio,
but **tool execution always routes back through your server** via
`/api/live/tool-dispatch`. This gives you:

- Identical scope-guards and CONFIRM_REQUIRED flow as text chat
- Audit-log rows with `modality="voice"` + `actor="storefront-voice:<sid>"`
- Defense-in-depth tool-allowlist check (even though the token already
  locked the tool list via Google's `lockAdditionalFields`)

### Why ephemeral tokens?

Voice costs money per minute. Your real Gemini API key never leaves
your server. The browser gets a one-shot token that's bound to a
specific tool set and system prompt — even if intercepted, an attacker
can only call your pre-committed tools, not run arbitrary Gemini queries.

## Security & abuse protection

| Layer | What it does |
|---|---|
| `brand.features.voiceShop` | Compile-time gate per fork. If false, no mount at all |
| `voiceShopEnabled` in DB | Runtime kill-switch. Toggle off in admin to revoke access immediately (existing sessions die at next tool call) |
| `voiceTokenLimiter` | Per-IP rate-limit: 3 burst, 1 new token per 20 min |
| BotID check | Production-only. Blocks scripted abuse via `botid/server` |
| Pre-committed setup | Google locks tools+systemInstruction+responseModalities so browser can't expand them |
| `CUSTOMER_TOOL_ALLOWLIST` | Server filters voice tools through this even if DB allowlist diverged |
| `canStartVoiceSession()` | Refuses token mint if daily cap reached → 429 with Retry-After |
| Session-end best-effort | Browser POSTs minutes-used on close; cap is soft (kunder kan lukke fanen) |

## Cost control

Gemini Live is billed by audio minute. To keep costs predictable:

- **`maxMinutesPerSession`** — defaults to 5 min. Google enforces this
  via the token's `newSessionExpireTime`
- **`maxMinutesPerDay`** — defaults to 60 min total across all customers.
  Counter increments via `/api/live/session-end`. New sessions return
  429 when cap is reached.
- **AiStatusPill** — admin can see live usage in the dropdown's "Voice
  Shop i dag" panel
- **`/admin/audit`** filter on `modality=voice` shows every tool call
  including session-time

## Voice-confirmation UX

For write-tools (e.g. `orders.create`), the flow is:

1. Customer says "yes I want to order this"
2. Gemini calls `orders_create` → server returns
   `{ kind: "confirmation_required", preview: "...", confirmationToken }`
3. UI shows the preview card + "Sig ja for at bekræfte"
4. Customer says "ja" → keyword-detection triggers a second
   tool-dispatch with `confirmationToken`
5. Server `consumeConfirmation()` verifies + executes

This matches the text-chat plan-first pattern — no tool-call with
side-effects can fire without a server-issued + server-verified token.

## Voice prompt customization

Default voice prompt is in `lib/voice/prompts.ts` and includes:

- "No markdown, no asterisks, no URLs (TTS reads them aloud)"
- "Short sentences (under 15 words)"
- "When tool returns a list: mention 1-3 highlights, let UI show rest"
- "Always confirm before write-actions"

To customize per-shop, edit `lib/voice/prompts.ts`'s
`buildVoiceShopPrompt(brand)` or add `voicePromptModule` to your brand
config and follow the same brand-portability pattern as text-chat
prompts in `lib/ai/prompts/`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Mic-FAB doesn't appear | `brand.features.voiceShop = false` OR voiceShop not activated in `/admin/integrations` OR no Gemini key | Check all three |
| "Voice shop er ikke konfigureret" 503 | No Gemini API key | Add one in `/admin/integrations` → Google Gemini |
| "Voice shop er ikke aktiveret" 503 | Master switch off | Enable in `/admin/integrations` → Voice Shop section |
| "Voice shop har nået dagens grænse" 429 | `maxMinutesPerDay` reached | Raise cap or wait until next UTC day |
| Mic doesn't pick up audio | Browser permission denied OR wrong device | Re-request permission, check OS sound settings |
| "Forbidden" 403 from token endpoint | BotID detected suspicious traffic | Check requestor's UA, IP — false positive? |
| Gemini hallucinates tool-call args | Voice prompt + tool description need tuning | Edit `lib/voice/prompts.ts` and tool descriptions in `lib/tools/` |

## Related routes

- `POST /api/live/token` — mint ephemeral token (rate-limited + BotID-checked)
- `POST /api/live/tool-dispatch` — execute tool with audit-stamping
- `POST /api/live/session-end` — best-effort daily-usage increment

## Out of scope (future)

- Tone-detection for ja/nej (current: keyword-match)
- Vibration feedback on confirmation cards
- Multi-shop managed-key (Cartwright Cloud tier)
- Server-side voice-relay (only if Vercel Fluid Compute ever ships WebSocket runtime)
