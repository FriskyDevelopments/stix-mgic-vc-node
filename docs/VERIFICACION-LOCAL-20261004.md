# Verificación local — 2026-10-04 (rama gen/nebu-20261004)

El primer commit es una copia de los 13 archivos staged de Better Auth D1 que estaban sin commitear en la rama `build`
(la rama y el árbol originales no se tocaron). Resultados con Node 22:

    npm ci --ignore-scripts
    npx tsc --noEmit && npx tsc -p server/tsconfig.json --noEmit   # OK
    npx vitest run            # 95 archivos / 800 tests OK
    npm run build             # OK (vite; aviso de chunks >500 kB)
    npx wrangler deploy --dry-run --config wrangler.nebu-app.jsonc   # empaqueta OK (no despliega)
    npx wrangler deploy --dry-run --config wrangler.jsonc            # no corre: requiere Docker (Containers); no hay Docker en esta máquina

## Pendiente (no se hizo)
- Secretos (solo nombres, ver `.env.example`): BETTER_AUTH_SECRET, DATABASE_URL, SUPABASE_*, CLOUDFLARE_REALTIME_*, CLOUDFLARE_TURN_*,
  TELEGRAM_*, OAuth (Google/Apple/Microsoft/Discord/OIDC), OPERATOR_TOKEN_SECRET.
- Aplicar migración D1 `migrations/0001_better_auth.sql`, `wrangler login` y `cf:deploy`: decisión y cuenta de Mty.dude.
