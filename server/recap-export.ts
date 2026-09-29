/**
 * recap-export.ts — send the session recap to the operator's own cloud.
 *
 * The recap (room name, participants, playlist position, artwork ids, listen links)
 * is the operator's artifact, so it uploads with the OPERATOR's OAuth token — the
 * node never holds a Google/Microsoft/Dropbox client secret and never sees a refresh
 * token. Flow: the browser completes the provider's OAuth code exchange, hands the
 * node a short-lived access token + the recap JSON, the node PUTs/POSTs the bytes to
 * the provider upload API with that token, and the token is never stored.
 *
 * Providers (all plain HTTPS upload APIs, no SDKs):
 *   - Google Drive: multipart upload to
 *     `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`.
 *     Scope: `https://www.googleapis.com/auth/drive.file` (app-created files only).
 *   - OneDrive: `PUT https://graph.microsoft.com/v1.0/me/drive/root:/<name>:/content`.
 *     Scope: `Files.ReadWrite`.
 *   - Dropbox: `POST https://content.dropboxapi.com/2/files/upload` with the
 *     `Dropbox-API-Arg` header. Scope: `files.content.write`.
 *
 * iCloud has no browser/server upload API — Apple exposes CloudKit JS for app data,
 * not file upload to a user's iCloud Drive. On Apple devices the recap saves to the
 * local synced folder instead (see `RECAP-EXPORT.md`); that path is DOCUMENTED, not
 * implemented here, because there is nothing to implement server-side.
 *
 * Guardrails: recap JSON is capped at 256KB, the filename is sanitized to
 * `[A-Za-z0-9._-]` (no path traversal), and the access token travels in the request
 * body (never a query string, never logged, never persisted).
 */

export type RecapProvider = 'google-drive' | 'onedrive' | 'dropbox'

export const RECAP_PROVIDERS: RecapProvider[] = ['google-drive', 'onedrive', 'dropbox']

export const RECAP_MAX_BYTES = 256 * 1024

export type RecapUploadInput = {
  provider: RecapProvider
  /** Short-lived operator OAuth access token. Never stored, never logged. */
  accessToken: string
  /** Recap payload the operator's browser assembled. */
  recap: Record<string, unknown>
  /** Operator-chosen filename, sanitized before use. */
  filename?: string
}

export type RecapUploadResult = {
  provider: RecapProvider
  /** Provider file id when the API returns one (Drive id, OneDrive id, Dropbox id). */
  fileId: string | null
  filename: string
  bytes: number
}

export function sanitizeRecapFilename(filename: string | undefined, fallback = 'nebu-recap.json'): string {
  // Strip path separators FIRST so traversal segments collapse before the character
  // allowlist runs — '..' would otherwise survive as dots and stay ugly (if harmless,
  // since providers treat the name as opaque and we never join it to a local path).
  const basename = (filename || '').split(/[\\/]/).pop() || ''
  const cleaned = basename.trim().replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^\.+/, '').replace(/_+(\.[A-Za-z0-9]+)?$/, '$1').slice(0, 80) || fallback
  return cleaned.includes('.') ? cleaned : `${cleaned}.json`
}

function recapBytes(recap: Record<string, unknown>): Buffer | null {
  let json: string
  try {
    json = JSON.stringify(recap)
  } catch {
    return null
  }
  const bytes = Buffer.from(json, 'utf8')
  if (bytes.length === 0 || bytes.length > RECAP_MAX_BYTES) return null
  return bytes
}

type UploadDeps = {
  fetchImpl?: typeof fetch
}

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`
}

async function readFileId(response: Response, paths: string[]): Promise<string | null> {
  try {
    const body = (await response.json()) as Record<string, unknown>
    for (const path of paths) {
      const value = path.split('.').reduce<unknown>((node, key) => {
        if (node !== null && typeof node === 'object' && key in (node as Record<string, unknown>)) {
          return (node as Record<string, unknown>)[key]
        }
        return undefined
      }, body)
      if (typeof value === 'string' && value) return value
    }
  } catch {
    // Some providers answer 200 with an empty body on overwrite — id unknown, still success.
  }
  return null
}

async function uploadGoogleDrive(
  accessToken: string,
  filename: string,
  bytes: Buffer,
  fetchImpl: typeof fetch
): Promise<RecapUploadResult> {
  const boundary = `nebu-recap-${Date.now().toString(36)}`
  const header = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: filename, mimeType: 'application/json' }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    'utf8'
  )
  const footer = Buffer.from(`\r\n--${boundary}--`, 'utf8')
  const body = Buffer.concat([header, bytes, footer])
  const response = await fetchImpl('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      authorization: bearer(accessToken),
      'content-type': `multipart/related; boundary=${boundary}`,
      'content-length': String(body.length),
    },
    body,
  })
  if (!response.ok) {
    throw new Error(`Google Drive upload failed (${response.status})`)
  }
  return {
    provider: 'google-drive',
    fileId: await readFileId(response, ['id']),
    filename,
    bytes: bytes.length,
  }
}

async function uploadOneDrive(
  accessToken: string,
  filename: string,
  bytes: Buffer,
  fetchImpl: typeof fetch
): Promise<RecapUploadResult> {
  const response = await fetchImpl(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(filename)}:/content`,
    {
      method: 'PUT',
      headers: {
        authorization: bearer(accessToken),
        'content-type': 'application/json',
        'content-length': String(bytes.length),
      },
      body: bytes,
    }
  )
  if (!response.ok) {
    throw new Error(`OneDrive upload failed (${response.status})`)
  }
  return {
    provider: 'onedrive',
    fileId: await readFileId(response, ['id']),
    filename,
    bytes: bytes.length,
  }
}

async function uploadDropbox(
  accessToken: string,
  filename: string,
  bytes: Buffer,
  fetchImpl: typeof fetch
): Promise<RecapUploadResult> {
  const response = await fetchImpl('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      authorization: bearer(accessToken),
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.length),
      'Dropbox-API-Arg': JSON.stringify({
        path: `/${filename}`,
        mode: 'overwrite',
        autorename: true,
        mute: false,
      }),
    },
    body: bytes,
  })
  if (!response.ok) {
    throw new Error(`Dropbox upload failed (${response.status})`)
  }
  return {
    provider: 'dropbox',
    fileId: await readFileId(response, ['id']),
    filename,
    bytes: bytes.length,
  }
}

export function isRecapProvider(value: unknown): value is RecapProvider {
  return value === 'google-drive' || value === 'onedrive' || value === 'dropbox'
}

export async function uploadRecap(
  input: RecapUploadInput,
  deps: UploadDeps = {}
): Promise<RecapUploadResult> {
  const fetchImpl = deps.fetchImpl ?? fetch
  if (!isRecapProvider(input.provider)) {
    throw new Error('Unknown recap provider. Expected google-drive|onedrive|dropbox')
  }
  if (!input.accessToken || typeof input.accessToken !== 'string') {
    throw new Error('A short-lived operator OAuth access token is required')
  }
  if (!input.recap || typeof input.recap !== 'object' || Array.isArray(input.recap)) {
    throw new Error('Recap must be a JSON object')
  }
  const bytes = recapBytes(input.recap)
  if (!bytes) {
    throw new Error(`Recap must serialize to 1–${RECAP_MAX_BYTES} bytes of JSON`)
  }
  const filename = sanitizeRecapFilename(input.filename)
  switch (input.provider) {
    case 'google-drive':
      return uploadGoogleDrive(input.accessToken, filename, bytes, fetchImpl)
    case 'onedrive':
      return uploadOneDrive(input.accessToken, filename, bytes, fetchImpl)
    case 'dropbox':
      return uploadDropbox(input.accessToken, filename, bytes, fetchImpl)
  }
}
