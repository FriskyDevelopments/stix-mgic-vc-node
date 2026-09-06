import { describe, expect, it } from 'vitest'
import { listMediaFiles, saveMediaFile } from './media-upload'

describe('media-upload', () => {
  const tenant = 'tenant-media-test'

  it('saves an uploaded media file and returns its path and metadata', () => {
    const fakeBuffer = Buffer.from('video-bytes-sample')
    const uploaded = saveMediaFile(tenant, 'clipflow-intro.mp4', fakeBuffer)
    expect(uploaded.id).toBeDefined()
    expect(uploaded.tenantId).toBe(tenant)
    expect(uploaded.name).toBe('clipflow-intro.mp4')
    expect(uploaded.size).toBe(fakeBuffer.length)
    expect(uploaded.path).toContain(tenant)
    expect(uploaded.path).toContain('clipflow-intro')

    const list = listMediaFiles(tenant)
    expect(list.length).toBeGreaterThanOrEqual(1)
    const found = list.find((f) => f.id === uploaded.id)
    expect(found).toBeDefined()
  })
})
