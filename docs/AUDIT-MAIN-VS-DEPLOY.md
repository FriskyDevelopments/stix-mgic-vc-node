# Audit: main versus deployment evidence

**Item 11 — read-only audit, 2026-10-03 UTC.** Repository:
`FriskyDevelopments/stix-mgic-vc-node`, the Node virtual-camera/video-chat
backend and web UI used by NEBU. Baseline: fetched `origin/main` at
`8d3d80d` (2026-09-28).

## Summary and evidence boundary

- **Recorded deploy ref equals main.** GitHub deployment **6718886394**, created
  2026-09-28 at 19:38:56 UTC by `zeabur[bot]`, records environment `production`,
  ref/SHA `8d3d80d`, and a `success` status at the same time. There are **zero
  commits on main not in this recorded deployment ref**, and zero source-file
  differences between these refs.
- **Live state: unverified.** A successful GitHub record does not prove which
  image, source tree, configuration, database schema, hostname, or server is
  running now. No live server, provider dashboard, SSH host, DNS, Cloudflare,
  Zeabur settings, or external identity service was accessed or changed.
- There is no fetched branch named `deploy` or `release`, no fetched Git tag,
  and no GitHub Release. The manual Hermes deployment has **no immutable
  deployed commit recorded in the repository**; its source is documented as an
  rsync directory, not a Git clone. Its main-only commit list is **unverified**.
- Deployment instructions are not interchangeable: Hermes Docker, a separate
  Zeabur GitHub integration, and Cloudflare Worker + Container are described.
  Render is explicitly reference-only. Concrete drift includes the Hermes port
  mapping, incomplete Cloudflare tooling, divergent lockfiles, and overlapping
  documentation. These are repository findings, not claims about live outages.

### Method

Fetched remote branches and tags and completed the initially shallow history.
Compared refs using `git rev-list --left-right --count`, inspected tracked files
at the baseline, read GitHub deployment/status/release/workflow metadata, checked
the npm lockfile against registry advisories, and performed a bounded,
metadata-only history secret-pattern check. No application files were changed;
no install, build, deploy, live smoke test, or login was performed. The product
context was read in `PRD.md`, `NEBU-MVP.md`, `MVP-VIDEOCHAT.md`, and
`MEDIA-PLANE.md`; those documents are specifications/historical reports, not
current production evidence.

## 1. Deployment refs and main-only commits

| Evidence | Recorded ref | Main commits absent from ref | Interpretation |
|---|---|---:|---|
| Latest GitHub `production` deployment, ID 6718886394 | `8d3d80d` | 0 | Latest recorded successful deployment matches audited main; live state **unverified**. |
| Previous GitHub `production` deployment, ID 6717487901 | `63e8d5d` | 1 | Subsequently marked inactive; missing `8d3d80d` (orphaned devcontainers updater removal, PR #79). Not the selected deploy ref. |
| GitHub `production` deployment, ID 6647085070 | `6d28b6d` | 16 | Subsequently marked inactive. Historical ref only, not evidence of the current server. |
| Hermes manual deployment in `DEPLOY.md:15–28,43–65` | None recorded | **unverified** | No tracked source SHA, image digest, or deployment manifest binds the rsync directory to main. |
| Cloudflare Container path in `wrangler.jsonc` | None recorded | **unverified** | Config names an image built from `./Dockerfile`; it does not record an installed artifact SHA/digest. |

For the selected recorded deploy ref, `git log <deploy-sha>..origin/main` is
empty. Do not substitute an old feature branch for a deploy ref merely because
its name contains `prod`, `worker`, or `zeabur`.

### All fetched branches differing from main

Counts are **main-only / branch-only commits**, not changed-file counts, computed
from complete fetched history. Remote prefix `origin/` is omitted. Main itself
is `0 / 0`; the audit PR branch is not part of this pre-audit snapshot. An old
tip with branch-only commits may already have equivalent changes on main through
squash/cherry-pick; these counts do not prove missing functionality. **Deployment
of every branch below is unverified.**

| Branch | Main-only | Branch-only | Tip |
|---|---:|---:|---|
| `audit-fixes` | 162 | 5 | `5fc0f3d` |
| `coderabbit/fix-identity-cache-actions/45023954` | 113 | 2 | `9c32f3a` |
| `copilot/fix-220081212-1211687552-275e4b5f-b350-439b-a569-80bb4f070ea2` | 87 | 1 | `ef88fd5` |
| `copilot/fix-220081212-1211687552-3289df56-1385-4c09-b64e-634e4697e78e` | 93 | 1 | `4d3b1aa` |
| `copilot/fix-220081212-1211687552-5a1d6526-856f-4c80-861a-25b174c85dba` | 92 | 0 | `7eed8d9` |
| `copilot/fix-220081212-1211687552-933bb9f8-0b50-4c7c-bdf5-dcd6b0fb80fb` | 93 | 0 | `1d80f99` |
| `copilot/fix-220081212-1211687552-a00972df-d2cd-466e-abc5-7b208b085b9c` | 97 | 0 | `605b0b9` |
| `copilot/fix-220081212-1211687552-a4161acc-48bc-41a4-8bcb-2e2aa72f8884` | 93 | 0 | `3e2918f` |
| `copilot/fix-220081212-1211687552-e75dc5b0-5dd4-4639-a7f4-6a2145f9b7d3` | 93 | 0 | `bdcbe31` |
| `cursor/add-posthog-bc3c` | 150 | 1 | `81bfc0e` |
| `cursor/alpha-value-bc3c` | 155 | 0 | `5eace97` |
| `cursor/cherry-pick-control-plane-fix-0e87` | 127 | 1 | `713426a` |
| `cursor/fix-vc-auth-identity-df50` | 113 | 2 | `9c32f3a` |
| `cursor/friskydev-account-link-bc3c` | 138 | 0 | `bd919fb` |
| `cursor/prod-ready-bc3c` | 152 | 1 | `668531a` |
| `dependabot/npm_and_yarn/eslint-plugin-react-refresh-0.5.7` | 16 | 1 | `69566be` |
| `dependabot/npm_and_yarn/framer-motion-13.4.4` | 0 | 1 | `9bc112f` |
| `dependabot/npm_and_yarn/posthog-js-1.434.14` | 0 | 1 | `34b035b` |
| `dependabot/npm_and_yarn/radix-ui/react-avatar-1.2.6` | 16 | 1 | `9fd00ea` |
| `dependabot/npm_and_yarn/radix-ui/react-collapsible-1.1.20` | 16 | 1 | `7cc0403` |
| `docs/hosted-sku` | 98 | 1 | `2522b40` |
| `docs/room-admin-apple-music-free-offer` | 97 | 0 | `9f694ba` |
| `docs/video-pipeline-playlist` | 97 | 0 | `d6c20d2` |
| `feat/codepup-fix` | 67 | 0 | `1723661` |
| `feat/codepup-fix-scanner` | 87 | 0 | `d071376` |
| `feat/dj-pipeline-admin` | 95 | 0 | `61bc382` |
| `feat/dj-simplify-v1` | 94 | 0 | `69625dc` |
| `feat/media-plane-webrtc` | 154 | 12 | `084e3bd` |
| `feat/mvp-rooms-dj` | 0 | 7 | `99661ca` |
| `feat/nebu-better-auth-login` | 63 | 0 | `c233538` |
| `feat/nebu-donate-promo` | 60 | 3 | `8d65da7` |
| `feat/nebu-host-controls-mini-widget` | 58 | 0 | `87b234d` |
| `feat/nebu-landing-admin` | 38 | 1 | `e3e02c5` |
| `feat/nebu-landing-dynamism` | 61 | 0 | `ed0d8fe` |
| `feat/nebu-room-admin` | 57 | 0 | `9d7568b` |
| `feat/studio-dj-controls` | 95 | 0 | `61bc382` |
| `feat/supabase-friskydev-identity` | 128 | 0 | `6741e04` |
| `feat/supabase-identity-sync-20260916` | 2 | 0 | `fbe8478` |
| `fix/dependabot-devcontainers-noise` | 1 | 1 | `f692043` |
| `fix/ghost-join-stdout-drain` | 98 | 1 | `6a7046b` |
| `fix/nebu-zeabur-routing-login` | 16 | 5 | `430e9c7` |
| `fix/telegram-login-payload` | 106 | 1 | `db6ac5a` |
| `fix/telegram-miniap-initdata` | 103 | 0 | `6210862` |
| `friskydevelopments-security-dependency-audit` | 152 | 0 | `46aac6b` |
| `nebu/worker-mvp-patch` | 0 | 9 | `fd28b05` |
| `restore/nebu-landing-2bc08cd` | 17 | 0 | `9e15112` |
| `v0/7624177410-4806-f87fb171` | 106 | 1 | `57d1019` |

**Deployment-relevant work outside main:**

- `fix/nebu-zeabur-routing-login` has five branch-only commits
  (`03b6198`, `30c1082`, `74ab0eb`, `35af5df`, `430e9c7`) changing host routing,
  login UI, tests, and `DEPLOY.md`. PR **#77** is open. These fixes are not in
  the recorded main deployment; whether equivalent fixes exist live is
  **unverified**.
- `feat/mvp-rooms-dj` has seven additional commits (`96ea5b2`, `a426dc9`,
  `536dc10`, `77b7c79`, `f0db463`, `e0be39d`, `99661ca`) for the DJ MVP,
  artwork/listen links, recap export, signaling tests/docs, Docker exclusions,
  and restored Cloudflare tooling.
- `nebu/worker-mvp-patch` includes those seven plus `5a56489` and `fd28b05`:
  a separate Worker/D1 Better Auth path, migration, signaling adaptation, and
  CORS/session gates. Its `wrangler.nebu-app.jsonc`, `workers/nebu-app.ts`, and
  `migrations/0001_better_auth.sql` are **not artifacts on audited main**.
  Their deployment is **unverified**; the branch is not an established deploy ref.

## 2. Deployment/configuration drift

| Area | Confirmed repository evidence | Risk / live verification boundary |
|---|---|---|
| Hermes production port | `Dockerfile:14–15,26–29` sets and exposes port 10000. `DEPLOY.md:61–65` maps host/container port 8797 without overriding `PORT`; its canary does override `PORT` at lines 55–58. | The production command as written is inconsistent unless the external env file changes `PORT`. Effective env and reachability **unverified**. |
| Deployment authority | `DEPLOY.md:3–13` says Hermes is the sole target and main does not auto-deploy; lines 114–133 separately document Zeabur main auto-deploy. GitHub records a Zeabur bot deployment of main. | Treat “no auto-deploy” as Hermes-specific, not repository-wide. Which service serves any current hostname is **unverified**. No tracked Zeabur-specific config was found in the main tree. |
| Render | `render.yaml:1–4` says reference-only; its media-plane flag disables the feature while Wrangler enables it. `DEPLOY.md` says not to deploy to Render/Vercel. | This is stale/alternate configuration, not proof of a live Render instance or its health; live state **unverified**. No `vercel.json` exists on main. |
| Cloudflare tooling | `workers/ashy-unit.ts:1` imports `@cloudflare/containers`; `wrangler.jsonc` references that Worker and Dockerfile. Main's `package.json` declares neither `@cloudflare/containers` nor `wrangler`. README lists `cf:whoami`, `cf:dev`, `cf:deploy`, but the scripts do not exist. | A clean main checkout does not define the documented Cloudflare command/toolchain. `99661ca` restores tooling on the DJ branch, not main. No Cloudflare build/deploy was attempted. |
| CI coverage | `.github/workflows/ci.yml:13–23` uses Node 22/npm and runs lint, typecheck, Vitest, one Python setup test, and Vite build. It has no deployment step, Docker build, Worker build, dependency audit, or secret-history scan. | Main CI run **36473254868** succeeded for `8d3d80d`; this does not verify image construction, Worker compatibility, or production. GitHub also lists Code Pup, Copilot, and Dependabot Updates workflows, but only `ci.yml` is tracked on main; their external behavior is **unverified**. |
| Lockfile divergence | Docker and CI use `package-lock.json`/`npm ci`. `pnpm-lock.yaml` also exists, but its root importer is missing main dependencies `altcha`, `better-auth`, and `mysql2`. | Frozen pnpm setup is not equivalent to the npm deployment dependency graph. Workspace setup reported a failed frozen pnpm install; no lockfile was repaired in this audit. |
| Frontend build versus runtime env | `Dockerfile:3–8` exposes only `VITE_SPOTIFY_CLIENT_ID` as a build argument. `.dockerignore` excludes env files. `src/lib/env.ts` reads public `VITE_*` configuration from the compiled frontend. | Supplying `VITE_*` to a running image does not rebuild its JS. Other frontend settings need a deliberate build-time path; current deployed bundle settings **unverified**. Never put server secrets in `VITE_*`. |
| Worker env forwarding | `workers/container-env.ts` uses a fixed allowlist and forces the image port. It forwards Better Auth variables and `ALTCHA_HMAC_KEY`, but not `TELEGRAM_LOGIN_BOT_TOKEN`, `ALTCHA_MAX_NUMBER`, `RTMP_*`, `ROOMS_STATE_PATH`, `MTPROTO_STATE_DIR`, `MS_CLIENT_ID`, or `MS_CLIENT_SECRET`. | Adding these names only as Worker vars/secrets will not pass them through this helper. This is capability/configuration drift between generic Docker and the Container wrapper, not proof of a live failure. |
| Stateful deployment | Hermes docs mount `/data`; Zeabur docs describe room state as non-persistent. `server/index.ts:14` persists rooms only through `ROOMS_STATE_PATH`; `server/rooms.ts:80–103` otherwise retains in-memory state. Cloudflare docs warn of ephemeral disk; `workers/ashy-unit.ts:16` configures container sleep. | A mount alone does not enable room persistence. Volume attachment, room path, uploads, display-name data, MTProto sessions, and restart survival are **unverified**. No tracked durable-volume provision or database migration execution proves them. |
| Media sidecar | `deploy/mediamtx.yml` is an authenticated credential-placeholder template. `DEPLOY.md:30–38` describes a separate MediaMTX network/ingest, but tracked deployment automation does not apply it or launch it. | Docker installs ffmpeg/Telethon/py-tgcalls but does not thereby launch an RTMP sidecar or pair a Telegram user session. Ingest/firewall/session readiness **unverified**. |
| Login split | `server/betterAuth.ts` supplies NEBU Better Auth/MySQL at `/api/auth`; `server/app.ts:158–170` wires it conditionally. Studio identity is separately advertised as Supabase at `server/app.ts:212–235` and in `DEPLOY.md:80–85`. Old Authentik/OIDC names/comments remain. | NEBU login must remain **Better Auth**; Studio-specific identity text is not a substitute. Better Auth database availability/schema, provider setup, cookies, and callbacks are **unverified**. No login or identity-service change was made. |
| Historical media docs | `MVP-VIDEOCHAT.md` frames Workers as requiring a rewrite; current main instead wraps Node in a Worker + Container. `MEDIA-PLANE.md` reports Telegram/RTMP as not implemented, while main contains Telegram adapters, pairing, and RTMP configuration. | Historical product notes must not be used as a deployment readiness report. Adapter existence is not proof of a working live media path; live capabilities **unverified**. |

## 3. Environment variable names (never values)

This is a **code/configuration inventory**, not a dump of any deployed environment.
Requiredness depends on the enabled feature. Actual presence in every live service
is **unverified**. Primary sources: `server/env.ts`, `server/betterAuth.ts`,
`src/lib/env.ts`, `.env.example`, `.dev.vars.example`, and
`workers/container-env.ts`. Runtime defaults in code are not reproduced here.

| Purpose | Names | Requirement |
|---|---|---|
| Production boot/authentication | `NODE_ENV`, `AUTH_REQUIRED`, `OPERATOR_TOKEN_SECRET` | Production requires authentication enabled and an operator signing secret of at least 16 characters; image sets production mode. |
| Listener, logging, token policy | `HOST`, `PORT`, `VITE_DIST_DIR`, `LOG_LEVEL`, `OPERATOR_TOKEN_TTL_SECONDS`, `SESSION_ISSUER`, `CORS_ALLOWED_ORIGINS` | Defaults/overrides; align listener port and origin/issuer policy with the deployment. `VITE_DIST_DIR` is a server path override, not a client secret. |
| NEBU Better Auth | `BETTER_AUTH_SECRET`, `DATABASE_URL`, `BETTER_AUTH_URL` | Secret (at least 32 characters) and database URL are required to enable NEBU auth; URL configures callbacks/origin. Node main uses MySQL; setting names alone does not establish schema readiness. |
| Better Auth Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Both required to enable that provider. |
| Better Auth Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`; aliases `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | ID/secret required for that provider; tenant optional. Worker allowlist includes canonical names, not aliases. |
| Better Auth Apple | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | ID plus either a supplied client secret or the team/key/private-key signing set; not all names are mandatory together. |
| Studio identity (existing code, not an alternative NEBU login) | `IDENTITY_PROVIDER`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY` | Studio readiness requires URL and one public key; current identity selector admits Supabase only. No service-role credential belongs in this process. |
| Legacy OIDC configuration | `AUTHENTIK_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` | Names remain in the schema/forwarder; docs say no active Studio fallback. Not required for NEBU Better Auth. |
| Rooms/media capability | `PUBLIC_ROOMS_ENABLED`, `MEDIA_PLANE_ENABLED`, `ROOMS_STATE_PATH` | Feature flags and optional persistence path; room disk persistence needs the path as well as storage. |
| Browser ICE/static relay | `STUN_URLS`, `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | TURN relay configuration is conditional; no relay means some restrictive-network calls cannot connect. |
| Cloudflare relay/SFU | `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_KEY_API_TOKEN`, `CLOUDFLARE_TURN_TTL_SECONDS`, `CLOUDFLARE_REALTIME_APP_ID`, `CLOUDFLARE_REALTIME_APP_SECRET` | TURN key pair and Realtime app pair independently enable their features; TTL optional. |
| Proof-of-work protection | `ALTCHA_HMAC_KEY`, `ALTCHA_MAX_NUMBER` | HMAC key enables enforcement; absent key is a fail-open feature state, not a production boot error. Difficulty optional. |
| Telegram bot/webhook/login-widget integration | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LOGIN_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Conditional integrations; separate login-bot token when needed. Webhook secret is at least 24 characters when set. These bot integrations are not a replacement for NEBU Better Auth. |
| Telegram MTProto adapter/pairing | `STIX_TELEGRAM_API_ID`, `STIX_TELEGRAM_API_HASH`, `STIX_TELEGRAM_PHONE`, `STIX_TELEGRAM_TWO_STEP_PASSWORD`, `STIX_MTPROTO_SESSION_PATH`, `MTPROTO_STATE_DIR`, `MTPROTO_PYTHON`, `TELEGRAM_GROUP_ACCESS_PATH` | API pair plus separately paired user session for calls; phone/password/session-path names belong to pairing/helpers as applicable. Session files are credentials, not environment examples. |
| Discord integrations | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `DISCORD_APPLICATION_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN` | Conditional OAuth/interaction/command features; distinct requirements per feature, not production boot requirements. |
| RTMP ingest sidecar | `RTMP_INGEST_ENABLED`, `RTMP_PUBLIC_HOST`, `RTMP_PUBLISH_USER`, `RTMP_PUBLISH_PASSWORD`, `RTMP_PATH` | Enabling requires public host and publisher credentials; password at least 16 characters. The template/sidecar must separately be configured. |
| Media/preferences storage | `MEDIA_DIR`, `DISPLAY_NAMES_PATH` | Optional path overrides; require durable storage if restart survival matters. |
| Server Spotify | `SPOTIFY_CLIENT_ID` | Optional integration. |
| Public frontend build config | `VITE_API_BASE_URL`, `VITE_AUTH_REQUIRED`, `VITE_DEMO_MODE`, `VITE_OPERATOR_TIER`, `VITE_DISCORD_CLIENT_ID`, `VITE_SPOTIFY_CLIENT_ID`, `VITE_TELEGRAM_BOT_USERNAME`, `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY` | Public, compiled at build time; not substitutes for backend enforcement or server credentials. |

Development/smoke/design helper names are not deployment requirements:
`VC_SMOKE_HTTP_BASE`, `VC_SMOKE_WS_BASE`, `VC_SMOKE_MARKER`, `VC_SMOKE_PHASE`,
`VC_UI_SOURCE_ROOT`, `UI_PREVIEW_RUNDOWN`. Vite's built-in `DEV` flag is not a
required deploy secret. `.env.example` does not cover every runtime name above,
and `.dev.vars.example` is not the same as the Container forwarding allowlist.

## 4. Dead, duplicated, and historical artifacts

- **Explicitly inactive/reference-only:** `render.yaml`. Retention is documented;
  it should not be mistaken for a production source of truth. The old systemd
  service is only described as disabled in `DEPLOY.md`; its actual existence or
  state is **unverified**, not evidence of a tracked service file to delete.
- **Exact document duplicate:** `ROOM-ADMIN.md` and `docs/ROOM-ADMIN.md` have the
  same Git blob. Other overlapping pairs differ: root/docs versions of
  `APPLE-MUSIC-WIDGET.md`, `OFFER-FREE.md`, and `VIDEO-PIPELINE.md`. These provide
  multiple maintenance points; differences are not automatically dead content.
- **Exact asset/license duplicate:** `licenses/uiverse-spotify-player.txt` and
  `public/assets/uiverse-spotify-player.txt`. This can be intentional license
  distribution; do not remove it on duplication alone.
- **Duplicated dependency resolution with drift:** npm and pnpm lockfiles, as
  described above. npm is the path actually selected by Docker and tracked CI.
- **Orphaned documented commands:** README's `cf:*` commands have no package
  scripts. Worker files/config are an incomplete alternate deploy path on main,
  not proven dead code. The branch restoring tooling is separately listed above.
- **Unapplied sidecar template:** `deploy/mediamtx.yml`; no tracked deployment
  script launches/applies it. Manual use outside Git is **unverified**.
- `PRD.md`, `NEBU-MVP.md`, `MVP-VIDEOCHAT.md`, `MEDIA-PLANE.md`, design snapshots,
  and handoff docs retain historical/proposal information. This audit does not
  label all unreferenced docs, tests, or design files dead merely because they are
  not copied into the runtime image.

## 5. Known risks and dependency status

### Secrets in history / handling

**No confirmed secret leak was established by this audit.** A heuristic check of
1,111 unique text blobs reachable from fetched refs (up to 2 MB per blob, excluding
binary blobs) found no matches for private-key blocks, GitHub tokens, Telegram
bot-token format, AWS access-key IDs, or JWT literals. The sensitive-path history
check surfaced `.env.example`, not a committed `.env`, `.dev.vars`, private-key,
or MTProto session file. No matched contents or secret values were printed.

This is **not** an exhaustive secret scanner or credential-validity test. Generic
passwords/operator signing strings, encoded credentials, large/binary blobs,
deleted/unreachable history, provider-side secrets, and rsynced host files remain
**unverified**. Git ignore rules protect future additions but do not erase old
commits. Session strings/files and Apple signing keys are particularly sensitive.
Do not infer “safe history” from absence of these patterns.

The `DEPLOY.md` rsync example excludes `.git`, dependencies, build output, and
data but does not exclude `.env*`, `.dev.vars`, or `.auth-proof`. These paths are
excluded from Docker's build context, but could still reach the remote source
directory if present locally. The documented environment backup also creates
additional credential-bearing files on the host. Host access controls, backup
retention, actual leakage, and any need for credential rotation are
**unverified**. Follow `SECURITY.md`'s private reporting policy for any later
confirmed sensitive finding; do not paste credentials into issues or this audit.

### npm lockfile advisories

On 2026-10-03, `npm audit --package-lock-only --ignore-scripts --json` reported
**19 affected packages: 11 high, 7 moderate, 1 low, 0 critical**. This is a
registry advisory result for main's npm lockfile, not a report of exploitation
or of packages installed on a live host. No audit fix or dependency update was
applied. Versions below are the top-level locked occurrences; some packages also
have nested occurrences in the audit's dependency graph.

| Package | Locked version | Reported severity |
|---|---|---|
| `@hono/node-server` | 2.0.8 | Moderate |
| `@humanfs/node` | 0.16.7 | Moderate |
| `@vitest/mocker` | 3.2.7 | Moderate |
| `ajv` | 6.12.6 | Moderate |
| `brace-expansion` | 1.1.12 | High |
| `concurrently` | 10.0.3 | High |
| `dompurify` | 3.4.13 | Low |
| `flatted` | 3.3.3 | High |
| `hono` | 4.12.30 | Moderate |
| `js-yaml` | 4.1.1 | High |
| `lodash` | 4.17.23 | High |
| `minimatch` | 3.1.2 | High |
| `nanoid` | 3.3.15 | High |
| `picomatch` | 4.0.3 | High |
| `postcss` | 8.5.16 | High |
| `shell-quote` | 1.8.4 | High |
| `uuid` | 11.1.0 | Moderate |
| `vite` | 7.2.6 | High |
| `vitest` | 3.2.7 | Moderate |

Prioritize the runtime Hono/Node adapter surface: the adapter advisory is an
unauthenticated aborted-WebSocket-handshake memory-leak DoS
([GHSA-9mqv-5hh9-4cgg](https://github.com/advisories/GHSA-9mqv-5hh9-4cgg)).
Hono also has multiple advisories, including CORS ReDoS
([GHSA-8j4g-w8fx-2239](https://github.com/advisories/GHSA-8j4g-w8fx-2239)).
Vite/Vitest and glob/YAML tooling findings must be separated from live request
reachability; Docker uses `npm ci --omit=dev`, but some build/test packages occur
in the production dependency graph too. The image entrypoint uses `tsx`, not a
Vite dev server. **Live exploitability and installed dependency versions are
unverified.** An audit recommendation includes a semver-major Vitest change;
automatic fixes are not appropriate within this read-only task.

Open Dependabot PRs independently show version drift (not necessarily security
fixes): #81 framer-motion 12.23.25 → 13.4.4; #80 posthog-js 1.414.0 → 1.434.14;
#75 react-collapsible 1.1.12 → 1.1.20; #74 react-avatar 1.1.11 → 1.2.6;
#73 eslint-plugin-react-refresh 0.4.24 → 0.5.7. These PRs were open at audit time.

### Additional operational risks

- The Docker base tag is mutable, apt dependencies are unpinned, and Python
  Telethon/py-tgcalls installs use version ranges without a Python lockfile.
  Rebuilding the same commit can change its environment. This does not establish
  that Node 22 or those libraries are unsupported; installed versions and image
  vulnerability status are **unverified**.
- Production without `ALTCHA_HMAC_KEY` boots with a warning and disables
  proof-of-work enforcement (`server/env.ts:166–183`). Actual enforcement live is
  **unverified**. Frontend captcha/demo controls do not prove server protection.
- Room/media/MTProto state can be lost on replacement or sleep without durable
  storage; a health check does not establish DB schema, paired sessions, TURN
  connectivity, RTMP sidecar readiness, or end-to-end A/V.
- MTProto user sessions carry account risk; STUN without TURN does not serve all
  networks; mesh limits are not equivalent to SFU/broadcast capacity. The
  product/media docs identify these constraints, but live readiness is
  **unverified**.

## 6. Follow-up evidence needed (not performed)

With separate authorization, record immutable deployed source SHAs/image digests
for **each** service, its env-name presence (never values), listening port,
durable mounts, DB schema/migration status, enabled adapters, and ingress mapping.
Reconcile the Hermes port instructions, restore/verify the intended Cloudflare
toolchain, select one dependency lockfile authority, consolidate overlapping
runbooks, and triage advisories in scoped follow-ups. Preserve NEBU's Better Auth
login requirement; do not revive a legacy login path as a workaround.

This audit changes only this document. It does not merge, deploy, publish a
service, change DNS/provider settings, or access any Vellum/Fenrir repository or
service. All assertions about the **current live state remain unverified**.
