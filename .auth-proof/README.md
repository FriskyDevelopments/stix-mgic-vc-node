# Supabase FriskyDev identity — verification evidence

Captured locally against the live FriskyDev Supabase project
(`yqevglppbhuoxxfsfnih`), production build, `AUTH_REQUIRED=true`.

- `01-signed-out.png` — SSO-only gate (Google / Apple / Microsoft). Room controls
  locked: "Sign in with FriskyDev ID to continue".
- `02-signed-in.png` — signed in via a real Supabase-issued JWT. The gate shows the
  bare `auth.users.id`, and the room section is unlocked.

The round-trip exercised: real Supabase JWT -> POST /v1/auth/supabase/session ->
node verifies with Supabase /auth/v1/user -> mints vc_session -> room created with
`ownerOperatorId` equal to the `auth.users.id` -> WebSocket signaling accepted
(401 without the cookie).

The throwaway Supabase user used for the capture was deleted afterwards.
