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

The old `stix-vc-node.service` systemd unit on port 8788 has been disabled. It was a stale
second copy with a different issuer and `mediaPlaneEnabled: false`; do not re-enable it.
Production is only the `vc-node` Docker container on port 8797.

## RTMP ingest

VC Node can run a separate, authenticated MediaMTX sidecar as its RTMP ingest. It is
not proxied through Cloudflare: publishers reach the Hermes public IP on TCP 1935. The
firewall rule must be added deliberately, and only after the sidecar is healthy.

The sidecar gets its credentials from `/opt/vc-node.env`; never write them into git or
the MediaMTX template. It runs on the `vc-media` Docker network so the Telegram adapter
can pull `rtmp://vc-rtmp:1935/vc` without exposing a control API publicly.

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
ssh hermes 'docker run -d --name vc-node-canary --network vc-media --env-file /opt/vc-node.env \
              -e PORT=8799 -p 127.0.0.1:8799:8799 vc-node:<tag>
            curl -s localhost:8799/healthz'

# 5. swap
ssh hermes 'docker stop vc-node && docker rename vc-node vc-node-previous
            docker run -d --name vc-node --restart unless-stopped \
            --network vc-media --env-file /opt/vc-node.env -p 127.0.0.1:8797:8797 \
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

## Identity

VC Node uses **Supabase FriskyDev only** for primary identity: Google, Apple, and
Microsoft. It has no active Authentik fallback. `/v1/config/public` always advertises
`identityProvider: "supabase"`; when Supabase settings are missing the UI names the
configuration problem rather than exposing a different login path.

**`docker restart` is not enough.** `--env-file` is read once when a container is
*created*, so recreate `vc-node` after changing identity settings and verify:

```bash
curl -fsS https://vc.friskydev.com/v1/config/public | jq '{identityProvider, identityReady}'
```

### Required Supabase redirect allow-list

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
