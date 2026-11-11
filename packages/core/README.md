# White-label Workers

Shared core and tenant Workers for client sites. This draft wires **4 Elementos** to a calendar module and a neuronas (knowledge and notes) module. Nothing here is deployed. The Wrangler files have no account id, no route, and no secret.

The folder layout is not an npm workspace. Tests and typecheck run from the repository root.

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | Tenant config schema, theme tokens, and the Worker router. Library, not a Worker. |
| `modules/calendar` | Booking module any tenant can mount. Worker name `wl-calendar`. |
| `modules/neuronas` | Knowledge and notes module any tenant can mount. Worker name `wl-neuronas`. |
| `tenants/4elementos` | 4 Elementos config, seed notes, and the Worker that mounts both modules. Worker name `wl-4elementos`. |

`server/rangel-interview.ts` is a separate Node route for Rangel's Notion checklist. It stays off unless `RANGEL_INTERVIEW_ENABLED=true`. These Workers do not import it and do not call Notion.

## Run tests

From the repository root:

```bash
npm test
npm run typecheck
```

`npm test` includes `packages/**/*.test.ts`, `modules/**/*.test.ts`, and `tenants/**/*.test.ts`. The white-label tests run in Node and call the Worker `fetch` handlers directly. They do not start Wrangler and they do not deploy.

## How to add a tenant

1. Copy `tenants/4elementos` to `tenants/<slug>`.
2. Replace `src/tenant.ts`: id, brand, locale, time zone, currency, theme tokens, services, hours, neuronas collections, and seed notes.
3. Pass the object through `loadTenantConfig`. Unknown keys, bad colors, and font names that are not plain family names fail at startup.
4. Copy `wrangler.jsonc`. Set a unique `name`. Keep `workers_dev` false. Do not add `account_id`, `routes`, or a custom domain. DNS stays as it is.
5. Set `vars.TENANT_ID` to the same id as the config. Do not put tokens in `vars`.
6. The root Vitest globs already pick up `tenants/<slug>/**/*.test.ts`.
7. Run `npm test` from the repository root.

A new module also needs an id in `MODULE_IDS` in `packages/core/src/schema.ts`, a folder under `modules/`, and a mount in the tenant Worker.

## Bindings

The Workers answer with `x-store: memory`. Bookings and notes live in the isolate and disappear when it restarts. Do not use that store as the system of record.

These bindings are documented in the Wrangler files and left commented out. Replace the placeholders outside git when an adapter exists:

| Binding | Kind | Worker | Purpose |
| --- | --- | --- | --- |
| `CALENDAR_DB` | D1 | `wl-calendar`, `wl-4elementos` | Durable bookings. `database_name` / `database_id` are `PLACEHOLDER_CALENDAR_DB` and `PLACEHOLDER_D1_DATABASE_ID`. |
| `NEURONAS_KV` | KV | `wl-neuronas`, `wl-4elementos` | Durable notes. Namespace id `PLACEHOLDER_KV_NAMESPACE_ID`. |
| `TENANT_CONFIG_JSON` | var | module Workers | Public tenant document for a standalone module Worker. Not a secret. The 4 Elementos Worker compiles its config instead. |
| `TENANT_ID` | var | `wl-4elementos` | Must match the compiled tenant id or every request returns `tenant_mismatch`. |
| `LOG_LEVEL` | var | all three | `info` logs one JSON line per request (method, path, status). `silent` turns that off. Query strings are not logged. |

There are no secrets in this draft. Do not commit Notion tokens, API keys, or account ids. `npx wrangler types` should regenerate binding types after a real binding is added. Do not hand-write an `Env` that copies those bindings.

`compatibility_date` is `2026-11-11`. Logs and traces are enabled with full sampling for this pre-traffic draft. Lower the trace sample before real traffic.

## Routes

Writes are unauthenticated. A booking id only lets someone read or cancel that booking. Do not attach a hostname or route until an access layer exists.

`GET /healthz` and `GET /` (tenant manifest and theme tokens).

Calendar, mounted at `/calendar`:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/calendar/services` | Active services. `?includeInactive=1` includes the rest. |
| GET | `/calendar/availability?service=&date=` | Open slots. Past and booked slots are omitted. |
| POST | `/calendar/bookings` | `{ serviceSlug, start, guestName }`. `start` must be the exact slot string from availability, such as `2026-11-16T10:00:00-06:00`. Other ISO forms return `slot_not_aligned`. One shared room. |
| GET | `/calendar/bookings/:id` | The booking. The id is the only credential. |
| POST | `/calendar/bookings/:id/cancel` | Cancels, including a booking whose slot has already ended. A second cancel returns the same row while it is still stored. The memory store keeps at most as many cancelled rows as the active cap, dropping the oldest. |
| DELETE | `/calendar/bookings/:id` | Same cancel. |

Neuronas, mounted at `/neuronas`:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/neuronas/notes` | Filter with `collection`, `tag`, `q`, `limit` (max 100). |
| POST | `/neuronas/notes` | `{ collection, title, body, tags }`. Source is `manual`. |
| GET | `/neuronas/notes/:id` | One note. |
| PATCH | `/neuronas/notes/:id` | Title, body, or tags. |
| DELETE | `/neuronas/notes/:id` | `403 delete_disabled` when the tenant sets `allowDelete` false. A wrong method is still `405`. |

## Assumptions for neuronas and 4 Elementos

Neuronas is the tenant knowledge module. The Rangel checklist in this repo already treats service notes, therapist bios, brand choices, and open questions as the content of her panel. This module stores that kind of note for any tenant. It does not continue the interview and it does not write Notion.

4 Elementos is seeded from the checklist labels only:

- Services are Masaje relajante, Descontracturante, Piedras calientes, Reflexología, and Aromaterapia.
- Prices are null. `confirmed` is false. The calendar uses 60 minutes only to place slots.
- Hours are Monday–Saturday 10:00–19:00, America/Mexico_City, Sunday closed. `hoursConfirmed` is false.
- Typography is provisional option A (Jost). Option B (Cinzel for titles, Inter for body) is stored as a candidate, not as the active token.
- Colors are tierra, agua, fuego, and aire plus sand, surface, text, and accent. They are draft tokens.
- Neuronas collections are `servicios`, `marca`, `equipo`, and `operacion`. Seeded notes can be edited. Deletes are off, matching the checklist rule that the flow does not delete.
- The team roster is empty. The calendar is one shared room, not one calendar per therapist.
- Slot math supports `America/Mexico_City` only, as a fixed UTC−6 offset. Mexico City has not observed daylight saving time since 2022. Any other zone fails when the tenant config is loaded.
- Guest name is the only contact field. There is no phone or email.
- Standalone module Workers read `TENANT_CONFIG_JSON`. The 4 Elementos Worker mounts the modules in-process.

## Open questions

- Are the 60-minute slot length and the Monday–Saturday hours acceptable until Rangel confirms them?
- Which typography option is active, A or B?
- Should bookings stay one shared room until therapists exist?
- Which store should replace isolate memory, D1 for bookings and KV for notes, or something else?
- What access layer sits in front of these routes before any hostname is attached?
- Should neuronas later copy confirmed notes into the Notion panel, or stay independent?
- Are more contact fields allowed on a booking?
- Is a non-delete archive flag needed while `allowDelete` stays false?
- Who reviews the Spanish seed copy before a client sees it?
