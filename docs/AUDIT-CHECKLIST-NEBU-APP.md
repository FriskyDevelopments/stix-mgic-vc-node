# NEBU app audit checklist

Audited the checked-out repository on 2026-10-03. PASS means repository evidence
supports the check, not that production was exercised. FAIL means a concrete gap;
UNKNOWN means unverified. No deployment, external provider calls, or infrastructure
changes were made. Environment variable names only are listed below.

| # | Check | Result | File-path evidence and limits |
| --- | --- | --- | --- |
| 1 | Apple and Google login, always Better Auth | FAIL | `server/betterAuth.ts` configures both providers; `src/lib/nebu-auth-client.ts` uses `better-auth/client`; `src/components/NebuLogin.tsx` calls that client. However, `src/main.tsx` checks `isNebuStudioRoute` before `/login`, and `src/lib/nebu-host.ts` matches all NEBU-host paths, shadowing the product login. `SOCIAL-LOGIN.md` describes legacy Authentik, not this product flow; the operator link in `src/lib/nebu-ashy-walkthrough.ts` still advertises non-Better-Auth login. Provider credentials and live login are unverified. No authentication code was changed. |
| 2 | Google Drive integration | FAIL | `server/betterAuth.ts` registers Google sign-in only. Review of `src/` and `server/` found no Drive API client, Drive scopes, or Drive connect flow; `src/lib/nebu-auth-client.ts` is a login client, not Drive integration. External integrations are unverified. |
| 3 | `vc` permission | UNKNOWN | `server/operator-auth.ts` and `server/supabase-auth.ts` resolve operator identity; `server/discord-commands.ts` defines a `vc` command, not an entitlement. No explicit `vc` permission enforcement was identified in the reviewed app/auth code. Upstream permission claims and the intended permission contract are unverified. |
| 4 | Virtual camera | PASS | `src/App.tsx` exposes OBS Virtual Camera input; `src/components/PreviewPanel.tsx` handles it; `src/App.camera-preflight.test.ts` covers camera preflight. Actual hardware and OS virtual-camera output are unverified; this is browser camera input support, not installation of an OS camera driver. |
| 5 | `/healthz` | PASS | `server/app.ts` registers JSON health with `ok`; `server/app.test.ts` exercises HTTP 200. `workers/ashy-unit.ts` forwards app requests to the container and uses this health endpoint. Live Worker/container health is unverified. |
| 6 | `/login` | FAIL | `src/main.tsx` declares the route and `server/index.ts` serves the production SPA fallback, but the earlier NEBU-host Studio predicate in `src/lib/nebu-host.ts` shadows it. Local non-NEBU-host rendering is smoke-tested; NEBU-host acceptance remains `it.todo`. |
| 7 | `/units/ashy` walkthrough | FAIL | `src/components/NebuAshyWalkthrough.tsx` and `src/lib/nebu-ashy-walkthrough.ts` implement the walkthrough; `src/main.tsx` declares both slash variants. The same earlier Studio predicate shadows them on NEBU hosts. Local rendering is smoke-tested; NEBU-host acceptance remains `it.todo`. |
| 8 | Studio secondary to Ashy/Telethon CTA | PASS | `src/components/NebuLanding.tsx` now gives the hero's filled primary CTA to Ashy's walkthrough and uses muted/outlined Studio links, including supporting cards and closing CTA. `src/components/NebuAshyWalkthrough.tsx` already uses a supporting Studio chip and an Ashy open-path footer. Links remain available. This does not fix NEBU-host route precedence. |
| 9 | Pricing consistency | FAIL | `src/lib/nebu-ashy-walkthrough.ts` quotes hosted units at approximately $29–49/month; `HOSTED-SKU.md` specifies $19/month and `OFFER-FREE.md` repeats $19 hosted subscribers. There is no explicit reconciliation of these offers in the reviewed product copy. Current billing is unverified. |
| 10 | Environment variable names documented | PASS | `docs/NEBU-LOGIN.md`, `.env.example`, `.dev.vars.example`, and `docs/cloudflare-containers.md` document configuration; `workers/container-env.ts` defines forwarding. Product auth names: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`. `server/betterAuth.ts` also accepts `MS_CLIENT_ID` and `MS_CLIENT_SECRET`. Runtime presence is unverified. |
| 11 | No secrets committed | UNKNOWN | `.gitignore` excludes local environment files, `.dev.vars`, auth proof, and Telethon sessions. A bounded scan of tracked working-tree files for private-key headers and common AWS/GitHub token formats flagged no files. This is not a full history scan or proof that all secret types are absent; repository-wide/history absence remains unverified. No secret values were printed or added. |
| 12 | Wrangler config matches deployed Worker | UNKNOWN | `wrangler.jsonc` points to `workers/ashy-unit.ts` and binds `ASHY_UNIT` to `AshyUnit`, consistent with the code and `workers/container-env.ts`. The requested `wrangler.nebu-app.jsonc` and `docs/STUDIO-NEBU-QUEST-ATTACH.md` are absent from this checkout. Deployed Worker identity, routes, bindings, and configuration are unverified; no Cloudflare access or deployment was performed. |

## Smoke-test scope

Vitest exercises the in-process Hono health route and the real SPA entry point on
a local non-NEBU hostname. Better Auth's browser provider is mocked; Apple and
Google clicks must use its social sign-in API. Network calls are prohibited and
no provider credentials or database are needed. NEBU-host login and walkthrough
acceptance are explicitly `it.todo` because the declared routes are shadowed, not
because new routes should be invented. Production SPA asset serving and Worker
deployment remain unverified.

`docs/AUDIT-MAIN-VS-DEPLOY.md` is outside this audit's write scope and was not changed.
