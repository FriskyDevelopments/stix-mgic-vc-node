# Nebu as Rangel's interviewer

Nebu walks through [`CHECKLIST.md`](./CHECKLIST.md) with Rangel, asks **one question at a time** in warm, simple Spanish, and writes each answer into the matching field of her Notion ("RANGEL 4 Elementos's Space", Panel de Rangel `41544c9f-0eac-811d-ab8d-f9a2e399d810`).

**Status:** code only. It isn't deployed, enabled or connected to any channel. Nothing goes live without Francisco's GO.

## Pieces

| Piece | File |
|---|---|
| Checklist, human-readable | `docs/rangel/CHECKLIST.md` |
| Checklist, machine-readable (questions, answer types, Notion targets) | `server/rangel-interview/checklist.json` |
| Answer parsing, Notion write mapping, flow, HTTP routes | `server/rangel-interview.ts` |
| Tests (no network) | `server/rangel-interview.test.ts` |
| Mount point | `server/app.ts`: `app.route('/v1/rangel-interview', …)` |

## Flow

1. `GET /v1/rangel-interview/next?session=rangel` returns the current question.
2. The chat channel shows Rangel the `question` and sends her reply to `POST /v1/rangel-interview/answer` with `{ "session": "rangel", "text": "…" }`.
3. Nebu parses the reply by `answer_type`:
   - `number`: "$1,200 pesos" becomes 1200.
   - `yes_no`: sí or no.
   - `date`: 30/11/2026 becomes 2026-11-30.
   - `multi_select`: matched against the Notion options.
   - `choice`, `text`.
4. "saltar", "después" or "luego" skips a question and writes nothing. Invalid input returns a friendly `retry` hint and re-asks the same question.
5. A valid answer becomes one Notion API call:
   - `update_property`: `PATCH /v1/pages/{page_id}` sets one property.
   - `create_row`: `POST /v1/pages` adds a row to the data source, setting only its title. Used for extra therapists, citas and movimientos. It repeats until she says "no".
   - `append_note`: appends a dated paragraph to a page. Used for answers that have no property, such as the typography choice, the logo files and the loose pages.
   - `manual`: no write. Rangel does this step herself in Notion; for example, uploading photos.
6. `skip_if` skips a question. For example, there is no due date for a pendiente already marked Hecho.

Items with `owner: "us"` are never asked. They are fixes for the team, such as the Devin → Muse renames, covers and the placehold.co photo, and they need Francisco's GO.

The flow **never deletes or archives** anything. It only adds or updates fields.

## Environment (all off by default)

| Var | Purpose |
|---|---|
| `RANGEL_INTERVIEW_ENABLED` | Must be `true`, or every route returns 404 |
| `RANGEL_INTERVIEW_KEY` | Shared secret the channel adapter sends as `x-rangel-interview-key` (constant-time compare) |
| `RANGEL_NOTION_TOKEN` | Notion integration token with access to Panel de Rangel. If missing, writes fail closed (502) |

Set these with `npx wrangler secret put …` only after GO. Never commit their values.

## What's still needed to go live

- **A channel to reach Rangel.** She doesn't use Telegram or Devin. Something has to show her the question and post her reply to `/answer`: a Nebu chat UI, WhatsApp, or Muse calling these endpoints.
- **Secrets on the Worker:** the three vars above.
- **Persistent state.** Interview state is in memory, so it resets on every restart or container swap. Move it to a Durable Object or KV before relying on it.
- **Francisco's GO** for the deploy, plus a test run against a copy of the Panel.
