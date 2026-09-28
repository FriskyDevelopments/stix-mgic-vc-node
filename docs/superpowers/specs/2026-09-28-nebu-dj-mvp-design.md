# Nebu DJ MVP — Design spec (Approach A: bot-in-group + node-served link)

Date: 2026-09-28. Status: DRAFT — no implementation, no deploys, no product-code
changes until owner review. This document is the only change in its commit.

Supuesto reversible (owner corrige): la superficie del MVP es el **bot de
Telegram escuchando el grupo** — el flujo del plan-maestro ("alguien pide una
canción en el grupo, Nebu la agrega y contesta con el enlace") solo tiene
sentido ahí. Si el owner prefiere Studio-manual, el diseño se recorta al picker
(Approach C, §8).

Repos:

- Backend (vc-node): `/Users/friskypup/stix-mgic-vc-node`, branch actual
  `feat/supabase-identity-sync-20260916` (ahead of origin; el spec del programa
  `~/nebu-quest/docs/superpowers/specs/2026-09-28-nebu-mvp-program-design.md`
  §9.4 ya pide la decisión land-vs-rebase — este spec no la reabre).
- Landing: `~/nebu-quest` — NO se toca en este MVP (§5 explica por qué).

Relación con el spec del programa: Fase C cubre "DJ + cloud export" sin
mencionar Apple Music ni bot-en-grupo; `APPLE-MUSIC-WIDGET.md` cubre solo
artwork (Folio id + iTunes lookup, sin control de cola). Este spec es la capa
nueva "Nebu DJ pedido→cola→enlace" y reconcilia las tres piezas. MusicKit real
(buscar + agregar a la playlist del host) queda como fase 2 explícita (§8).

## 1. Flujo

1. Usuario escribe `/dj <búsqueda>` en un grupo/supergroup donde el bot está.
2. El webhook existente (`POST /v1/telegram/webhook` → `handleTelegramUpdate`,
   `server/app.ts:298`, `server/telegram-bot.ts:89`) rutea a un handler nuevo.
3. El handler resuelve grupo→operador (mapeo nuevo, §2.2).
4. Resuelve la búsqueda contra iTunes vía `lookupMusicArtwork`
   (`server/music-artwork.ts` — gratis, sin auth, timeout 5s).
5. Agrega a la playlist "NEBU DJ" del tenant del operador vía
   `ensureDjPlaylist` (nuevo, §2.3) + `addPlaylistItem` (existe).
6. Contesta en el grupo: título + artista + enlace universal servido desde el
   nodo `https://vc.friskydev.com/l/<trackId>` (§5).

Sin MusicKit, sin OAuth nuevo, sin song.link, sin dependencias de pago, cero
secretos nuevos (iTunes es gratis sin auth; el único secreto vivo sigue siendo
el `TELEGRAM_BOT_TOKEN` ya existente).

## 2. Componentes

### 2.1 Handler `/dj` (nuevo: `server/telegram-dj.ts`, o en `telegram-bot.ts` si < ~150 líneas)

- Parsea `/dj <texto>` (con tolerancia a `/dj@<botusername>`, mismo patrón que
  `recordGroupCommand` en `telegram-group-access.ts:213`) solo en
  grupos/supergroups conocidos. Ignora mensajes sin comando y comandos en
  privado (el reply de link de cuenta sigue siendo solo-privado).
- Reuse: `handleTelegramUpdate` para ruteo, `sendReply` (`telegram-bot.ts:67`)
  para contestar, `lookupMusicArtwork` para resolver, `addPlaylistItem`
  (`playlist-store.ts:128`) para encolar.
- Si `lookupMusicArtwork` devuelve `source: 'placeholder'` (su fallback cuando
  iTunes no responde o no hay resultados) → reply "no la encontré", NO encolar.
  Nunca éxito fabricado (regla de honestidad del room widget).

### 2.2 Mapeo grupo→operador (nuevo campo en `telegram-group-access.ts`)

El store actual guarda `links` (operatorId↔telegramUserId) y `groups`
(id, título, admin) como listas planas sin relación (verificado en código).
Nuevo: `djBindings: { groupId, operatorId }` + `resolveDjOperator(groupId)`.

Regla v1: el operador cuyo `telegramUserId` sea admin del grupo (vía
`getChatMember`, mismo patrón que `recordGroupCommand`), o binding explícito
si hay ambigüedad (dos operadores admins). Sin operador resolvible → reply
honesto "este grupo no tiene operador vinculado", sin llamar a iTunes.

Store: misma disciplina atómica que `writeStore` (tmp + rename + 0600).

### 2.3 `ensureDjPlaylist(tenant)` (nuevo helper en `playlist-store.ts`)

No existe get-or-create por nombre (verificado: solo `createPlaylist` por id).
Busca playlist nombre "NEBU DJ", la crea si falta, devuelve id. Items
`{ url: trackViewUrl, title: "<título> — <artista>", duration? }`.

### 2.4 Redirect `/l/<trackId>` (nuevo, servido desde el NODO)

`GET /l/:trackId` compone por user-agent: Apple Music (`trackViewUrl` de
iTunes, requiere re-resolver o cachear id→url) vs búsqueda Spotify
(`open.spotify.com/search/<artista - título>`). Copy honesto: "abre en tu
servicio", nunca "reproduciendo ahora". Ver §5 por qué NO vive en el landing.

## 3. Errores (replies en el grupo, plain English como los comandos actuales)

| Caso | Reply |
| --- | --- |
| `/dj` sin texto | Uso: `/dj <canción o artista>` |
| Grupo sin operador vinculado | Este grupo no tiene operador vinculado todavía |
| iTunes sin resultados / timeout (placeholder) | No la encontré, prueba con otro título |
| Playlist no encontrada tras ensure (defensivo) | Error interno, intenta de nuevo |
| Fallo de `sendMessage` | Log warn sin tokens (patrón existente `telegram-bot.ts:99-108`) |

Nada silencioso, nada inventado. El texto del reply nunca incluye tokens,
payloads ni contenido crudo del update (mismo assert que el test de `/start`).

## 4. Tests (patrón `telegram-bot.test.ts`: tmpdir aislado, fetch mockeado, `persist: false`)

Nuevo `server/telegram-dj.test.ts`:

- Ignora mensajes sin comando y `/dj` en privado.
- Grupo conocido + operador vinculado: iTunes mock → agrega item → reply con
  título + enlace `/l/<id>`; assert fetch a `sendMessage` con el texto.
- Grupo sin operador: reply honesto, iTunes NO llamado (assert fetch de iTunes
  ausente).
- iTunes placeholder: reply "no encontrada", `addPlaylistItem` NO llamado.
- Reply nunca contiene el bot token (patrón del test "does not leak raw
  transport errors").

Nuevo `ensureDjPlaylist` cases en `playlist-store.test.ts`: crea si falta,
reusa si existe, tenant-aislado.

Mapeo: cases en `telegram-group-access.test.ts` (estilo de la suite "Telegram
group authorization"): un solo operador-admin resuelve; ambigüedad pide
binding; binding inválido se rechaza; store corrupto falla cerrado.

E2E manual: `npm run dev`, `/dj` en grupo de prueba con bot real, reply con
enlace que abre Apple Music / Spotify-search según dispositivo.

## 5. Por qué el redirect NO vive en `nebu.quest`

El bundle del landing no tiene `_redirects` ni `functions/`, y `DEPLOY.md:42`
prohíbe agregar redirects/workers como parte del cutover. Servir `/l/` desde
el nodo (`vc.friskydev.com/l/<id>`) es coherente (el bot ya vive ahí) y no
requiere excepción de deploy. Si el owner quiere `nebu.quest/l/`, es decisión
de deploy separada con su propio OK — no parte de este MVP.

## 6. Verificación y salida

- `npm test` (vitest) verde, `npm run typecheck`, `npm run lint` verdes
  (misma barra que el spec del programa §7).
- Criterio de salida: `/dj` en grupo → canción en playlist "NEBU DJ" del
  tenant + reply con enlace funcional; cero secretos nuevos; sin cambios en el
  landing.
- G1/G2 del spec del programa aplican: sin publish sin owner go; sin secretos
  en git/specs/chat. Nota: todos los tokens vivos del bot `8113796108` están
  revocados — el E2E con bot real requiere token fresco vía BotFather (owner).

## 7. No-objetivos

- MusicKit real (buscar + agregar a la playlist del host en Apple Music):
  fase 2, requiere Apple Developer $99/año + developer token en host env +
  MusicKit JS en Studio. Ver `APPLE-MUSIC-WIDGET.md` "Later".
- Control Spotify: bloqueado hasta 250k MAU (plan-maestro). Spotify aparece
  solo como destino de escucha (búsqueda por texto), nunca como control.
- STT/comandos por voz, cola con votos, límites por usuario: fuera del MVP.
- Cambios en `nebu.quest`, `vc.friskydev.com`, DNS o túneles: ninguno.

## 8. Decisiones abiertas para el owner

1. **Superficie**: ¿bot-en-grupo (este spec) o Studio-manual (Approach C:
   picker en `DJModePanel` con búsqueda iTunes → agregar → copiar enlace)?
2. **Redirect**: ¿`vc.friskydev.com/l/` (propuesto, sin excepción) o
   `nebu.quest/l/` (requiere excepción a `DEPLOY.md:42` + OK)?
3. **Fase 2 MusicKit**: ¿se provisiona Apple Developer ahora o después del MVP?
4. **Rama backend**: land o re-base de `feat/supabase-identity-sync-20260916`
   (pregunta heredada del spec del programa §9.4).
