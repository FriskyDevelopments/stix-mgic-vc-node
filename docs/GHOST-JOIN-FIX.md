# Ghost-join fix

## Bug

`server/telegram-vc-adapter.ts` stdout handler returned early whenever `pending` was null. Any second JSON reply arriving while a request was in flight was silently discarded.

Result: the node thought a join succeeded, Telegram never got the call, the account bailed. The ghost join.

## Fix

Drain every complete line. Parse each one; if it doesn't match the pending request, log it and drop it safely instead of bailing.

## Commit

`658aff8` on main.

## Status

Spec landed. Python adapter method still needs the actual line-buffer implementation.