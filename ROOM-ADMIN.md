# Room administration commands

The dashboard currently has no room-admin surface. Operators can join a group call but cannot moderate it from Studio. This is the missing control layer.

---

## Why this exists

Joining a VC is half the job. The other half is running the room: muting chaos, pinning the DJ, kicking the lurker, ending the set cleanly. Telegram exposes these as MTProto methods on the call; the node already has the operator session, so the commands are cheap to surface.

---

## Auth planes / roles (keep separate)

Room admin honors **three auth planes**. Do **not** merge Better Auth with Authentik, and do **not** collapse `nebu_session` into studio cookies.

| Plane | Identity | When | Role | Capabilities |
|---|---|---|---|---|
| **FriskyDev ID / Authentik** | `operatorPlatform: friskydev` or `supabase` (OIDC studio) | Owns **or** operates the room (`ParticipantRole: operator`) | `studio_operator` | Full: mute, unmute, kick, pin, end, title, invite |
| **NEBU Better Auth** | Consumer dens host (`nebu:<userId>` owner; verified `nebu_session`) | Owns/hosts a **NEBU-linked** room | `nebu_host` | Limited dens host: mute, unmute, kick, pin, end — **no** title/invite (no studio operator powers) |
| **Telegram guest / participant** | Guest participant or non-host | In the call without host rights | `guest` | **No moderation** — participant list is read-only when already exposed |

API gate: `POST /v1/rooms/:id/admin` resolves a `RoomAdminActor` (`operatorId` + `operatorPlatform` + optional NEBU session fields), maps it through `resolveRoomAdminRole`, and returns **403** with a clear `error` / `code` / `role` / `authPlane` when denied. Never silent no-op.

### Better Auth wiring status

**STUB:** Better Auth session is **not** yet resolved inside `/v1/rooms/:id/admin`. The hook is `resolveNebuSessionForRoomAdmin` in `server/room-admin.ts` (returns `null` today). When wired, call `getNebuAuth().api.getSession` against the **NEBU cookie only**. Role matrix + gate hooks are defined and tested; dens-host enforcement activates once the stub returns a real user id.

See also `docs/NEBU-LOGIN.md` (three planes note).

---

## Bot identity split (ops — not shared tokens)

| Surface | Bot | Notes |
|---|---|---|
| **NEBU hosted unit** | `@kimi_Friskydev_bot` / id `8888816358` | **ONLY** bot for NEBU dens / hosted units |
| **FriskyClaw OpenClaw** | `@ClawFriskybot` | Separate token — **must not** share the NEBU bot |

Keep tokens in vault / env; never commit secrets. Do not reuse the NEBU bot identity for OpenClaw ops.

---

## Commands (v1)

All commands act on the **active Telegram connection** for the tenant. They require an authorized actor (see matrix above) and an active paired session.

| Action | Effect | Telegram surface |
|---|---|---|
| `mute` | Mute a participant by user id | `phone.groupCall.editParticipant` (muted=true) |
| `unmute` | Unmute a participant | same, muted=false |
| `pin` | Pin a video/screen source for everyone | raise the source, set as primary |
| `kick` | Remove a participant from the call | editParticipant + remove, or `deleteMessages` on join spam |
| `title` | Set the call title | group call edit (**studio_operator** only) |
| `end` | End the call for everyone | `phone.groupCall.discard` |
| `invite` | Invite a user by username/id | `messages.importChatInvite` / add pending (**studio_operator** only) |

```json
POST /v1/rooms/:id/admin
{ "action": "mute", "target": "123456789" }

POST /v1/rooms/:id/admin
{ "action": "end" }
```

Responses return the updated participant list plus `role` / `authPlane` / `canModerate` so the dashboard can re-render without a poll.

---

## Dashboard placement

New collapsible panel in Studio, visible only when a Telegram VC is live:

- **Participants** list with per-row mute / kick (hidden/disabled when `canModerate` is false)
- **Pin** toggle on the active video source
- **End call** as a destructive action, requires confirm
- **Title / invite** only for `studio_operator`
- Live count + speaking indicator (from the adapter's participant events)
- Role chip: FriskyDev operator / NEBU dens host / Guest (read-only)

No new URL fields. The group is already known from the join.

Host UI keeps participant `role: operator | guest` and adds snapshot `canModerate` / `roomAdminRole` so chrome never silently no-ops forbidden actions.

---

## Adapter work

`scripts/telegram_vc_adapter.py` gains actions: `mute`, `unmute`, `pin`, `kick`, `title`, `end`, `invite`. Each maps to one MTProto call. The Node side (`telegram-vc-adapter.ts`) exposes matching methods on the adapter object, same pattern as `join` / `leave`.

Errors (target not in call, permission denied) surface as toast + log entry, never a silent no-op.

---

## What this is not

- Not a full Telegram admin console. No ban-from-group, no slow-mode, no topic management — those stay in Telegram.
- Not cross-platform. Discord voice has no equivalent moderation surface for bots; this panel is Telegram-only in v1.
- Not a replacement for the playlist pipeline. Admin commands control *people*, the playlist controls *media*.
- Not a shared auth cookie between NEBU and Studio.

---

## Implementation status (Nebu mini widget)

Studio surfaces room admin inside `RoomAdminPanel` (Host Controls + Mini Widget) when Telegram VC is live.

| Action | Node (`telegram-vc-adapter.ts`) | Python bridge | MTProto |
|---|---|---|---|
| mute / unmute | `mute` / `unmute` | overlay + pending flag | `phone.EditGroupCallParticipant` **pending** |
| kick | `kick` | overlay remove | editParticipant remove **pending** |
| pin | `pin` | overlay pin | primary source raise **pending** |
| end | `end` | calls `leave_call` | `phone.DiscardGroupCall` **pending** (leave stand-in) |
| title / invite | `title` / `invite` | local title / no-op invite | EditGroupCall / AddChatUser **pending** |

API: `POST /v1/rooms/:id/admin` — role matrix enforced (FriskyDev full / NEBU dens limited / guest denied). Errors toast + log, never silent.
