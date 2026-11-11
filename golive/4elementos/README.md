# 4 Elementos go-live package

Sample package for handing the studio to Rangel. It is not deployed, it does not change DNS, and it does not touch Marina, Erika, TuxEvil, or any n8n or Gumloop flow.

| Piece | Status | What's left | Owner must provide |
|---|---|---|---|
| Payments | done for test mode | Durable orders use the demo DO when the Worker is deployed. Until then a single isolate keeps them in memory. No live charges. | Stripe **test** secret `sk_test_…`, webhook secret `whsec_…`, and GO before any deploy. Do not send a live key. |
| Onboarding | done | Real prices, logo, therapist photos, and the Jost/Cinzel choice still belong to Rangel. This flow does not write Notion. | Her answers, then GO if this route should be public. |
| Demo | done, not deployed | Run the command below. A Cloudflare deploy needs a token and creates a `workers.dev` hostname, so it was not run. | GO plus `CLOUDFLARE_API_TOKEN` in the environment, not in git. No client domain. |
| Marina | partial | Chat client matches the existing `marina-chat` webhook. WAHA send is implemented and off unless `deliver: true`. Voice has no Marina webhook, so calls return `marina_voice_not_configured`. Direct Twilio exists and stays off (`TWILIO_DIRECT_CALLS=false`). | `MARINA_CHAT_URL` when she should be called. WAHA base URL, session, and API key. A Marina voice URL, or an explicit GO to turn direct Twilio on, plus Twilio SID, token, and from-number. `MARINA_WEBHOOK_SECRET` for inbound WAHA. |

## Where the code is

- `payments/` — Stripe Checkout, signature check, success and cancel.
- `onboarding/` — first-run screens. Walkthrough: `WALKTHROUGH.md`.
- `demo/` — Worker, wrangler config, `preview.sh`.
- `marina/` — client of Marina's existing HTTP interfaces, plus the WAHA HTTP API.

Open the screens at `/4elementos` in the Vite app, or build the demo and open the Worker at `/`.

## Demo command

```bash
./golive/4elementos/demo/preview.sh          # build only
./golive/4elementos/demo/preview.sh --dev    # local Worker on 127.0.0.1:8788
./golive/4elementos/demo/preview.sh --deploy # refuses, prints the real command
```

The deploy command, for after GO, is:

```bash
npx wrangler deploy --config golive/4elementos/demo/wrangler.jsonc
```

There is no custom route in that config. `workers_dev` stays true. Placeholder values use `REPLACE_ME` or `example.invalid`.

## Parallel branch

Do not edit these paths from this package. Another agent owns them:

- `packages/core`
- `modules/calendar`
- `modules/neuronas`
- `tenants/4elementos`

Mount later by calling `handleDemoRequest` from the tenant Worker, and replace `ElementosDemoOrders` with that branch's storage. The repo gitignore currently ignores a `packages` directory, so `packages/core` will not commit until that rule is narrowed. This branch does not change the gitignore.

`OrderStore` shape for that handoff is `DemoStore` in `demo/state.ts` (`snapshot` and `mutate`).

## Marina, as a client

Read on 2026-11-11, not modified:

- Chat webhook path `marina-chat`. POST JSON `{ message, language, history, channel: "whatsapp" }`. Response `{ reply, escalated, language, provider, source }`. `Origin` is sent only when `MARINA_ORIGIN` is set by the owner. This client does not borrow Casa Barra Vieja's allowlisted origin. The published brain is Casa Barra Vieja and was inactive. Replies are not spa copy until the URL points at an approved interface. This package does not change the prompt or the allowlist.
- WAHA delivery is `POST {WAHA_BASE_URL}/api/sendText` with `{ session, chatId, text }` and header `X-Api-Key`. The demo does not post a fake customer event into Marina's `marina-whatsapp` webhook.
- Inbound WAHA on this tenant is `POST /api/4elementos/marina/waha` with header `x-marina-secret`. Groups, broadcasts, newsletters, and `fromMe` are ignored. The secret is an env placeholder.
- Voice: `POST {MARINA_VOICE_URL}` with `{ tenant, channel: "voice", provider: "twilio", to, from, reason }`. The Twilio auth token is not in that body. No such webhook exists on Marina today.

Secrets that already live inside Marina's workflows were not copied into this repo.

## Env placeholders

See `demo/wrangler.jsonc`. Set real test values with `npx wrangler secret put`, not by editing the file.

`DEMO_ACCESS_TOKEN`, when set, is required as `Authorization: Bearer` on checkout, messages, and calls. Stripe and Twilio webhooks use their own signatures instead. Leave the token empty for the local button to work.

Checkout return URLs use `PUBLIC_BASE_URL` when it is set. With it empty, only loopback and `elementos-demo.*.workers.dev` are accepted. A request Host is not enough.
