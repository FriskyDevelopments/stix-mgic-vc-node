# Recap export — Google Drive + OneDrive + Dropbox (and why iCloud is different)

Where the session recap goes after the set. The recap is the operator's artifact —
room name, participants, playlist position, artwork ids, listen links — so it
uploads with the OPERATOR's OAuth token to the OPERATOR's own cloud. The node never
holds a Google/Microsoft/Dropbox client secret and never sees a refresh token.

## How it works

1. The operator connects their cloud account in the browser (the provider's normal
   OAuth consent screen — Google / Microsoft / Dropbox).
2. The browser assembles the recap JSON and POSTs it to the node with a
   SHORT-LIVED access token:
   `POST /v1/recap/export` `{ provider, accessToken, recap, filename? }`.
3. The node PUTs/POSTs the bytes to the provider upload API with that token and
   forgets it. The token never touches a query string, a log, or the disk.
4. The node answers `{ provider, fileId, filename, bytes }`.

The route is operator-gated like every live-control surface (`requireLiveOperator`
+ the exact/wildcard pairing — see the audit note in `server/app.ts`). Recap JSON
is capped at 256KB; the filename is sanitized so a hostile name cannot traverse.

## Provider setup (owner-held — nothing below lives in this repo)

| Provider | Upload API | OAuth scope needed | Owner provisions |
|---|---|---|---|
| Google Drive | `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` | `https://www.googleapis.com/auth/drive.file` (app-created files only) | Google Cloud console OAuth client ID |
| OneDrive | `PUT https://graph.microsoft.com/v1.0/me/drive/root:/<name>:/content` | `Files.ReadWrite` | Azure app registration |
| Dropbox | `POST https://content.dropboxapi.com/2/files/upload` (+ `Dropbox-API-Arg` header) | `files.content.write` | Dropbox App Console |

Zero node-side secrets for all three: the client ID lives in the browser-facing
OAuth flow, the client secret (where the provider requires one) stays in the
operator's own exchange path — never in `/opt/vc-node.env`, never in git.

## iCloud — save to the synced folder (Apple devices only)

iCloud has no browser/server file-upload API. Apple exposes CloudKit JS for
structured app data, not file upload into a user's iCloud Drive, and there is no
OAuth scope that grants a third-party server write access to it. So on Apple
devices the recap path is:

1. The studio UI offers "Save recap" → downloads `nebu-recap.json` to the device.
2. The operator moves it into any iCloud-Drive-synced folder (Files app → iCloud
   Drive). Sync, versioning, and sharing are then Apple's, not ours.

That is documented, not implemented server-side — there is deliberately no
`icloud` provider in `POST /v1/recap/export` (unknown providers are rejected
with 400 naming the three real ones). If Apple ever ships a Drive-style upload
API, it slots in as a fourth provider behind the same operator-token shape.

## Errors (honest, no silent drops)

| Case | Status |
|---|---|
| Unknown provider (incl. `icloud`) | 400 naming the three supported providers + the iCloud doc pointer |
| Missing access token / non-object recap / recap over 256KB | 400 |
| Provider API refuses (expired token, quota, outage) | 502 with the provider status, token never echoed |

A provider failure never fabricates success: no `fileId`, no "saved" copy.
