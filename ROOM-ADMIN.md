# Room administration commands

The dashboard currently has no room-admin surface. Operators can join a group call but cannot moderate it from Studio. This is the missing control layer.

---

## Why this exists

Joining a VC is half the job. The other half is running the room: muting chaos, pinning the DJ, kicking the lurker, ending the set cleanly. Telegram exposes these as MTProto methods on the call; the node already has the operator session, so the commands are cheap to surface.

---

## Commands (v1)

All commands act on the **active Telegram connection** for the tenant. They require the operator token and an active paired session.

| Action | Effect | Telegram surface |
|---|---|---|
| `mute` | Mute a participant by user id | `phone.groupCall.editParticipant` (muted=true) |
| `unmute` | Unmute a participant | same, muted=false |
| `pin` | Pin a video/screen source for everyone | raise the source, set as primary |
| `kick` | Remove a participant from the call | editParticipant + remove, or `deleteMessages` on join spam |
| `title` | Set the call title | group call edit |
| `end` | End the call for everyone | `phone.groupCall.discard` |
| `invite` | Invite a user by username/id | `messages.importChatInvite` / add pending |

```json
POST /v1/rooms/:id/admin
{ "action": "mute", "target": "123456789" }

POST /v1/rooms/:id/admin
{ "action": "end" }
```

Responses return the updated participant list so the dashboard can re-render without a poll.

---

## Dashboard placement

New collapsible panel in Studio, visible only when a Telegram VC is live:

- **Participants** list with per-row mute / kick
- **Pin** toggle on the active video source
- **End call** as a destructive action, requires confirm
- Live count + speaking indicator (from the adapter's participant events)

No new URL fields. The group is already known from the join.

---

## Adapter work

`scripts/telegram_vc_adapter.py` gains actions: `mute`, `unmute`, `pin`, `kick`, `title`, `end`, `invite`. Each maps to one MTProto call. The Node side (`telegram-vc-adapter.ts`) exposes matching methods on the adapter object, same pattern as `join` / `leave`.

Errors (target not in call, permission denied) surface as toast + log entry, never a silent no-op.

---

## What this is not

- Not a full Telegram admin console. No ban-from-group, no slow-mode, no topic management — those stay in Telegram.
- Not cross-platform. Discord voice has no equivalent moderation surface for bots; this panel is Telegram-only in v1.
- Not a replacement for the playlist pipeline. Admin commands control *people*, the playlist controls *media*.
