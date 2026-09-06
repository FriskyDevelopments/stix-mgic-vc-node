# VC Node Hosted SKU — Addendum

> Companion to `PRD.md` / `MEDIA-PLANE.md`. This is the commercial + operational
> boundary for turning the existing single-operator node into a sellable product.
> It does **not** rebuild VC Node. It productizes what already exists.

---

## 1. The product in one line

**We host the node. You connect the account. You control it from the dashboard.**

Telegram account is **not** included. The customer supplies and controls it.
The hosting fee does **not** guarantee the Telegram account against restrictions
or bans. Support restores the node. Support does not restore Telegram accounts.

---

## 2. Locked commercial model

**VC Node Hosted — $19/mo**

= 1 VC Node + 1 connected operator account + managed hosting.

| Included | Not included |
|---|---|
| Managed node (control plane + media plane) | Telegram account |
| Pairing / reconnect flow | Phone number |
| Isolated session custody | Proxy / warming |
| Config, updates, health | Ban insurance |
| Reconnect another account without rebuying software | Replacement accounts |

**Later (not V1):**
- Extra operator slots → paid add-on
- AI features → included allowance / BYOK
- Higher runtime / media capacity → Pro (dedicated LCH VPS)

**Self-host template** remains available for people who insist on self-hosting.
It is **not** the core business. Hosted is.

---

## 3. What the node actually is (discovery)

Telegram VC is an **MTProto user session**, not Bot API. The repo already
treats that session as a dedicated operator credential:

- Pairing: `phone → code → optional 2FA`
- Session at `/data/mtproto/operator`, mode `0600`, never returned by any API
- Adapter is `ready` only if `operator.session` exists

So hosted $19 sells the **engine + custody + runtime**, not the identity the
engine runs as.

---

## 4. Architecture — do not contort into Workers

```
             VC NODE HOSTED — $19/mo
                       │
                 Cloudflare
            ┌──────────┴──────────┐
         Dashboard            Control API
            │                     │
         Billing              Provisioning
            │                     │
         └──────────┬──────────┘
                       ▼
                Tenant VC Node
              isolated runtime
                       │
                 encrypted session
                       │
                       ▼
              Telegram operator
              supplied by customer
```

- **Cloudflare** owns: dashboard, public API, entitlement/billing, config,
  queues, R2, TURN minting, Realtime SFU, provisioning commands.
- **Little Creek VPS** owns: the persistent MTProto + media process + `/data`
  session volume. Long-lived process, root, Docker, volume — not a Worker.
- **Customer** owns: the Telegram account (phone, session, 2FA).

V1 hosted = many hermes-class containers commanded from Cloudflare, not
"rewrite Telethon into Workers."

---

## 5. Little Creek alignment (the pieces)

| Piece | Where |
|---|---|
| Dashboard + public API | Cloudflare in front; process on the node |
| Entitlement / billing | Cloudflare (later) |
| Tunnel (`vc.friskydev.com`) | cloudflared → node `:8797` |
| TURN / SFU | Cloudflare Realtime (already in-repo) |
| `vc-node` container | Little Creek VPS (hermes-class) |
| Session volume `/data/mtproto/…` | Little Creek VPS |
| Pairing helper | same container |
| Adapter (`pytgcalls`) | same container |
| RTMP sidecar (MediaMTX, TCP 1935) | same LCH box, **not** through Cloudflare |
| Env | LCH disk, not git |
| Operator account | **customer** until they pair |

**Do not mix boxes.** Authentik VPS is identity-only (and sunset — repurposed
for something else). No tenant session, no pytgcalls there. Node 2 is uninventoried
— do not assign VC Node until inventoried.

**$19 economics:** V1 is **not** one dedicated VPS per customer. It is a
container + volume on shared LCH capacity you already operate. A dedicated LCH
VPS is the Pro add-on.

**LCH operational reality:** the account has seen an abuse freeze before. One
shared IP running many customer MTProto sessions is how the next freeze takes
every tenant down. Isolation is survival, not a luxury SKU.

---

## 6. The state split — this is the product

Four objects, kept separate in API and UI:

| Object | States | Can fail independently |
|---|---|---|
| Subscription | active / past_due / canceled | billing |
| Node | provisioned / running / paused | host down |
| Telegram connection | disconnected / pairing / paired / restricted / revoked / 2fa_required | Telegram |
| Adapter | not_ready / ready / live / error | media process |
| Runtime host health *(extra)* | ok / provider_hold / reprovisioning | LCH freeze |

**Invariant:** `Subscription.active` can sit next to `Connection.restricted`.

If Telegram restricts the account:

> Node is active. Telegram connection is restricted. Connect another operator
> account to resume.

Never: "your $19 service stopped working."

If Little Creek freezes the box:

> Node runtime is on hold at the host; subscription still active; we move the
> volume to another LCH box.

Those two failures must **never** share a sentence.

---

## 7. Ban reality (be honest with yourself)

Telegram bans accounts running automation through user sessions. This is not
optional risk — it is the substrate.

- Banned **without** Telethon before → the library is a scapegoat; the behavior
  is the crime.
- Three bans and still here → recurring customer of Telegram's ban team.
- An LLC does **not** help. Telegram bans the account, not the company.
- Premium accounts are a trap: cost more, flagged harder. Free account + clean
  invite history is the actual stealth mode.

**What gets flagged:** joining groups you weren't invited to, blasting messages,
staying online 24/7 with no human rhythm. Frequency, not content.

**Our behavior is clean:** invited into the group, visible activity, no
mass-messaging strangers. Running the stage for a DJ / video playback — the one
use case Telegram can't even pretend to hate.

---

## 8. Promotion — speak in enterprise-ese

Telegram's radar is keyword-based. Speak boring and they scroll past.

| Don't say | Say instead |
|---|---|
| "Telegram VC automation" | "Managed operator infrastructure" |
| "We run your Telegram account" | "We host the node. You connect the account." |
| "Burn an account" | "Dedicated operator account" |
| The real meaning | Whisper network / DMs only |

- Post the dashboard, never the session.
- The real meaning is an afterparty, not a landing page. DMs can't be scraped.
- Sell the missing button Telegram refused to build: "we automate the VC you
  can't."

---

## 9. Cam-check feature (the one message)

The **only** outbound message the node sends:

> "your cam is off" / "cam check, who's dark"

Design rules so it stays under the radar:

1. **Group ping, not DM.** One message to the room; the person with cam off
   feels the shame. Nobody's inbox gets spammed. 5 DMs = spam pattern; 1 group
   message = you talking.
2. **Frequency cap.** Once at join, or on a long cooldown. Every 30s =
   spam behavior. Telegram's radar reads frequency, not content.
3. **Human rhythm.** Vary timing. No bot cadence.
4. **Optional / toggleable.** Ship it behind a flag; can be removed entirely
   if it proves noisy.
5. **Invited-only context.** The node is in a group it was invited to. No
   unsolicited joins, no blasting.

This is the feature that makes the $19 worth paying: the stage runs itself,
the DJ doesn't have to babysit the cam grid.

---

## 10. Engineering — do not rebuild, tenantize

What exists today (single operator, one hermes box):
1. Pairing loop
2. Session at `/data/mtproto/operator`, `0600`
3. Adapter ready-iff session exists

What is missing (the actual work):
1. **Connection resource** — `GET /v1/telegram-vc/connection`
   `{ state, telegramUserId, username, pairedAt, lastError }`
2. **Delete that actually deletes** — `DELETE /v1/telegram-vc/connection`:
   stop adapter → best-effort remote logout → shred session files → leave
   node + config + subscription intact. Never block on Telegram being reachable.
3. **Per-tenant session path** — `/data/mtproto/tenants/<tenantId>/operator`,
   with compat read of the old path.
4. **Encrypt at rest** — envelope-encrypt the session blob. `0600` is permission,
   not encryption.
5. **Studio copy** — "Connect Telegram account" / "Disconnect and delete session"
   / "Use a dedicated operator account, not your daily-driver." Restricted ≠ product down.
6. **One account per node** — second pair attempt while `paired` → `409` until
   delete. Extra slots are the later add-on.

**PR order:**
1. Session custody + connection object (above) — no billing yet
2. Cloudflare control plane — entitlement, checkout, "node entitled / empty connection"
3. Fleet — more than one isolated runtime, health, pause, reconnect-across-instances

Self-host template (`HOSTED=false`): same binary, no billing, still gets
disconnect/delete + connection object.

---

## 11. Internal rules

- Never put a founder/personal account behind a hosted tenant.
- Session bytes, phone codes, 2FA never hit logs, browsers, or tickets.
- `0600` stays. Permissions are not encryption — encrypt anyway.
- Metering: **$19 = one node + one connected account.** Each extra session is
  custody risk + ban surface + sidecar cost. Don't hide a farm in the base SKU.

---

## 12. Checkout / ToS one-liner

> Telegram account not included. You supply and control the account. The hosting
> fee does not protect that account from Telegram restrictions or bans.
