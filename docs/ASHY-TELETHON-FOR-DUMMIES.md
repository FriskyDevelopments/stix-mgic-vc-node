# Ashy Telethon for dummies — dens / VC

This is the pain-free path to connect **Telegram dens** to a VC node.

You are **not** talking to BotFather. A bot token cannot join a voice chat.

Dens / VC uses a **Telethon user session**: a real Telegram account, logged in once on the node.

```
account  →  API app  →  api_id + api_hash  →  phone pairing  →  test dens
```

Run the wizard on the node:

```bash
python3 scripts/ashy_telethon_setup.py
# or
./scripts/ashy_telethon_setup.sh
```

Read `--help` first if you want the whole walkthrough in the terminal:

```bash
python3 scripts/ashy_telethon_setup.py --help
```

---

## This is NOT BotFather

| Thing | What it is | Used for |
| --- | --- | --- |
| **my.telegram.org app** (`api_id` + `api_hash`) | Your Telegram API application | Dens / VC (this guide) |
| **Phone login + optional 2FA** | The operator *user* account | Dens / VC (this guide) |
| **@BotFather token** | A bot | Login widget, commands, optional extra pipe — **cannot join dens** |

If someone sent you a token that looks like `123456789:AAH...`, that is a **bot token**. Stop. You are in the wrong line.

---

## What `api_id` and `api_hash` are

- **`api_id`** — the public number Telegram assigned to *your* API app.
- **`api_hash`** — the secret that proves that app is yours. Treat it like a password.

They come from [https://my.telegram.org](https://my.telegram.org), not from BotFather, not from NEBU chat, not from this walkthrough UI.

---

## Screenshots in words — my.telegram.org

Use a **dedicated operator account** if you can, not the phone you live in all day.

1. Open [https://my.telegram.org](https://my.telegram.org) in a desktop browser.
2. Type the operator **phone number** (with country code) and continue.
3. Telegram sends a login code to the **Telegram app** on that phone. Type the code on the website. This website login is only to create the API app.
4. You land on a small menu. Click **API development tools**.
5. If you already have an app, you will see **App api_id** and **App api_hash** on that page. Skip to copy.
6. If this is the first time, you get a form:
   - **App title** — anything you will recognize, e.g. `NEBU dens`.
   - **Short name** — short, no spaces, e.g. `nebudens`.
   - **URL / platform / description** — optional. Platform can be `Other`.
7. Submit / create the application.
8. The next page shows:
   - **App api_id** — digits, e.g. a 6–8 digit number.
   - **App api_hash** — 32 characters of hex (`0-9` `a-f`).
9. Copy those two values into a password manager or the node vault. **Do not paste them into Slack, Telegram, GitHub, or the NEBU page.**

If the site asks you to confirm again, that is still my.telegram.org — still not BotFather.

---

## Pair on the node

On the VC node (SSH, or a local checkout with the `/data` volume mounted):

```bash
python3 scripts/ashy_telethon_setup.py
```

The script will:

1. Tell you to open my.telegram.org if the values are not already in the environment.
2. Ask for **api_id** (visible) and **api_hash** (hidden).
3. Ask for the operator **phone** in international form, like `+5215551234567`.
4. Ask Telegram to send a **login code** to that account.
5. Ask for the code, then the **two-step password** if that account has 2FA.
6. Write the Telethon session next to `/data/mtproto/operator` (or your tenant path) and set **mode 0600**.

Dry-check without contacting Telegram:

```bash
STIX_TELEGRAM_API_ID=123456 \
STIX_TELEGRAM_API_HASH=replace-with-your-32-hex \
STIX_TELEGRAM_PHONE=+5215551234567 \
python3 scripts/ashy_telethon_setup.py --check --session-path /tmp/mtproto-check/operator
```

Do not commit those values. The example hash above is fake on purpose.

Already paired? The script says so in plain English and leaves the session alone unless you pass `--force`.

Tenant path (hosted):

```bash
python3 scripts/ashy_telethon_setup.py --tenant your-tenant-id
# writes /data/mtproto/tenants/your-tenant-id/operator.session
```

This is the **same session format** as `scripts/mtproto_canary_pair.py`. There is no second file type.

---

## Where secrets go (never chat)

| Secret | Where it lives | Where it must not live |
| --- | --- | --- |
| `STIX_TELEGRAM_API_ID` | 1Password / vault, `/opt/vc-node.env`, `.env`, `wrangler secret`, `.dev.vars` | Chat, Git, Workers logs, this UI |
| `STIX_TELEGRAM_API_HASH` | Same as above | Same as above |
| Phone login code / 2FA | Typed once into the script, then forgotten | Tickets, screenshots, Slack |
| Session file (`operator.session`) | Durable volume `/data/mtproto/…` mode `0600` | Chat, API JSON, Cloudflare Workers, git |

Copy `.env.example` → `.env` for the Node process. Copy `.dev.vars.example` → `.dev.vars` only for `wrangler dev`. Production on hermes uses `/opt/vc-node.env`.

The session is **not** a wrangler secret. It is a file on the node disk. Workers must never hold it.

---

## Test dens

After the script says **Success**:

1. Confirm `STIX_TELEGRAM_API_ID` and `STIX_TELEGRAM_API_HASH` are in the node env (the session file is not enough by itself for a process restart).
2. Restart / recreate the VC node container if env changed (`docker restart` does not re-read `--env-file`).
3. Sign in to the operator studio.
4. Open a **Telegram group voice chat** the operator account can manage.
5. In studio, pick that group and run a short dens practice, then **Stop** and **Leave**.

Hosted Ashy unit (`/units/ashy`) still does not ask you to paste secrets on screen. Attach the unit *or* run this script on the node.

---

## Troubleshooting

**Wrong login code.** Telegram sends a *new* code to the app, not SMS if the app is logged in. Use the newest one. Codes expire fast. Run the script again.

**Two-step password (2FA).** If the account has “cloud password” / two-step verification, the script hides the typing. That password is never written to disk. A wrong password: try again; we do not store it.

**FloodWait.** You tried too many times. Telegram tells the script to wait. Go do something else for the minutes it prints, then run it once. Do not hammer.

**Session already exists.** The script reports “Already paired” and stops. That is success. Use `--force` only when you mean to replace the session (new phone, revoked login).

**“Cannot write under /data/mtproto”.** The durable volume is not mounted on this machine. Either run the script **on the node**, or set `STIX_MTPROTO_SESSION_PATH` to a private folder you control, then copy nothing to chat.

**BotFather token rejected / “this is not a BotFather token”.** You brought a bot token. Dens will never work with it. Start at my.telegram.org.

**Need python3 / telethon.** The node image already has Telethon. Locally: `pip install 'telethon>=1.36,<2'`.

---

## Cloudflare Containers (Ashy unit runtime)

The Ashy self-host path is **Worker `nebu-ashy-unit` + the existing `Dockerfile`**, already on `main` (PR #67). Deploy notes: `docs/cloudflare-containers.md`.

```bash
npx wrangler secret put OPERATOR_TOKEN_SECRET
npx wrangler secret put STIX_TELEGRAM_API_ID
npx wrangler secret put STIX_TELEGRAM_API_HASH
npx wrangler deploy
```

Then SSH/exec into the **container** and run `python3 scripts/ashy_telethon_setup.py`. Pairing is interactive (phone code + 2FA). The session file is not a Wrangler secret.

| Layer | Holds |
| --- | --- |
| Wrangler secrets / `.dev.vars` | `STIX_TELEGRAM_API_ID`, `STIX_TELEGRAM_API_HASH` (and `OPERATOR_TOKEN_SECRET`) |
| Container disk `/data/mtproto/…` | Telethon `operator.session` (mode 0600) |
| Worker / Durable Object memory | **Nothing.** No session, no api_hash |
| `/units/ashy` walkthrough | Display names only |

**Honest limit:** Cloudflare Containers disk is **ephemeral**. When the instance sleeps (`sleepAfter = 1h` in `workers/ashy-unit.ts`), the next start is a **fresh filesystem**. A Telethon session written only inside that container **will vanish on sleep** unless you attach a durable volume.

Until Containers has a durable `/data` volume:

- Treat Ashy-on-Containers dens pairing as **dev / canary**, not production custody.
- Production dens session stays on **hermes** (`/opt/vc-node-data` → `/data`, see `DEPLOY.md`) or another host with a real volume.
- Do not copy `operator.session` into chat, R2, or a Worker var to “make it persist.”

## Related

- Wizard: `scripts/ashy_telethon_setup.py`
- Existing pairing helper (same session file): `scripts/mtproto_canary_pair.py`
- Adapter: `scripts/telegram_vc_adapter.py`
- Containers deploy: `docs/cloudflare-containers.md`
- Product boundary: `HOSTED-SKU.md` (we host the node; you connect the account)
- Ashy walkthrough UI: `/units/ashy` — Connect Telethon points here; it will not ask for secrets
