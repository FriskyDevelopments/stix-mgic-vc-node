import { describe, expect, it, vi } from 'vitest'
import {
  isRecapProvider,
  sanitizeRecapFilename,
  uploadRecap,
  RECAP_MAX_BYTES,
} from './recap-export'

const recap = { room: 'Friday set', tracks: [{ id: '1440857795', listenLink: '/l/1440857795' }] }

function okFetch(body: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response)
}

describe('recap-export — operator-token uploads, never node secrets', () => {
  it('uploads to Google Drive with a multipart body and returns the file id', async () => {
    const fetchImpl = okFetch({ id: 'drive-file-1' })
    const result = await uploadRecap(
      { provider: 'google-drive', accessToken: 'ya.test', recap },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    )
    expect(result).toMatchObject({ provider: 'google-drive', fileId: 'drive-file-1', filename: 'nebu-recap.json' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('googleapis.com/upload/drive/v3/files')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer ya.test')
    expect(String((init.headers as Record<string, string>)['content-type'])).toContain('multipart/related')
  })

  it('uploads to OneDrive with a PUT to the app-root path', async () => {
    const fetchImpl = okFetch({ id: 'onedrive-item-1' })
    const result = await uploadRecap(
      { provider: 'onedrive', accessToken: 'ms.test', recap, filename: 'friday-set' },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    )
    expect(result).toMatchObject({ provider: 'onedrive', fileId: 'onedrive-item-1', filename: 'friday-set.json' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/drive/root:/friday-set.json:/content')
    expect(init.method).toBe('PUT')
  })

  it('uploads to Dropbox with the API-arg header and overwrite mode', async () => {
    const fetchImpl = okFetch({ id: 'id:dropbox-1' })
    const result = await uploadRecap(
      { provider: 'dropbox', accessToken: 'dbx.test', recap },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    )
    expect(result).toMatchObject({ provider: 'dropbox', fileId: 'id:dropbox-1' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://content.dropboxapi.com/2/files/upload')
    const arg = JSON.parse((init.headers as Record<string, string>)['Dropbox-API-Arg'])
    expect(arg.mode).toBe('overwrite')
    expect(arg.path).toBe('/nebu-recap.json')
  })

  it('succeeds without a file id when the provider answers an empty body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('empty body') },
    } as unknown as Response)
    const result = await uploadRecap(
      { provider: 'google-drive', accessToken: 'ya.test', recap },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    )
    expect(result.fileId).toBeNull()
    expect(result.bytes).toBeGreaterThan(0)
  })

  it('rejects an unknown provider without touching the network', async () => {
    const fetchImpl = okFetch()
    await expect(
      uploadRecap(
        { provider: 'icloud' as never, accessToken: 'x', recap },
        { fetchImpl: fetchImpl as unknown as typeof fetch }
      )
    ).rejects.toThrow('Unknown recap provider')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('requires an access token and a JSON-object recap', async () => {
    const fetchImpl = okFetch()
    await expect(
      uploadRecap({ provider: 'dropbox', accessToken: '', recap }, { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow('access token')
    await expect(
      uploadRecap({ provider: 'dropbox', accessToken: 'x', recap: ['nope'] as unknown as Record<string, unknown> }, { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow('JSON object')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a recap past the size cap', async () => {
    const fetchImpl = okFetch()
    const big = { padding: 'x'.repeat(RECAP_MAX_BYTES) }
    await expect(
      uploadRecap({ provider: 'onedrive', accessToken: 'x', recap: big }, { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow('bytes of JSON')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('surfaces provider failures without leaking the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response)
    const error = await uploadRecap(
      { provider: 'google-drive', accessToken: 'ya.secret', recap },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    ).catch((e: Error) => e)
    expect(error.message).toBe('Google Drive upload failed (401)')
    expect(error.message).not.toContain('ya.secret')
  })

  it('sanitizes filenames so a hostile name cannot traverse', () => {
    expect(sanitizeRecapFilename('../../etc/recap')).toBe('recap.json')
    expect(sanitizeRecapFilename('..\\windows\\recap')).toBe('recap.json')
    expect(sanitizeRecapFilename('')).toBe('nebu-recap.json')
    expect(sanitizeRecapFilename(undefined)).toBe('nebu-recap.json')
    expect(sanitizeRecapFilename('friday set!')).toBe('friday_set.json')
    expect(sanitizeRecapFilename('set.json')).toBe('set.json')
  })

  it('recognizes exactly the three supported providers', () => {
    expect(isRecapProvider('google-drive')).toBe(true)
    expect(isRecapProvider('onedrive')).toBe(true)
    expect(isRecapProvider('dropbox')).toBe(true)
    expect(isRecapProvider('icloud')).toBe(false)
    expect(isRecapProvider('')).toBe(false)
  })
})
