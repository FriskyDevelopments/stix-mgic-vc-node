# Deploying VC node

`render.yaml` and `vercel.json` are **not** how production runs. Production is a Docker
container on the `hermes` box, published through a cloudflared tunnel. Reading `render.yaml`
and assuming a git-push deploy will waste your time — its `MEDIA_PLANE_ENABLED: "false"`
disagrees with live, and `stix-mgic-vc-node.onrender.com` returns 404.

## What actually serves vc.friskydev.com

| | |
|---|---|
| Host | `hermes` (`ssh hermes`, reachable headlessly) |
| Container | `vc-node`, published on `127.0.0.1:8797` |
| Ingress | cloudflared tunnel → `vc.friskydev.com` |
| Source | `/opt/vc-node-src` (plain rsync target, **not** a git clone) |
| Env | `/opt/vc-node.env` |
| State | `/opt/vc-node-data` mounted at `/data` |

There is also a `stix-vc-node.service` systemd unit on port 8788. It is **stale** and does
not serve production — its healthz reports a different issuer and `mediaPlaneEnabled: false`.

## Deploy

```bash
# 1. sync source (from a clean working tree)
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude dist --exclude data \
  ./ hermes:/opt/vc-node-src/

# 2. snapshot for rollback BEFORE changing anything
ssh hermes 'docker tag vc-node:<current> vc-node:rollback-$(date +%Y%m%d)
            cp /opt/vc-node.env /opt/vc-node.env.bak-$(date +%Y%m%d)'

# 3. build
ssh hermes 'cd /opt/vc-node-src && docker build -t vc-node:<tag> .'

# 4. canary on a spare port first — never swap blind
ssh hermes 'docker run -d --name vc-node-canary --env-file /opt/vc-node.env \
              -e PORT=8799 -p 127.0.0.1:8799:8799 vc-node:<tag>
            curl -s localhost:8799/healthz'

# 5. swap
ssh hermes 'docker stop vc-node && docker rename vc-node vc-node-previous
            docker run -d --name vc-node --restart unless-stopped \
              --env-file /opt/vc-node.env -p 127.0.0.1:8797:8797 \
              -v /opt/vc-node-data:/data vc-node:<tag>
            docker rm -f vc-node-canary'
```

Keep `vc-node-previous` stopped rather than removed — rollback is then one command.

## Rollback

```bash
ssh hermes 'docker rm -f vc-node
            docker rename vc-node-previous vc-node
            docker start vc-node'
```

If the env changed too, restore `/opt/vc-node.env.bak-<date>` first.

## Identity provider

`IDENTITY_PROVIDER` in `/opt/vc-node.env` selects the sign-in surface at runtime:

- `authentik` (default) — OIDC against `authentik.friskydev.com`. Proven in production.
- `supabase` — Supabase FriskyDev, the Fenrir master identity (`auth.users.id`), the same
  project and SSO providers LORE uses.

Switching is an env edit plus `docker restart vc-node`. No rebuild, because the value is
served from `/v1/config/public` rather than inlined into the bundle. The server refuses to
advertise `supabase` unless `SUPABASE_URL` and `SUPABASE_ANON_KEY` are also set.

### Before switching to `supabase`

`https://vc.friskydev.com/**` must be in the FriskyDev project's redirect allow-list
(Dashboard → Authentication → URL Configuration → Redirect URLs). Until it is, Supabase
resolves the OAuth callback to the project Site URL (`https://www.myfenrir.com`) and
sign-in dead-ends.

Verify from the CLI — this needs no browser:

```bash
# with the service-role key; creates and deletes a throwaway user
curl -s -X POST "$SB/auth/v1/admin/generate_link" \
  -H "apikey: $SR" -H "authorization: Bearer $SR" -H 'content-type: application/json' \
  -d '{"type":"magiclink","email":"<throwaway>","redirect_to":"https://vc.friskydev.com/"}' \
  | grep -o 'redirect_to=[^&"]*'
```

If it echoes `vc.friskydev.com`, the allow-list is correct. If it echoes
`www.myfenrir.com`, it is not — do not switch.
