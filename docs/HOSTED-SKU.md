# VC Node Hosted — $19/mo

## Commercial model

$19/mo = 1 VC Node + 1 connected operator account + managed hosting on Little Creek.

- Telegram account stays the customer's
- restriction changes the connection, not the subscription
- reconnect another account without buying the software again

## State split

subscription ≠ node ≠ Telegram connection ≠ adapter

## Runtime

Cloudflare control plane (dashboard, API, billing, entitlement) → Little Creek VPS (hermes-class, Docker, /data) → customer-supplied Telegram account.

## Cam-check feature

One nudge at join: "cam check, who's dark." Frequency-limited to avoid spam-pattern flags.

## Ban-safe promo

Sell "managed voice infrastructure" / "the missing button Telegram refused to build." Never say "burn an account."

## Status

Spec landed. Implementation (tenant isolation, encrypted sessions, disconnect/delete) is PR 1.