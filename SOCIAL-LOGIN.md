# VC Node — Social login real vía Authentik (broker) — estado y bloqueo exacto

Decisión de Francisco: **Authentik como broker** (descartada la reutilización directa de Supabase).
El vc node **no cambia**: se queda con su flujo OIDC actual a Authentik (estable con `ka-fix`).
El trabajo real es habilitar el social **en Authentik** (crear Sources OAuth y engancharlas al flow).

## Lo que quedó verificado (headless)

- **vc node → Authentik OIDC**: correcto y estable. Discovery viva, PKCE S256, callback arreglado
  (Max-Age 1800, safe-retry, no-store) y 502 keep-alive resuelto. **No se toca.**
- **Dónde corre Authentik:** host `authentik` (alias SSH = box racknerd/node1), detrás de Cloudflare.
  `authentik.friskydev.com/` → 302 (vivo).
- **`default-authentication-flow` tiene `sources: []`** → por eso el "Continue" muestra user/pass, no social.
- **Las Sources de Authentik son compartidas**: una Google Source sirve a la vez para el vc node y
  para el Community Gate (coordinar con ese lane — crear Google UNA vez).

## Bloqueo EXACTO (por qué no pude crearlas headless ahora)

1. **Acceso admin a Authentik = no headless.** El box `authentik` responde a SSH solo vía
   **Tailscale con auth interactiva** (pide `https://login.tailscale.com/a/...`). No hay sesión headless.
2. **No hay token de API de Authentik accesible.** El service account de 1Password ve 2 vaults
   (`frisky`, `FriskyDev-Infra`); revisé todos los títulos y los labels de los items candidatos
   (Fenrir Community, FriskyDev Infra, Friskydev Nango, Infisical, STIX) → **ningún `AUTHENTIK_*TOKEN`
   ni akadmin**. La `vc-node.env` en hermes solo tiene el *client* OIDC (`OIDC_CLIENT_ID/SECRET`),
   no un token admin. Sospecha: el token real vive en **Infisical** (el "Secret Center"; su item en
   1Password son sus propias creds admin) — habría que entrar a Infisical para sacarlo.
3. **No hay creds de Google OAuth accesibles.** Ni en los 2 vaults de 1Password. Los proveedores
   sí están LIVE en el proyecto Supabase de MyFenrir (google/apple/azure), pero sus **client_secret
   no se exponen** por la anon key.

→ No inventé nada. Faltan 2 secretos para poder cablear Google (mínimo): **token API de Authentik**
   y **client_id/secret de Google**.

## ¿Reusar el OAuth client de Google que ya usa Supabase, o crear uno nuevo?

**Se puede reusar** (lo más corto): en Google Cloud Console, al MISMO OAuth client que hoy usa
Supabase, **añadir una Authorized redirect URI extra**:
`https://authentik.friskydev.com/source/oauth/callback/google/`
y usar ese `client_id`/`client_secret` en la Authentik Source. (El de Supabase seguirá funcionando en
paralelo con su propia redirect `…supabase.co/auth/v1/callback`.) Si Francisco prefiere aislar, crea
un client nuevo — mismo redirect de Authentik. **Apple/Microsoft** son análogos pero más laboriosos
(Apple Services ID + key; Azure app registration) → empezar por **Google**.

## Qué dejé LISTO para cablear (headless en 1 comando)

Script: **`authentik-add-google-source.sh`** (en tus outputs). Crea la Google OAuth Source vía API de
Authentik y la engancha al `default-authentication-flow` (Identification stage → `sources`), sin
hardcodear secretos (los lee del entorno). En cuanto tengas el token + creds:

```bash
AUTHENTIK_URL=https://authentik.friskydev.com \
AUTHENTIK_TOKEN=<token-admin-authentik> \
GOOGLE_CLIENT_ID=<google-client-id> \
GOOGLE_CLIENT_SECRET=<google-client-secret> \
  bash authentik-add-google-source.sh
```

## Pasos mínimos para Francisco (lo que requiere dashboard/secretos)

1. **Google Cloud Console** → el OAuth client (reusar el de Supabase o crear "Web application"):
   añadir Authorized redirect URI: `https://authentik.friskydev.com/source/oauth/callback/google/`.
   Copiar `client_id` + `client_secret` → Secret Center.
2. **Token admin de Authentik**: en Authentik (Directory → Tokens, usuario akadmin) generar un API
   token, o dármelo desde Infisical. → Secret Center.
3. Correr el script de arriba (yo puedo ejecutarlo headless en cuanto inyectes esos 2 secretos como env),
   **con tu OK** (crea config en el Authentik de prod compartido).
4. Verificar: aparece "Sign in with Google" en el flow y el login social real funciona desde vc.friskydev.com.
   (Apple/MS después, mismo patrón.)

> NO se desplegó ni modificó Authentik. vc node intacto (sigue en `ka-fix`).
